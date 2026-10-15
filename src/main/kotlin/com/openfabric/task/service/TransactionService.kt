
package com.openfabric.task.service

import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.springframework.dao.CannotAcquireLockException
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class TransactionService(
    private val transactionRepository: TransactionRepository,
    private val outboxRepository: OutboxRepository
) {

    @org.springframework.context.annotation.Lazy
    @org.springframework.beans.factory.annotation.Autowired
    private lateinit var self: TransactionService

    fun submitTransaction(
        request: CreateTransactionRequest
    ): TransactionEntity {
        var attempts = 0
        val maxAttempts = 10
        while (true) {
            attempts++
            try {
                return self.persistTransaction(request)
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

    private fun validateMatchesExisting(
        existing: TransactionEntity,
        request: CreateTransactionRequest
    ) {
        require(
            existing.amount.compareTo(request.amount) == 0 &&
            existing.currency == request.currency &&
            existing.description == request.description &&
            (existing.transactionTimestamp == request.timestamp ||
             kotlin.math.abs(existing.transactionTimestamp.toEpochMilli() - request.timestamp.toEpochMilli()) <= 1)
        ) {
            "Transaction ID already exists with different data"
        }
    }
}

