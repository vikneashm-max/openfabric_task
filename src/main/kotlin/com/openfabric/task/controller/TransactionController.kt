
package com.openfabric.task.controller

import com.openfabric.task.dto.CreateTransactionRequest
import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.service.TransactionService
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
        @RequestBody request: CreateTransactionRequest
    ): ResponseEntity<TransactionEntity> {
        val transaction = transactionService.submitTransaction(request)

        return ResponseEntity
            .status(HttpStatus.ACCEPTED)
            .body(transaction)
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
