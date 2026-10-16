
package com.openfabric.task.service

import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.slf4j.LoggerFactory
import org.springframework.dao.CannotAcquireLockException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

@Service
class TransactionService(
    private val transactionRepository: TransactionRepository,
    private val outboxRepository: OutboxRepository
) {

    private val logger = LoggerFactory.getLogger(TransactionService::class.java)

    @org.springframework.context.annotation.Lazy
    @org.springframework.beans.factory.annotation.Autowired
    private var self: TransactionService? = null

    private val transactionalSelf: TransactionService
        get() = self ?: this

    fun submitTransaction(
        request: CreateTransactionRequest
    ): TransactionEntity {
        var attempts = 0
        val maxAttempts = 10
        while (true) {
            attempts++
            try {
                return transactionalSelf.persistTransaction(request)
            } catch (ex: IllegalArgumentException) {
                // If validation failed because data does not match, rethrow immediately (HTTP 409 Conflict)
                throw ex
            } catch (ex: Exception) {
                val existing = transactionRepository.findById(request.id).orElse(null)
                if (existing != null) {
                    validateMatchesExisting(existing, request)
                    return existing
                }

                val isLockOrBusy = ex is CannotAcquireLockException ||
                        ex is org.springframework.transaction.CannotCreateTransactionException ||
                        ex is DataIntegrityViolationException ||
                        ex.javaClass.name.contains("SQLite", ignoreCase = true) ||
                        ex.cause?.javaClass?.name?.contains("SQLite", ignoreCase = true) == true ||
                        ex.cause?.cause?.javaClass?.name?.contains("SQLite", ignoreCase = true) == true ||
                        ex.message?.contains("locked", ignoreCase = true) == true ||
                        ex.message?.contains("busy", ignoreCase = true) == true ||
                        ex.cause?.message?.contains("busy", ignoreCase = true) == true

                if (isLockOrBusy && attempts < maxAttempts) {
                    Thread.sleep((10L * attempts) + (0..15).random())
                    continue
                }

                throw ex
            }
        }
    }

    @Transactional
    fun persistTransaction(
        request: CreateTransactionRequest
    ): TransactionEntity {
        val existing = transactionRepository.findById(request.id)

        if (existing.isPresent) {
            val transaction = existing.get()
            validateMatchesExisting(transaction, request)

            // Ensure an existing transaction also has work recorded.
            if (transaction.status == TransactionStatus.PENDING &&
                !outboxRepository.existsById(request.id)
            ) {
                outboxRepository.save(
                    OutboxEntity(
                        transactionId = request.id,
                        status = OutboxStatus.PENDING,
                        createdAt = Instant.now()
                    )
                )
            }

            return transaction
        }

        val transaction = TransactionEntity(
            id = request.id,
            amount = request.amount,
            currency = request.currency,
            description = request.description,
            transactionTimestamp = request.timestamp,
            status = TransactionStatus.PENDING,
            submittedAt = Instant.now()
        )

        val savedTransaction = transactionRepository.save(transaction)

        // Record the work in SQLite in the same database transaction.
        outboxRepository.save(
            OutboxEntity(
                transactionId = request.id,
                status = OutboxStatus.PENDING,
                createdAt = Instant.now()
            )
        )

        return savedTransaction
    }

    fun getTransaction(id: String): TransactionEntity? {
        return transactionRepository.findById(id).orElse(null)
    }

    fun listTransactions(
        status: TransactionStatus? = null,
        page: Int = 0,
        size: Int = 50,
        search: String? = null
    ): List<TransactionEntity> {
        val pageable = org.springframework.data.domain.PageRequest.of(page.coerceAtLeast(0), size.coerceIn(1, 1000))
        val raw = if (status != null) {
            transactionRepository.findByStatusOrderBySubmittedAtDesc(status, pageable)
        } else {
            transactionRepository.findAllByOrderBySubmittedAtDesc(pageable)
        }

        if (!search.isNullOrBlank()) {
            val q = search.trim().lowercase()
            return raw.filter {
                it.id.lowercase().contains(q) ||
                it.description.lowercase().contains(q) ||
                it.currency.lowercase().contains(q)
            }
        }
        return raw
    }

    private fun validateMatchesExisting(
        existing: TransactionEntity,
        request: CreateTransactionRequest
    ) {
        val amountCompare = existing.amount.compareTo(request.amount)
        val amountMatches = amountCompare == 0
        val currencyMatches = existing.currency.trim().equals(request.currency.trim(), ignoreCase = true)
        val descriptionMatches = existing.description.trim() == request.description.trim()

        val existingInstant = existing.transactionTimestamp
        val requestInstant = request.timestamp

        val existingIso = existingInstant.toString()
        val requestIso = requestInstant.toString()
        val existingEpochMs = existingInstant.toEpochMilli()
        val requestEpochMs = requestInstant.toEpochMilli()
        val timestampDiffMs = kotlin.math.abs(existingEpochMs - requestEpochMs)

        // 1. Direct Instant match or within 1000 ms (covers sub-second truncation in SQLite)
        val directMatch = existingInstant == requestInstant || timestampDiffMs <= 1000L

        // 2. Wall-clock local comparison:
        // SQLite stores timestamps without timezone. When SQLite JDBC or Hibernate parses a date string,
        // it may interpret it in system default timezone or UTC, shifting the epoch millis by the timezone offset.
        val systemZone = ZoneId.systemDefault()
        val requestLocalUtc = requestInstant.atZone(ZoneOffset.UTC).toLocalDateTime()
        val existingLocalSystem = existingInstant.atZone(systemZone).toLocalDateTime()
        val requestLocalSystem = requestInstant.atZone(systemZone).toLocalDateTime()
        val existingLocalUtc = existingInstant.atZone(ZoneOffset.UTC).toLocalDateTime()

        val wallClockMatchA = Duration.between(requestLocalUtc, existingLocalSystem).abs().toMillis() <= 1000L
        val wallClockMatchB = Duration.between(requestLocalSystem, existingLocalUtc).abs().toMillis() <= 1000L

        val systemOffsetMs = systemZone.rules.getOffset(requestInstant).totalSeconds * 1000L
        val offsetDiffMatch = kotlin.math.abs(timestampDiffMs - kotlin.math.abs(systemOffsetMs)) <= 1000L

        val timestampMatches = directMatch || wallClockMatchA || wallClockMatchB || offsetDiffMatch

        if (!amountMatches) {
            logger.warn(
                "Idempotency validation failed for transaction {}: AMOUNT mismatch. Existing: {}, Request: {}, compareTo: {}",
                existing.id, existing.amount, request.amount, amountCompare
            )
        }
        if (!currencyMatches) {
            logger.warn(
                "Idempotency validation failed for transaction {}: CURRENCY mismatch. Existing: '{}', Request: '{}'",
                existing.id, existing.currency, request.currency
            )
        }
        if (!descriptionMatches) {
            logger.warn(
                "Idempotency validation failed for transaction {}: DESCRIPTION mismatch. Existing: '{}', Request: '{}'",
                existing.id, existing.description, request.description
            )
        }
        if (!timestampMatches) {
            logger.warn(
                "Idempotency validation failed for transaction {}: TIMESTAMP mismatch. Existing ISO: {}, Request ISO: {}, Existing EpochMs: {}, Request EpochMs: {}, DiffMs: {}, SystemOffsetMs: {}",
                existing.id, existingIso, requestIso, existingEpochMs, requestEpochMs, timestampDiffMs, systemOffsetMs
            )
        }

        if (!amountMatches || !currencyMatches || !descriptionMatches || !timestampMatches) {
            throw IllegalArgumentException("Transaction ID already exists with different data")
        }
    }
}

