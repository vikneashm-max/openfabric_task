
package com.openfabric.task.service

import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.data.redis.core.ListOperations
import org.springframework.data.redis.core.StringRedisTemplate
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional

class TransactionWorkerTest {

    @Test
    fun `worker ignores queue entry when transaction is missing`() {
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue"))
            .thenReturn("TXN-MISSING")

        val transactionRepository =
            Mockito.mock(TransactionRepository::class.java)
        val outboxRepository =
            Mockito.mock(OutboxRepository::class.java)

        Mockito.`when`(transactionRepository.findById("TXN-MISSING"))
            .thenReturn(Optional.empty())

        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val worker = TransactionWorker(
            redis,
            transactionRepository,
            outboxRepository,
            postingGateway
        )

        worker.processNextTransaction()

        Mockito.verify(transactionRepository)
            .findById("TXN-MISSING")
        Mockito.verifyNoInteractions(outboxRepository)
        Mockito.verifyNoInteractions(postingGateway)
    }

    @Test
    fun `worker ignores queue entry when outbox is missing`() {
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue"))
            .thenReturn("TXN-NO-OUTBOX")

        val transactionRepository =
            Mockito.mock(TransactionRepository::class.java)
        val outboxRepository =
            Mockito.mock(OutboxRepository::class.java)

        val transaction = TransactionEntity(
            id = "TXN-NO-OUTBOX",
            amount = BigDecimal("10.00"),
            currency = "USD",
            description = "Unit test",
            transactionTimestamp = Instant.now()
        )

        Mockito.`when`(transactionRepository.findById("TXN-NO-OUTBOX"))
            .thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById("TXN-NO-OUTBOX"))
            .thenReturn(Optional.empty())

        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val worker = TransactionWorker(
            redis,
            transactionRepository,
            outboxRepository,
            postingGateway
        )

        worker.processNextTransaction()

        Mockito.verify(transactionRepository)
            .findById("TXN-NO-OUTBOX")
        Mockito.verifyNoInteractions(postingGateway)
    }

    @Test
    fun `worker marks transaction completed when POST fails but remote transaction exists`() {
        val transactionId = "TXN-REMOTE-EXISTS"
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue"))
            .thenReturn(transactionId)

        val transactionRepository =
            Mockito.mock(TransactionRepository::class.java)
        val outboxRepository =
            Mockito.mock(OutboxRepository::class.java)
        val postingGateway =
            Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("25.00"),
            currency = "USD",
            description = "Reconciliation test",
            transactionTimestamp = Instant.now()
        )

        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PENDING,
            attemptCount = 0
        )

        Mockito.`when`(transactionRepository.findById(transactionId))
            .thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId))
            .thenReturn(Optional.of(outbox))

        Mockito.`when`(
            postingGateway.postTransaction(Mockito.anyMap())
        ).thenThrow(RuntimeException("Simulated POST failure"))

        Mockito.doNothing()
            .`when`(postingGateway)
            .verifyTransactionExists(transactionId)

        val worker = TransactionWorker(
            redis,
            transactionRepository,
            outboxRepository,
            postingGateway
        )

        worker.processNextTransaction()

        Mockito.verify(postingGateway)
            .postTransaction(Mockito.anyMap())
        Mockito.verify(postingGateway)
            .verifyTransactionExists(transactionId)

        Mockito.verify(transactionRepository, Mockito.times(2))
            .save(Mockito.any(TransactionEntity::class.java))
        Mockito.verify(outboxRepository, Mockito.times(2))
            .save(Mockito.any(OutboxEntity::class.java))

        assertEquals(TransactionStatus.COMPLETED, transaction.status)
        assertEquals(OutboxStatus.COMPLETED, outbox.status)
    }
}
