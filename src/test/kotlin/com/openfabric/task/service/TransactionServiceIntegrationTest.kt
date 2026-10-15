package com.openfabric.task.service

import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.Future
import org.junit.jupiter.api.BeforeEach
import org.springframework.test.context.TestPropertySource

@SpringBootTest
@TestPropertySource(properties = ["app.scheduling.enabled=false"])
class TransactionServiceIntegrationTest {

    @Autowired
    private lateinit var transactionService: TransactionService

    @Autowired
    private lateinit var transactionRepository: TransactionRepository

    @Autowired
    private lateinit var outboxRepository: OutboxRepository

    @BeforeEach
    fun cleanup() {
        outboxRepository.deleteAll()
        transactionRepository.deleteAll()
    }

    @Test
    fun `submitTransaction persists both transaction and outbox records in SQLite`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("250.00"),
            currency = "USD",
            description = "Persistence integration test",
            timestamp = timestamp
        )

        val result = transactionService.submitTransaction(request)

        assertEquals(id, result.id)
        assertEquals(TransactionStatus.PENDING, result.status)

        val savedTx = transactionRepository.findById(id).orElse(null)
        assertNotNull(savedTx)
        assertEquals(0, BigDecimal("250.00").compareTo(savedTx!!.amount))
        assertEquals("USD", savedTx.currency)

        val savedOutbox = outboxRepository.findById(id).orElse(null)
        assertNotNull(savedOutbox)
        assertEquals(OutboxStatus.PENDING, savedOutbox!!.status)
        assertEquals(0, savedOutbox.attemptCount)
    }

    @Test
    fun `identical duplicate submission returns existing transaction without duplicating outbox`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("75.00"),
            currency = "EUR",
            description = "Idempotency test",
            timestamp = timestamp
        )

        val first = transactionService.submitTransaction(request)
        val second = transactionService.submitTransaction(request)

        assertEquals(first.id, second.id)
        assertEquals(first.submittedAt.toEpochMilli(), second.submittedAt.toEpochMilli())

        val outboxCount = outboxRepository.findAll().count { it.transactionId == id }
        assertEquals(1, outboxCount)
    }

    @Test
    fun `reusing ID with different amount throws IllegalArgumentException`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request1 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("100.00"),
            currency = "USD",
            description = "Original data",
            timestamp = timestamp
        )
        val request2 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("200.00"), // different amount
            currency = "USD",
            description = "Original data",
            timestamp = timestamp
        )

        transactionService.submitTransaction(request1)

        val exception = assertThrows(IllegalArgumentException::class.java) {
            transactionService.submitTransaction(request2)
        }
        assertTrue(exception.message!!.contains("Transaction ID already exists with different data"))
    }

    @Test
    fun `reusing ID with different currency throws IllegalArgumentException`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request1 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("100.00"),
            currency = "USD",
            description = "Original data",
            timestamp = timestamp
        )
        val request2 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("100.00"),
            currency = "GBP", // different currency
            description = "Original data",
            timestamp = timestamp
        )

        transactionService.submitTransaction(request1)

        val exception = assertThrows(IllegalArgumentException::class.java) {
            transactionService.submitTransaction(request2)
        }
        assertTrue(exception.message!!.contains("Transaction ID already exists with different data"))
    }

    @Test
    fun `concurrent duplicate submissions handle race condition safely without errors`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("300.00"),
            currency = "USD",
            description = "Concurrent duplicate test",
            timestamp = timestamp
        )

        val threadCount = 6
        val executor = Executors.newFixedThreadPool(threadCount)
        val tasks = (1..threadCount).map {
            Callable {
                transactionService.submitTransaction(request)
            }
        }

        val futures: List<Future<*>> = executor.invokeAll(tasks)
        executor.shutdown()

        // All threads should complete without unhandled exception
        val results = futures.map { it.get() }
        assertEquals(threadCount, results.size)

        // All results point to the same transaction
        results.forEach {
            val tx = it as com.openfabric.task.entity.TransactionEntity
            assertEquals(id, tx.id)
            assertEquals(TransactionStatus.PENDING, tx.status)
        }

        // Database should have exactly 1 transaction and 1 outbox record
        val txRecord = transactionRepository.findById(id).orElse(null)
        val outboxRecord = outboxRepository.findById(id).orElse(null)
        assertNotNull(txRecord)
        assertNotNull(outboxRecord)
    }

    @Test
    fun `getTransaction returns entity when present and null when absent`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("12.50"),
            currency = "USD",
            description = "Lookup test",
            timestamp = timestamp
        )

        assertEquals(null, transactionService.getTransaction(id))

        transactionService.submitTransaction(request)

        val found = transactionService.getTransaction(id)
        assertNotNull(found)
        assertEquals(id, found!!.id)
    }

    @Test
    fun `reusing ID with different description throws IllegalArgumentException`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request1 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("50.00"),
            currency = "USD",
            description = "Original description",
            timestamp = timestamp
        )
        val request2 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("50.00"),
            currency = "USD",
            description = "Different description",
            timestamp = timestamp
        )

        transactionService.submitTransaction(request1)

        val exception = assertThrows(IllegalArgumentException::class.java) {
            transactionService.submitTransaction(request2)
        }
        assertTrue(exception.message!!.contains("Transaction ID already exists with different data"))
    }

    @Test
    fun `reusing ID with different timestamp throws IllegalArgumentException`() {
        val id = UUID.randomUUID().toString()
        val timestamp1 = Instant.now()
        val timestamp2 = timestamp1.plusSeconds(3600)
        val request1 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("50.00"),
            currency = "USD",
            description = "Timestamp test",
            timestamp = timestamp1
        )
        val request2 = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("50.00"),
            currency = "USD",
            description = "Timestamp test",
            timestamp = timestamp2
        )

        transactionService.submitTransaction(request1)

        val exception = assertThrows(IllegalArgumentException::class.java) {
            transactionService.submitTransaction(request2)
        }
        assertTrue(exception.message!!.contains("Transaction ID already exists with different data"))
    }

    @Test
    fun `re-submitting identical transaction when status is COMPLETED preserves COMPLETED status`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("88.00"),
            currency = "USD",
            description = "Completed test",
            timestamp = timestamp
        )

        val submitted = transactionService.submitTransaction(request)
        assertEquals(TransactionStatus.PENDING, submitted.status)

        // Simulate transaction completed by worker
        submitted.status = TransactionStatus.COMPLETED
        submitted.completedAt = Instant.now()
        transactionRepository.save(submitted)

        // Resubmit identical request
        val second = transactionService.submitTransaction(request)
        assertEquals(TransactionStatus.COMPLETED, second.status)
        assertEquals(id, second.id)

        // Verify outbox was not duplicated or reset to PENDING
        val outbox = outboxRepository.findById(id).orElse(null)
        assertNotNull(outbox)
        assertEquals(OutboxStatus.PENDING, outbox!!.status)
    }

    @Test
    fun `re-submitting identical transaction when status is FAILED preserves FAILED status`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("99.00"),
            currency = "EUR",
            description = "Failed test",
            timestamp = timestamp
        )

        val submitted = transactionService.submitTransaction(request)
        assertEquals(TransactionStatus.PENDING, submitted.status)

        // Simulate transaction failed after exhausting retries
        submitted.status = TransactionStatus.FAILED
        submitted.lastError = "Exhausted all 5 attempts"
        transactionRepository.save(submitted)

        // Resubmit identical request
        val second = transactionService.submitTransaction(request)
        assertEquals(TransactionStatus.FAILED, second.status)
        assertEquals("Exhausted all 5 attempts", second.lastError)
    }
}
