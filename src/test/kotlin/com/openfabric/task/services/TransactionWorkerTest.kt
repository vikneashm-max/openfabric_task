package com.openfabric.task.service

import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.data.redis.core.ListOperations
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.web.client.HttpClientErrorException
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional

class TransactionWorkerTest {

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyObj(): T {
        Mockito.any<T>()
        return uninitialized()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> eqObj(obj: T): T {
        Mockito.eq(obj)
        return uninitialized()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> uninitialized(): T = null as T

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
    fun `worker skips processing when outbox record is already claimed by another worker`() {
        val transactionId = "TXN-ALREADY-CLAIMED"
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue"))
            .thenReturn(transactionId)

        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("15.00"),
            currency = "USD",
            description = "Concurrent test",
            transactionTimestamp = Instant.now()
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PENDING,
            attemptCount = 0
        )

        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))

        // Simulate another worker already claiming this outbox record (0 rows updated)
        Mockito.`when`(
            outboxRepository.claimForProcessing(
                eqObj(transactionId),
                eqObj(OutboxStatus.PENDING),
                eqObj(OutboxStatus.PROCESSING),
                anyObj(),
                anyObj()
            )
        ).thenReturn(0)

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.processNextTransaction()

        // Verify that remote posting was NEVER called
        Mockito.verifyNoInteractions(postingGateway)
        Mockito.verify(transactionRepository, Mockito.never()).save(anyObj())
    }

    @Test
    fun `worker processes transaction successfully on remote 200 OK`() {
        val transactionId = "TXN-SUCCESS"
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue")).thenReturn(transactionId)

        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("50.00"),
            currency = "USD",
            description = "Successful post",
            transactionTimestamp = Instant.now()
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PENDING,
            attemptCount = 0
        )

        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))
        Mockito.`when`(
            outboxRepository.claimForProcessing(
                eqObj(transactionId),
                eqObj(OutboxStatus.PENDING),
                eqObj(OutboxStatus.PROCESSING),
                anyObj(),
                anyObj()
            )
        ).thenReturn(1)

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.processNextTransaction()

        Mockito.verify(postingGateway).postTransaction(anyObj())
        assertEquals(TransactionStatus.COMPLETED, transaction.status)
        assertEquals(OutboxStatus.COMPLETED, outbox.status)
        assertNotNull(transaction.completedAt)
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
            outboxRepository.claimForProcessing(
                eqObj(transactionId),
                eqObj(OutboxStatus.PENDING),
                eqObj(OutboxStatus.PROCESSING),
                anyObj(),
                anyObj()
            )
        ).thenReturn(1)

        Mockito.`when`(
            postingGateway.postTransaction(anyObj())
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
            .postTransaction(anyObj())
        Mockito.verify(postingGateway)
            .verifyTransactionExists(transactionId)

        Mockito.verify(transactionRepository, Mockito.times(2))
            .save(anyObj())
        Mockito.verify(outboxRepository, Mockito.times(1))
            .save(anyObj())

        assertEquals(TransactionStatus.COMPLETED, transaction.status)
        assertEquals(OutboxStatus.COMPLETED, outbox.status)
    }

    @Test
    fun `worker resets to PENDING with backoff when remote returns 404 and attempts under 5`() {
        val transactionId = "TXN-RETRY-404"
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue")).thenReturn(transactionId)

        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("30.00"),
            currency = "USD",
            description = "Retry 404 test",
            transactionTimestamp = Instant.now()
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PENDING,
            attemptCount = 1
        )

        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))
        Mockito.`when`(transactionRepository.save(anyObj())).thenAnswer { it.arguments[0] }
        Mockito.`when`(outboxRepository.save(anyObj())).thenAnswer { it.arguments[0] }
        Mockito.`when`(
            outboxRepository.claimForProcessing(
                eqObj(transactionId),
                eqObj(OutboxStatus.PENDING),
                eqObj(OutboxStatus.PROCESSING),
                anyObj(),
                anyObj()
            )
        ).thenReturn(1)

        Mockito.`when`(postingGateway.postTransaction(anyObj()))
            .thenThrow(RuntimeException("Network error on POST"))

        val notFoundException = HttpClientErrorException.create(
            HttpStatus.NOT_FOUND, "Not Found", HttpHeaders.EMPTY, ByteArray(0), null
        )
        Mockito.`when`(postingGateway.verifyTransactionExists(transactionId))
            .thenThrow(notFoundException)

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.processNextTransaction()

        assertEquals(TransactionStatus.PENDING, transaction.status)
        assertEquals(OutboxStatus.PENDING, outbox.status)
        assertNotNull(outbox.nextAttemptAt)
        assertNull(outbox.lockedUntil)
    }

    @Test
    fun `worker marks FAILED when remote returns 404 on attempt 5`() {
        val transactionId = "TXN-EXHAUSTED"
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue")).thenReturn(transactionId)

        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("40.00"),
            currency = "USD",
            description = "Exhausted retry test",
            transactionTimestamp = Instant.now()
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PENDING,
            attemptCount = 5
        )

        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))
        Mockito.`when`(transactionRepository.save(anyObj())).thenAnswer { it.arguments[0] }
        Mockito.`when`(outboxRepository.save(anyObj())).thenAnswer { it.arguments[0] }
        Mockito.`when`(
            outboxRepository.claimForProcessing(
                eqObj(transactionId),
                eqObj(OutboxStatus.PENDING),
                eqObj(OutboxStatus.PROCESSING),
                anyObj(),
                anyObj()
            )
        ).thenReturn(1)

        Mockito.`when`(postingGateway.postTransaction(anyObj()))
            .thenThrow(RuntimeException("Persistent 500 error on POST"))

        val notFoundException = HttpClientErrorException.create(
            HttpStatus.NOT_FOUND, "Not Found", HttpHeaders.EMPTY, ByteArray(0), null
        )
        Mockito.`when`(postingGateway.verifyTransactionExists(transactionId))
            .thenThrow(notFoundException)

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.processNextTransaction()

        assertEquals(TransactionStatus.FAILED, transaction.status)
        assertEquals(OutboxStatus.FAILED, outbox.status)
        assertNull(outbox.lockedUntil)
    }

    @Test
    fun `worker keeps PROCESSING for recovery when remote outcome is uncertain`() {
        val transactionId = "TXN-UNCERTAIN"
        val redis = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOperations = Mockito.mock(ListOperations::class.java)
            as ListOperations<String, String>

        Mockito.`when`(redis.opsForList()).thenReturn(listOperations)
        Mockito.`when`(listOperations.leftPop("transaction:queue")).thenReturn(transactionId)

        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("100.00"),
            currency = "USD",
            description = "Timeout test",
            transactionTimestamp = Instant.now()
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PENDING,
            attemptCount = 1
        )

        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))
        Mockito.`when`(
            outboxRepository.claimForProcessing(
                eqObj(transactionId),
                eqObj(OutboxStatus.PENDING),
                eqObj(OutboxStatus.PROCESSING),
                anyObj(),
                anyObj()
            )
        ).thenReturn(1)

        Mockito.`when`(postingGateway.postTransaction(anyObj()))
            .thenThrow(RuntimeException("Post read timeout"))
        Mockito.`when`(postingGateway.verifyTransactionExists(transactionId))
            .thenThrow(RuntimeException("Get connect timeout"))

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.processNextTransaction()

        assertEquals(TransactionStatus.PROCESSING, transaction.status)
        assertEquals(OutboxStatus.PROCESSING, outbox.status)
        assertNotNull(outbox.lockedUntil)
    }

    @Test
    fun `recovery marks transaction COMPLETED when remote exists`() {
        val transactionId = "TXN-RECOVERED"
        val redis = Mockito.mock(StringRedisTemplate::class.java)
        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("60.00"),
            currency = "USD",
            description = "Recovery exists test",
            transactionTimestamp = Instant.now(),
            status = TransactionStatus.PROCESSING
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PROCESSING,
            lockedUntil = Instant.now().minusSeconds(10)
        )

        Mockito.`when`(outboxRepository.findByStatusAndLockedUntilBefore(eqObj(OutboxStatus.PROCESSING), anyObj()))
            .thenReturn(listOf(outbox))
        Mockito.`when`(outboxRepository.findByStatusAndLockedUntilIsNull(eqObj(OutboxStatus.PROCESSING)))
            .thenReturn(emptyList())
        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))
        Mockito.doNothing().`when`(postingGateway).verifyTransactionExists(transactionId)

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.recoverExpiredTransactions()

        assertEquals(TransactionStatus.COMPLETED, transaction.status)
        assertEquals(OutboxStatus.COMPLETED, outbox.status)
    }

    @Test
    fun `recovery marks transaction FAILED when remote confirms 404`() {
        val transactionId = "TXN-RECOVERY-404"
        val redis = Mockito.mock(StringRedisTemplate::class.java)
        val transactionRepository = Mockito.mock(TransactionRepository::class.java)
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val postingGateway = Mockito.mock(PostingGateway::class.java)

        val transaction = TransactionEntity(
            id = transactionId,
            amount = BigDecimal("70.00"),
            currency = "USD",
            description = "Recovery 404 test",
            transactionTimestamp = Instant.now(),
            status = TransactionStatus.PROCESSING
        )
        val outbox = OutboxEntity(
            transactionId = transactionId,
            status = OutboxStatus.PROCESSING,
            lockedUntil = Instant.now().minusSeconds(10)
        )

        Mockito.`when`(outboxRepository.findByStatusAndLockedUntilBefore(eqObj(OutboxStatus.PROCESSING), anyObj()))
            .thenReturn(listOf(outbox))
        Mockito.`when`(outboxRepository.findByStatusAndLockedUntilIsNull(eqObj(OutboxStatus.PROCESSING)))
            .thenReturn(emptyList())
        Mockito.`when`(transactionRepository.findById(transactionId)).thenReturn(Optional.of(transaction))
        Mockito.`when`(outboxRepository.findById(transactionId)).thenReturn(Optional.of(outbox))

        val notFoundException = HttpClientErrorException.create(
            HttpStatus.NOT_FOUND, "Not Found", HttpHeaders.EMPTY, ByteArray(0), null
        )
        Mockito.`when`(postingGateway.verifyTransactionExists(transactionId))
            .thenThrow(notFoundException)

        val worker = TransactionWorker(redis, transactionRepository, outboxRepository, postingGateway)
        worker.recoverExpiredTransactions()

        assertEquals(TransactionStatus.FAILED, transaction.status)
        assertEquals(OutboxStatus.FAILED, outbox.status)
    }
}
