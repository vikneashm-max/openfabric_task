package com.openfabric.task.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.data.redis.core.ListOperations
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.web.client.HttpClientErrorException
import java.math.BigDecimal
import java.time.Instant
import java.util.LinkedList
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["app.scheduling.enabled=false"])
class TransactionEndToEndIntegrationTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var transactionRepository: TransactionRepository

    @Autowired
    private lateinit var outboxRepository: OutboxRepository

    @MockitoBean
    private lateinit var redisTemplate: StringRedisTemplate

    @MockitoBean
    private lateinit var postingGateway: PostingGateway

    @Autowired
    private lateinit var outboxDispatcher: OutboxDispatcher

    @Autowired
    private lateinit var transactionWorker: TransactionWorker

    private val objectMapper = ObjectMapper().findAndRegisterModules()
    private val inMemoryQueue = LinkedList<String>()

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyObj(): T {
        Mockito.any<T>()
        return uninitialized()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> uninitialized(): T = null as T

    @BeforeEach
    fun setupRedisMock() {
        outboxRepository.deleteAll()
        transactionRepository.deleteAll()
        inMemoryQueue.clear()

        @Suppress("UNCHECKED_CAST")
        val listOps = Mockito.mock(ListOperations::class.java) as ListOperations<String, String>

        Mockito.`when`(redisTemplate.opsForList()).thenReturn(listOps)

        Mockito.`when`(listOps.rightPush(Mockito.eq("transaction:queue"), Mockito.anyString()))
            .thenAnswer { invocation ->
                val id = invocation.getArgument<String>(1)
                inMemoryQueue.add(id)
                1L
            }

        Mockito.`when`(listOps.leftPop("transaction:queue"))
            .thenAnswer {
                inMemoryQueue.pollFirst()
            }
    }

    @Test
    fun `full lifecycle happy path submission to dispatch to worker completion`() {
        val txnId = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("150.00"),
            currency = "USD",
            description = "E2E happy path test",
            timestamp = timestamp
        )

        // 1. Submit via REST API
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isAccepted)
            .andExpect(jsonPath("$.id").value(txnId))
            .andExpect(jsonPath("$.status").value("PENDING"))

        // Verify initial DB state
        val initialTx = transactionRepository.findById(txnId).orElse(null)
        assertNotNull(initialTx)
        assertEquals(TransactionStatus.PENDING, initialTx!!.status)

        val initialOutbox = outboxRepository.findById(txnId).orElse(null)
        assertNotNull(initialOutbox)
        assertEquals(OutboxStatus.PENDING, initialOutbox!!.status)

        // 2. Dispatcher pushes to Redis queue
        outboxDispatcher.dispatchPendingTransactions()
        assertEquals(1, inMemoryQueue.size)
        assertEquals(txnId, inMemoryQueue.peek())

        // 3. Worker consumes from Redis queue and posts to remote service
        Mockito.doNothing().`when`(postingGateway).postTransaction(anyObj())

        transactionWorker.processNextTransaction()

        // 4. Verify completed state in DB
        val completedTx = transactionRepository.findById(txnId).orElse(null)
        assertNotNull(completedTx)
        assertEquals(TransactionStatus.COMPLETED, completedTx!!.status)
        assertNotNull(completedTx.completedAt)

        val completedOutbox = outboxRepository.findById(txnId).orElse(null)
        assertNotNull(completedOutbox)
        assertEquals(OutboxStatus.COMPLETED, completedOutbox!!.status)

        // 5. Query REST API GET
        mockMvc.perform(get("/api/transactions/{id}", txnId))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(txnId))
            .andExpect(jsonPath("$.status").value("COMPLETED"))
            .andExpect(jsonPath("$.amount").value(150.00))
            .andExpect(jsonPath("$.currency").value("USD"))
    }

    @Test
    fun `full lifecycle with POST error reconciled by remote GET verification`() {
        val txnId = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("200.00"),
            currency = "EUR",
            description = "E2E reconciliation test",
            timestamp = timestamp
        )

        // 1. Submit via REST API
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        ).andExpect(status().isAccepted)

        // 2. Dispatch
        outboxDispatcher.dispatchPendingTransactions()
        assertEquals(1, inMemoryQueue.size)

        // 3. Simulate remote POST network failure, but remote service DID record it
        Mockito.`when`(postingGateway.postTransaction(anyObj()))
            .thenThrow(RuntimeException("Remote service timed out during POST"))
        Mockito.doNothing().`when`(postingGateway).verifyTransactionExists(txnId)

        transactionWorker.processNextTransaction()

        // 4. Worker should reconcile and mark COMPLETED
        val completedTx = transactionRepository.findById(txnId).orElse(null)
        assertNotNull(completedTx)
        assertEquals(TransactionStatus.COMPLETED, completedTx!!.status)

        val completedOutbox = outboxRepository.findById(txnId).orElse(null)
        assertNotNull(completedOutbox)
        assertEquals(OutboxStatus.COMPLETED, completedOutbox!!.status)
    }

    @Test
    fun `full lifecycle with POST error confirmed 404 triggers backoff retry and eventual completion`() {
        val txnId = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("35.00"),
            currency = "GBP",
            description = "E2E retry test",
            timestamp = timestamp
        )

        // 1. Submit via REST API
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        ).andExpect(status().isAccepted)

        // 2. Dispatch
        outboxDispatcher.dispatchPendingTransactions()

        // 3. First attempt fails on POST and confirms 404 remotely
        Mockito.`when`(postingGateway.postTransaction(anyObj()))
            .thenThrow(RuntimeException("Remote 503 Service Unavailable"))
        val notFoundException = HttpClientErrorException.create(
            HttpStatus.NOT_FOUND, "Not Found", HttpHeaders.EMPTY, ByteArray(0), null
        )
        Mockito.`when`(postingGateway.verifyTransactionExists(txnId))
            .thenThrow(notFoundException)

        transactionWorker.processNextTransaction()

        // Verify status reset to PENDING with backoff
        val retryTx = transactionRepository.findById(txnId).orElse(null)
        assertNotNull(retryTx)
        assertEquals(TransactionStatus.PENDING, retryTx!!.status)

        val retryOutbox = outboxRepository.findById(txnId).orElse(null)
        assertNotNull(retryOutbox)
        assertEquals(OutboxStatus.PENDING, retryOutbox!!.status)
        assertNotNull(retryOutbox.nextAttemptAt)
        assertEquals(1, retryOutbox.attemptCount)

        // 4. Fast forward nextAttemptAt and re-dispatch
        retryOutbox.nextAttemptAt = Instant.now().minusSeconds(1)
        outboxRepository.save(retryOutbox)

        outboxDispatcher.dispatchPendingTransactions()
        assertEquals(1, inMemoryQueue.size)

        // 5. Second attempt succeeds
        Mockito.doNothing().`when`(postingGateway).postTransaction(anyObj())
        transactionWorker.processNextTransaction()

        val finalTx = transactionRepository.findById(txnId).orElse(null)
        assertEquals(TransactionStatus.COMPLETED, finalTx!!.status)
    }

    @Test
    fun `full lifecycle uncertain outcome recovered by scheduled recovery task`() {
        val txnId = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("75.00"),
            currency = "USD",
            description = "E2E uncertain recovery test",
            timestamp = timestamp
        )

        // 1. Submit
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        ).andExpect(status().isAccepted)

        // 2. Dispatch
        outboxDispatcher.dispatchPendingTransactions()

        // 3. Both POST and verification throw connection exception (outcome uncertain)
        Mockito.`when`(postingGateway.postTransaction(anyObj()))
            .thenThrow(RuntimeException("Post connection timeout"))
        Mockito.`when`(postingGateway.verifyTransactionExists(txnId))
            .thenThrow(RuntimeException("Verification read timeout"))

        transactionWorker.processNextTransaction()

        // Verify status remains PROCESSING for recovery
        val uncertainTx = transactionRepository.findById(txnId).orElse(null)
        assertEquals(TransactionStatus.PROCESSING, uncertainTx!!.status)
        val uncertainOutbox = outboxRepository.findById(txnId).orElse(null)
        assertEquals(OutboxStatus.PROCESSING, uncertainOutbox!!.status)

        // 4. Network clears up, scheduled recovery task runs
        Mockito.reset(postingGateway)
        Mockito.doNothing().`when`(postingGateway).verifyTransactionExists(txnId)

        transactionWorker.recoverExpiredTransactions()

        // 5. Transaction is now COMPLETED
        val recoveredTx = transactionRepository.findById(txnId).orElse(null)
        assertEquals(TransactionStatus.COMPLETED, recoveredTx!!.status)
        val recoveredOutbox = outboxRepository.findById(txnId).orElse(null)
        assertEquals(OutboxStatus.COMPLETED, recoveredOutbox!!.status)
    }

    @Test
    fun `scenario 1 - resubmitting identical transaction returns 202 Accepted without duplicate outbox or queue entries`() {
        val txnId = "550e8400-e29b-41d4-a716-446655440000"
        val timestamp = Instant.parse("2026-10-16T10:00:00Z")
        val request = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("500.00"),
            currency = "INR",
            description = "Demo payment",
            timestamp = timestamp
        )

        // 1. First submission
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isAccepted)
            .andExpect(jsonPath("$.id").value(txnId))
            .andExpect(jsonPath("$.status").value("PENDING"))

        // 2. Dispatch and process to COMPLETED
        outboxDispatcher.dispatchPendingTransactions()
        assertEquals(1, inMemoryQueue.size)
        Mockito.doNothing().`when`(postingGateway).postTransaction(anyObj())
        transactionWorker.processNextTransaction()

        val completedTx = transactionRepository.findById(txnId).orElse(null)
        assertNotNull(completedTx)
        assertEquals(TransactionStatus.COMPLETED, completedTx!!.status)

        // Clear in-memory queue to verify no new messages are queued
        inMemoryQueue.clear()

        // 3. Second submission of identical data
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isAccepted)
            .andExpect(jsonPath("$.id").value(txnId))
            .andExpect(jsonPath("$.status").value("COMPLETED"))
            .andExpect(jsonPath("$.amount").value(500.00))
            .andExpect(jsonPath("$.currency").value("INR"))

        // Verify no duplicate outbox entry was created
        val allOutbox = outboxRepository.findAll().filter { it.transactionId == txnId }
        assertEquals(1, allOutbox.size)
        assertEquals(OutboxStatus.COMPLETED, allOutbox[0].status)

        // Dispatcher should have nothing new to push
        outboxDispatcher.dispatchPendingTransactions()
        assertEquals(0, inMemoryQueue.size)
    }

    @Test
    fun `scenario 2 - submitting different data for existing transaction UUID returns 409 Conflict`() {
        val txnId = UUID.randomUUID().toString()
        val timestamp = Instant.parse("2026-10-16T10:00:00Z")
        val originalRequest = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("500.00"),
            currency = "INR",
            description = "Demo payment",
            timestamp = timestamp
        )

        // 1. Initial submission
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(originalRequest))
        ).andExpect(status().isAccepted)

        // 2. Conflicting submissions with modified fields:
        // Case A: Different amount
        val differentAmount = originalRequest.copy(amount = BigDecimal("750.00"))
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(differentAmount))
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("Transaction ID already exists with different data"))

        // Case B: Different currency
        val differentCurrency = originalRequest.copy(currency = "USD")
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(differentCurrency))
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("Transaction ID already exists with different data"))

        // Case C: Different description
        val differentDescription = originalRequest.copy(description = "Fraudulent alteration")
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(differentDescription))
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("Transaction ID already exists with different data"))

        // Case D: Different timestamp (1 hour apart)
        val differentTimestamp = originalRequest.copy(timestamp = timestamp.plusSeconds(3600))
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(differentTimestamp))
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("Transaction ID already exists with different data"))
    }

    @Test
    fun `scenario 3 - submitting transaction with new UUID is accepted normally`() {
        val txnId = UUID.randomUUID().toString()
        val timestamp = Instant.parse("2026-10-16T10:00:00Z")
        val request = CreateTransactionRequest(
            id = txnId,
            amount = BigDecimal("350.00"),
            currency = "EUR",
            description = "New UUID test",
            timestamp = timestamp
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isAccepted)
            .andExpect(jsonPath("$.id").value(txnId))
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.amount").value(350.00))
            .andExpect(jsonPath("$.currency").value("EUR"))

        val txInDb = transactionRepository.findById(txnId).orElse(null)
        assertNotNull(txInDb)
        assertEquals(TransactionStatus.PENDING, txInDb!!.status)

        val outboxInDb = outboxRepository.findById(txnId).orElse(null)
        assertNotNull(outboxInDb)
        assertEquals(OutboxStatus.PENDING, outboxInDb!!.status)
    }
}

