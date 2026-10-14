
package com.openfabric.task.service

import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.TransactionRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class TransactionService(
    private val transactionRepository: TransactionRepository
) {

    @Transactional
    fun submitTransaction(
        request: CreateTransactionRequest
    ): TransactionEntity {

        val existing = transactionRepository.findById(request.id)

        if (existing.isPresent) {
            val transaction = existing.get()

            require(
                transaction.amount.compareTo(request.amount) == 0 &&
                transaction.currency == request.currency &&
                transaction.description == request.description &&
                transaction.transactionTimestamp == request.timestamp
            ) {
                "Transaction ID already exists with different data"
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

        return transactionRepository.save(transaction)
    }

    fun getTransaction(id: String): TransactionEntity? {
        return transactionRepository.findById(id).orElse(null)
    }
}
