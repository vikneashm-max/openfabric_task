package com.openfabric.task.performance

import com.fasterxml.jackson.databind.ObjectMapper
import com.openfabric.task.dto.CreateTransactionRequest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import org.junit.jupiter.api.BeforeEach
import org.springframework.test.context.TestPropertySource
import com.openfabric.task.repository.OutboxRepository
import com.openfabric.task.repository.TransactionRepository
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["app.scheduling.enabled=false"])
class TransactionSubmissionLatencyTest {

    private val logger = LoggerFactory.getLogger(TransactionSubmissionLatencyTest::class.java)

    @Autowired
    private lateinit var mockMvc: MockMvc

    @Autowired
    private lateinit var transactionRepository: TransactionRepository

    @Autowired
    private lateinit var outboxRepository: OutboxRepository

    private val objectMapper = ObjectMapper().findAndRegisterModules()

    @BeforeEach
    fun cleanup() {
        outboxRepository.deleteAll()
        transactionRepository.deleteAll()
    }

    @Test
    fun `measure submission endpoint latency percentiles under concurrent load`() {
        val totalRequests = 100
        val concurrency = 5
        val executor = Executors.newFixedThreadPool(concurrency)

        val successCount = AtomicInteger(0)
        val errorCount = AtomicInteger(0)
        val latenciesMs = ConcurrentLinkedQueue<Long>()

        // Warmup: 5 requests
        for (i in 1..5) {
            val warmupId = UUID.randomUUID().toString()
            val warmupReq = CreateTransactionRequest(
                id = warmupId,
                amount = BigDecimal("10.00"),
                currency = "USD",
                description = "Warmup",
                timestamp = Instant.now()
            )
            mockMvc.perform(
                post("/api/transactions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(objectMapper.writeValueAsString(warmupReq))
            ).andExpect(status().isAccepted)
        }

        val tasks = (1..totalRequests).map {
            Callable {
                val txnId = UUID.randomUUID().toString()
                val request = CreateTransactionRequest(
                    id = txnId,
                    amount = BigDecimal("45.50"),
                    currency = "USD",
                    description = "Load test transaction",
                    timestamp = Instant.now()
                )
                val body = objectMapper.writeValueAsString(request)

                val start = System.nanoTime()
                try {
                    val result = mockMvc.perform(
                        post("/api/transactions")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body)
                    ).andReturn()

                    val elapsedMs = (System.nanoTime() - start) / 1_000_000

                    if (result.response.status == 202) {
                        successCount.incrementAndGet()
                        latenciesMs.add(elapsedMs)
                    } else {
                        errorCount.incrementAndGet()
                        logger.error("Submission failed with status {}: {}", result.response.status, result.response.contentAsString)
                    }
                } catch (ex: Exception) {
                    errorCount.incrementAndGet()
                    logger.error("Submission threw exception", ex)
                }
            }
        }

        val overallStart = System.currentTimeMillis()
        val futures = executor.invokeAll(tasks)
        futures.forEach { it.get() }
        val overallElapsedMs = System.currentTimeMillis() - overallStart
        executor.shutdown()

        val sortedLatencies = latenciesMs.sorted()
        val count = sortedLatencies.size

        val p50 = sortedLatencies[(count * 0.50).toInt()]
        val p90 = sortedLatencies[(count * 0.90).toInt()]
        val p95 = sortedLatencies[(count * 0.95).toInt()]
        val p99 = sortedLatencies[(count * 0.99).toInt()]
        val min = sortedLatencies.first()
        val max = sortedLatencies.last()
        val avg = sortedLatencies.average()

        val throughputRps = (totalRequests.toDouble() / overallElapsedMs) * 1000.0

        println("================================================================")
        println("TRANSACTION SUBMISSION LATENCY BENCHMARK RESULTS")
        println("================================================================")
        println("Total Requests:     $totalRequests")
        println("Concurrency:        $concurrency threads")
        println("Success Count:      ${successCount.get()}")
        println("Error Count:        ${errorCount.get()}")
        println("Total Time:         ${overallElapsedMs} ms")
        println("Throughput:         ${"%.2f".format(throughputRps)} req/sec")
        println("Min Latency:        ${min} ms")
        println("Average Latency:    ${"%.2f".format(avg)} ms")
        println("p50 Latency:        ${p50} ms")
        println("p90 Latency:        ${p90} ms")
        println("p95 Latency:        ${p95} ms")
        println("p99 Latency:        ${p99} ms")
        println("Max Latency:        ${max} ms")
        println("Target (<100ms):    ${if (p99 < 100) "MET" else "NOT MET"}")
        println("================================================================")

        assertEquals(100, successCount.get())
        assertEquals(0, errorCount.get())
        assertTrue(p95 < 100, "p95 latency ($p95 ms) should be less than 100 ms")
        assertTrue(p99 < 100, "p99 latency ($p99 ms) should be less than 100 ms")
    }
}
