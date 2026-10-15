
package com.openfabric.task.service

import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.slf4j.LoggerFactory
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.MediaType
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestClient
import java.time.Instant

@Component
class TransactionWorker(
    private val redisTemplate: StringRedisTemplate,
    private val transactionRepository: TransactionRepository,
    private val outboxRepository: OutboxRepository
) {

    private val logger = LoggerFactory.getLogger(TransactionWorker::class.java)

    private val postingClient = RestClient.builder()
        .baseUrl("http://localhost:8080")
        .build()

    @Scheduled(fixedDelay = 200)
    fun processNextTransaction() {
        val transactionId = redisTemplate.opsForList()
            .leftPop("transaction:queue") ?: return

        val transaction = transactionRepository.findById(transactionId)
            .orElse(null)

        if (transaction == null) {
            logger.error("Transaction {} not found", transactionId)
            return
        }

        val outbox = outboxRepository.findById(transactionId)
            .orElse(null)

        if (outbox == null) {
            logger.error("Outbox record for transaction {} not found", transactionId)
            return
        }

        // Ignore duplicate queue entries and transactions not ready to run.
        if (outbox.status != OutboxStatus.PENDING) {
            return
        }

        val processingStartedAt = Instant.now()

        
        transaction.status = TransactionStatus.PROCESSING
        transaction.attemptCount += 1
        transactionRepository.save(transaction)

        outbox.status = OutboxStatus.PROCESSING
        outbox.attemptCount += 1
        outbox.lockedUntil = processingStartedAt.plusSeconds(30)
        outboxRepository.save(outbox)

        try {
            val payload = mapOf(
                "id" to transaction.id,
                "amount" to transaction.amount,
                "currency" to transaction.currency,
                "description" to transaction.description,
                "timestamp" to transaction.transactionTimestamp.toString()
            )

            postingClient.post()
                .uri("/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .toBodilessEntity()

            markCompleted(transactionId)
        } catch (exception: Exception) {
            logger.error(
                "POST failed for transaction {}. Checking remote status.",
                transactionId,
                exception
            )

            reconcileAfterPostFailure(transactionId, exception)
        }
    }

    private fun markCompleted(transactionId: String) {
        val transaction = transactionRepository.findById(transactionId)
            .orElse(null) ?: return

        val outbox = outboxRepository.findById(transactionId)
            .orElse(null) ?: return

        transaction.status = TransactionStatus.COMPLETED
        transaction.completedAt = Instant.now()
        transaction.lastError = null
        transactionRepository.save(transaction)

        outbox.status = OutboxStatus.COMPLETED
        outbox.lastError = null
        outboxRepository.save(outbox)

        logger.info("Transaction {} completed", transactionId)
    }

    private fun reconcileAfterPostFailure(
        transactionId: String,
        postException: Exception
    ) {
        try {
            // A successful GET means the mock service has this transaction.
            postingClient.get()
                .uri("/transactions/{id}", transactionId)
                .retrieve()
                .toBodilessEntity()

            markCompleted(transactionId)
        } catch (notFound: HttpClientErrorException.NotFound) {
            // Only a confirmed 404 permits another attempt.
            val transaction = transactionRepository.findById(transactionId)
                .orElse(null) ?: return

            val outbox = outboxRepository.findById(transactionId)
                .orElse(null) ?: return

            transaction.lastError = postException.message
            outbox.lastError = postException.message

            if (outbox.attemptCount < 5) {
                transaction.status = TransactionStatus.PENDING
                outbox.status = OutboxStatus.PENDING

                logger.warn(
                    "Transaction {} was not found remotely; attempt {} of 5",
                    transactionId,
                    outbox.attemptCount
                )
            } else {
                transaction.status = TransactionStatus.FAILED
                outbox.status = OutboxStatus.FAILED

                logger.error(
                    "Transaction {} exhausted its attempts",
                    transactionId
                )
            }

            transactionRepository.save(transaction)
            outboxRepository.save(outbox)
        } catch (checkException: Exception) {
            // The remote outcome is uncertain. Do not blindly repeat the POST.
            val transaction = transactionRepository.findById(transactionId)
                .orElse(null)

            val outbox = outboxRepository.findById(transactionId)
                .orElse(null)

            val message =
                "Remote outcome is uncertain: ${checkException.message}"

            if (transaction != null) {
                transaction.status = TransactionStatus.FAILED
                transaction.lastError = message
                transactionRepository.save(transaction)
            }

            if (outbox != null) {
                outbox.status = OutboxStatus.FAILED
                outbox.lastError = message
                outboxRepository.save(outbox)
            }

            logger.error(
                "Unable to verify remote transaction {}. Manual reconciliation may be required.",
                transactionId,
                checkException
            )
        }
    }
    
@Scheduled(fixedDelay = 10000)
fun recoverExpiredTransactions() {
    logger.info("Recovery check started")
    val now = Instant.now()

    val expiredTransactions =
        outboxRepository.findByStatusAndLockedUntilBefore(
            OutboxStatus.PROCESSING,
            now
        )

    
for (outbox in expiredTransactions) {
    val transactionId = outbox.transactionId

    logger.warn(
        "Found expired processing lock for transaction {}",
        transactionId
    )

    try {
        postingClient.get()
            .uri("/transactions/{id}", transactionId)
            .retrieve()
            .toBodilessEntity()

        markCompleted(transactionId)

        logger.info(
            "Recovered transaction {}: it already exists remotely",
            transactionId
        )
    } catch (exception: HttpClientErrorException.NotFound) {
        val transaction = transactionRepository.findById(transactionId)
        .orElse(null) ?: continue

    val currentOutbox = outboxRepository.findById(transactionId)
        .orElse(null) ?: continue

    if (currentOutbox.status != OutboxStatus.PROCESSING) {
        continue
    }

    if (currentOutbox.attemptCount < 5) {
        transaction.status = TransactionStatus.PENDING
        transaction.lastError =
            "Expired processing lock; remote transaction not found"
        transactionRepository.save(transaction)

        currentOutbox.status = OutboxStatus.PENDING
        currentOutbox.lockedUntil = null
        currentOutbox.nextAttemptAt = Instant.now()
        currentOutbox.lastError = transaction.lastError
        outboxRepository.save(currentOutbox)

        logger.warn(
            "Transaction {} reset to PENDING for retry; attempt count {} of 5",
            transactionId,
            currentOutbox.attemptCount
        )
    } else {
        transaction.status = TransactionStatus.FAILED
        transaction.lastError =
            "Maximum attempts reached after expired processing lock"
        transactionRepository.save(transaction)

        currentOutbox.status = OutboxStatus.FAILED
        currentOutbox.lockedUntil = null
        currentOutbox.lastError = transaction.lastError
        outboxRepository.save(currentOutbox)

        logger.error(
            "Transaction {} marked FAILED after reaching maximum attempts",
            transactionId
        )
    }
    } catch (exception: Exception) {
        logger.error(
            "Could not verify remote status for transaction {}. Leaving it unchanged",
            transactionId,
            exception
        )
    }
}

}

}
