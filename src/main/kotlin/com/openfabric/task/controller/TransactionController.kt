
package com.openfabric.task.controller

import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.service.TransactionService
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/transactions")
class TransactionController(
    private val transactionService: TransactionService
) {

    @PostMapping
    fun submitTransaction(
        @Valid @RequestBody request: CreateTransactionRequest
    ): ResponseEntity<TransactionEntity> {
        val transaction = transactionService.submitTransaction(request)

        return ResponseEntity
            .status(HttpStatus.ACCEPTED)
            .body(transaction)
    }

    @GetMapping
    fun listTransactions(
        @org.springframework.web.bind.annotation.RequestParam(required = false) status: com.openfabric.task.entity.TransactionStatus?,
        @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0") page: Int,
        @org.springframework.web.bind.annotation.RequestParam(defaultValue = "50") limit: Int,
        @org.springframework.web.bind.annotation.RequestParam(required = false) search: String?
    ): ResponseEntity<List<TransactionEntity>> {
        val list = transactionService.listTransactions(status = status, page = page, size = limit, search = search)
        return ResponseEntity.ok(list)
    }

    @GetMapping("/{id}")
    fun getTransaction(
        @PathVariable id: String
    ): ResponseEntity<TransactionEntity> {
        val transaction = transactionService.getTransaction(id)
            ?: return ResponseEntity.notFound().build()

        return ResponseEntity.ok(transaction)
    }
}

