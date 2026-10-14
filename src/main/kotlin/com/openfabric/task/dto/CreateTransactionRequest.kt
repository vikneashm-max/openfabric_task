package com.openfabric.task.dto

import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import java.math.BigDecimal
import java.time.Instant

data class CreateTransactionRequest(
    @field:Pattern(
        regexp = "^[0-9a-fA-F-]{36}$",
        message = "Transaction ID must be a UUID"
    )
    val id: String,

    @field:DecimalMin(
        value = "0.0",
        inclusive = false,
        message = "Amount must be greater than zero"
    )
    val amount: BigDecimal,

    @field:Pattern(
        regexp = "^[A-Z]{3}$",
        message = "Currency must be a three-letter uppercase code"
    )
    val currency: String,

    @field:NotBlank
    @field:Size(max = 255)
    val description: String,

    val timestamp: Instant
)