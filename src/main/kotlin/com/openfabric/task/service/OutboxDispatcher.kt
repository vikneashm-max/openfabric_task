
package com.openfabric.task.service

import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.repository.OutboxRepository
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Component
class OutboxDispatcher(
    private val outboxRepository: OutboxRepository,
    private val redisTemplate: StringRedisTemplate
) {

    private val logger = LoggerFactory.getLogger(OutboxDispatcher::class.java)

    @Scheduled(fixedDelay = 1000)
    @Transactional
    fun dispatchPendingTransactions() {
        val pending = outboxRepository
            .findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING)
        logger.info("Dispatcher found {} pending outbox records", pending.size)

        val now = Instant.now()

        for (item in pending) {
            // Don't dispatch a transaction before its retry time.
            if (item.nextAttemptAt != null && item.nextAttemptAt!!.isAfter(now)) {
                continue
            }

            try {
                redisTemplate.opsForList()
                    .rightPush("transaction:queue", item.transactionId)

                // The worker changes this status when it starts processing.
                // Avoid re-dispatching it during the short worker polling window.
                item.nextAttemptAt = now.plusSeconds(5)
                outboxRepository.save(item)

                logger.info(
                    "Transaction {} queued for processing",
                    item.transactionId
                )
            } catch (exception: Exception) {
                logger.error(
                    "Could not queue transaction {}",
                    item.transactionId,
                    exception
                )
                break
            }
        }
    }
}
