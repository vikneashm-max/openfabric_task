package com.openfabric.task.controller

import com.fasterxml.jackson.databind.ObjectMapper
import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.service.TransactionService
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

import org.springframework.test.context.TestPropertySource

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = ["app.scheduling.enabled=false"])
class TransactionControllerTest {

    @Autowired
    private lateinit var mockMvc: MockMvc

    private val objectMapper = com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules()

    @MockitoBean
    private lateinit var transactionService: TransactionService

    @Suppress("UNCHECKED_CAST")
    private fun <T> anyObj(): T {
        Mockito.any<T>()
        return uninitialized()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> uninitialized(): T = null as T

    @Test
    fun `valid transaction submission returns 202 Accepted`() {
        val id = UUID.randomUUID().toString()
        val timestamp = Instant.now()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("125.50"),
            currency = "USD",
            description = "Valid submission test",
            timestamp = timestamp
        )

        val entity = TransactionEntity(
            id = id,
            amount = request.amount,
            currency = request.currency,
            description = request.description,
            transactionTimestamp = timestamp,
            status = TransactionStatus.PENDING,
            submittedAt = Instant.now()
        )

        Mockito.`when`(transactionService.submitTransaction(anyObj()))
            .thenReturn(entity)

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isAccepted)
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.amount").value(125.50))
            .andExpect(jsonPath("$.currency").value("USD"))
    }

    @Test
    fun `submission with invalid UUID returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to "invalid-uuid-format",
            "amount" to 50.0,
            "currency" to "USD",
            "description" to "Invalid ID test",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with zero amount returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to 0.0,
            "currency" to "USD",
            "description" to "Zero amount test",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with negative amount returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to -15.0,
            "currency" to "USD",
            "description" to "Negative amount test",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with invalid currency returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to 25.0,
            "currency" to "usd", // lowercase not allowed
            "description" to "Invalid currency test",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with blank description returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to 25.0,
            "currency" to "USD",
            "description" to "   ",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with malformed JSON returns 400 Bad Request`() {
        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{not a valid json}")
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `reusing ID with different transaction data returns 409 Conflict`() {
        val id = UUID.randomUUID().toString()
        val request = CreateTransactionRequest(
            id = id,
            amount = BigDecimal("99.99"),
            currency = "EUR",
            description = "Different data test",
            timestamp = Instant.now()
        )

        Mockito.`when`(transactionService.submitTransaction(anyObj()))
            .thenThrow(IllegalArgumentException("Transaction ID already exists with different data"))

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request))
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.error").value("Transaction ID already exists with different data"))
    }

    @Test
    fun `get existing transaction returns 200 OK`() {
        val id = UUID.randomUUID().toString()
        val entity = TransactionEntity(
            id = id,
            amount = BigDecimal("75.00"),
            currency = "USD",
            description = "Get transaction test",
            transactionTimestamp = Instant.now(),
            status = TransactionStatus.COMPLETED
        )

        Mockito.`when`(transactionService.getTransaction(id)).thenReturn(entity)

        mockMvc.perform(get("/api/transactions/{id}", id))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.status").value("COMPLETED"))
    }

    @Test
    fun `get non-existent transaction returns 404 Not Found`() {
        val id = UUID.randomUUID().toString()
        Mockito.`when`(transactionService.getTransaction(id)).thenReturn(null)

        mockMvc.perform(get("/api/transactions/{id}", id))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `submission with description exceeding 255 chars returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to 25.0,
            "currency" to "USD",
            "description" to "A".repeat(256),
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with missing amount returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "currency" to "USD",
            "description" to "Missing amount",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with missing currency returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to 50.0,
            "description" to "Missing currency",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with missing id returns 400 Bad Request`() {
        val payload = mapOf(
            "amount" to 50.0,
            "currency" to "USD",
            "description" to "Missing id",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }

    @Test
    fun `submission with four letter currency returns 400 Bad Request`() {
        val payload = mapOf(
            "id" to UUID.randomUUID().toString(),
            "amount" to 50.0,
            "currency" to "USDD",
            "description" to "Four letter currency",
            "timestamp" to Instant.now().toString()
        )

        mockMvc.perform(
            post("/api/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload))
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.error").exists())
    }
}
