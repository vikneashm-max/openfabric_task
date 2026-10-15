
package com.openfabric.task.service

import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Component
class OutboxDispatcher(
    private val outboxRepository: OutboxRepository,
    private val redisTemplate: StringRedisTemplate,
    private val transactionRepository: TransactionRepository? = null
) {

    private val logger = LoggerFactory.getLogger(OutboxDispatcher::class.java)

    @Scheduled(fixedDelay = 1000)
    fun dispatchPendingTransactions() {
        val pending = outboxRepository
            .findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING)
        logger.info("Dispatcher found {} pending outbox records", pending.size)

        val now = Instant.now()

        for (item in pending) {
            // Don't dispatch a transaction before its retry time.
            if (item.nextAttemptAt?.isAfter(now) == true) {
                continue
            }

            if (transactionRepository != null) {
                val transaction = transactionRepository.findById(item.transactionId).orElse(null)
                if (transaction == null) {
                    logger.error(
                        "Transaction {} not found in database; marking outbox record FAILED",
                        item.transactionId
                    )
                    item.status = OutboxStatus.FAILED
                    item.lastError = "Transaction record not found in database"
                    item.lockedUntil = null
                    item.workerId = null
                    outboxRepository.save(item)
                    continue
                } else if (transaction.status == TransactionStatus.COMPLETED) {
                    logger.warn(
                        "Transaction {} is already COMPLETED; syncing outbox status",
                        item.transactionId
                    )
                    item.status = OutboxStatus.COMPLETED
                    item.lockedUntil = null
                    item.workerId = null
                    outboxRepository.save(item)
                    continue
                } else if (transaction.status == TransactionStatus.FAILED) {
                    logger.warn(
                        "Transaction {} is already FAILED; syncing outbox status",
                        item.transactionId
                    )
                    item.status = OutboxStatus.FAILED
                    item.lockedUntil = null
                    item.workerId = null
                    outboxRepository.save(item)
                    continue
                }
            }

            try {
                redisTemplate.opsForList()
                    .rightPush("transaction:queue", item.transactionId)

                // The worker changes this status when it starts processing.
                // Avoid re-dispatching it while waiting in the worker queue.
                item.nextAttemptAt = now.plusSeconds(30)
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
