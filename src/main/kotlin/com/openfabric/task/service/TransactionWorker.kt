
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
import org.springframework.web.client.HttpClientErrorException
import java.time.Instant

@Component
class TransactionWorker(
    private val redisTemplate: StringRedisTemplate,
    private val transactionRepository: TransactionRepository,
    private val outboxRepository: OutboxRepository,
    private val postingGateway: PostingGateway
) {

    private val logger = LoggerFactory.getLogger(TransactionWorker::class.java)

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
        val workerId = java.util.UUID.randomUUID().toString()
        val lockedUntil = processingStartedAt.plusSeconds(30)

        // Atomically claim the outbox record
        val rowsUpdated = outboxRepository.claimForProcessing(
            transactionId,
            OutboxStatus.PENDING,
            OutboxStatus.PROCESSING,
            lockedUntil,
            workerId
        )

        if (rowsUpdated == 0) {
            logger.warn("Transaction {} already claimed by another worker; skipping", transactionId)
            return
        }

        transaction.status = TransactionStatus.PROCESSING
        transaction.attemptCount += 1
        transactionRepository.save(transaction)

        try {
            val payload = mapOf(
                "id" to transaction.id,
                "amount" to transaction.amount,
                "currency" to transaction.currency,
                "description" to transaction.description,
                "timestamp" to transaction.transactionTimestamp.toString()
            )

            postingGateway.postTransaction(payload)

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

    @Transactional
    fun markCompleted(transactionId: String) {
        val transaction = transactionRepository.findById(transactionId)
            .orElse(null) ?: return

        val outbox = outboxRepository.findById(transactionId)
            .orElse(null) ?: return

        transaction.status = TransactionStatus.COMPLETED
        transaction.completedAt = Instant.now()
        transaction.lastError = null
        transactionRepository.save(transaction)

        outbox.status = OutboxStatus.COMPLETED
        outbox.lockedUntil = null
        outbox.workerId = null
        outbox.lastError = null
        outboxRepository.save(outbox)

        logger.info("Transaction {} completed", transactionId)
    }

    @Transactional
    fun reconcileAfterPostFailure(
        transactionId: String,
        postException: Exception
    ) {
        try {
            // A successful GET means the mock service has this transaction.
            postingGateway.verifyTransactionExists(transactionId)   

            markCompleted(transactionId)
        } catch (notFound: HttpClientErrorException) {
            if (notFound.statusCode != org.springframework.http.HttpStatus.NOT_FOUND) {
                throw notFound
            }
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
                outbox.lockedUntil = null
                outbox.workerId = null
                val backoffSeconds = (2L * outbox.attemptCount).coerceAtLeast(2L)
                outbox.nextAttemptAt = Instant.now().plusSeconds(backoffSeconds)

                logger.warn(
                    "Transaction {} was not found remotely; attempt {} of 5 scheduled with backoff",
                    transactionId,
                    outbox.attemptCount
                )
            } else {
                transaction.status = TransactionStatus.FAILED
                outbox.status = OutboxStatus.FAILED
                outbox.lockedUntil = null
                outbox.workerId = null

                logger.error(
                    "Transaction {} exhausted its attempts",
                    transactionId
                )
            }

            transactionRepository.save(transaction)
            outboxRepository.save(outbox)
        } catch (checkException: Exception) {
            // The remote outcome is uncertain.
            // Keep PROCESSING so the scheduled recovery can check again.
            val transaction = transactionRepository.findById(transactionId)
                .orElse(null)

            val outbox = outboxRepository.findById(transactionId)
                .orElse(null)

            val message =
                "Remote outcome is uncertain: ${checkException.message}"

            if (transaction != null) {
                transaction.status = TransactionStatus.PROCESSING
                transaction.lastError = message
                transactionRepository.save(transaction)
            }

            if (outbox != null) {
                outbox.status = OutboxStatus.PROCESSING
                outbox.lastError = message

                // Allow the recovery scheduler to inspect it again.
                outbox.lockedUntil = Instant.now().minusSeconds(1)
                outboxRepository.save(outbox)
            }

            logger.error(
                "Unable to verify remote transaction {}. Scheduled recovery will check again.",
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

        val missingLockTransactions =
            outboxRepository.findByStatusAndLockedUntilIsNull(
                OutboxStatus.PROCESSING
            )

        val candidates = (expiredTransactions + missingLockTransactions)
            .distinctBy { it.transactionId }

        for (outbox in candidates) {
            val transactionId = outbox.transactionId

            logger.warn(
                "Checking recovery for transaction {}",
                transactionId
            )

            try {
                postingGateway.verifyTransactionExists(transactionId)

                markCompleted(transactionId)

                logger.info(
                    "Recovered transaction {}: it exists remotely",
                    transactionId
                )
            } catch (exception: HttpClientErrorException) {
                if (exception.statusCode != org.springframework.http.HttpStatus.NOT_FOUND) {
                    throw exception
                }
                val transaction = transactionRepository
                    .findById(transactionId)
                    .orElse(null) ?: continue

                val currentOutbox = outboxRepository
                    .findById(transactionId)
                    .orElse(null) ?: continue

                // Do not overwrite a state changed by another worker.
                if (currentOutbox.status != OutboxStatus.PROCESSING) {
                    continue
                }

                transaction.status = TransactionStatus.FAILED
                transaction.lastError =
                    "Remote transaction not found during recovery; manual review required"
                transactionRepository.save(transaction)

                currentOutbox.status = OutboxStatus.FAILED
                currentOutbox.lockedUntil = null
                currentOutbox.workerId = null
                currentOutbox.lastError = transaction.lastError
                outboxRepository.save(currentOutbox)

                logger.error(
                    "Transaction {} marked FAILED because remote absence does not prove that a retry is safe",
                    transactionId
                )
            } catch (exception: Exception) {
                logger.error(
                    "Could not verify remote status for transaction {}. Leaving it unchanged",
                    transactionId,
                    exception
                )
                outbox.lockedUntil = now.plusSeconds(30)
                outboxRepository.save(outbox)
            }
        }
    }
}

