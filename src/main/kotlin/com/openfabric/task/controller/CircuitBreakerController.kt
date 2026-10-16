package com.openfabric.task.controller

import com.openfabric.task.dto.CircuitBreakerDto
import com.openfabric.task.service.CircuitBreakerService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/circuit-breaker")
class CircuitBreakerController(
    private val circuitBreakerService: CircuitBreakerService
) {

    @GetMapping
    fun getState(): ResponseEntity<CircuitBreakerDto> {
        return ResponseEntity.ok(circuitBreakerService.getDto())
    }

    @PostMapping("/reset")
    fun resetCircuitBreaker(): ResponseEntity<CircuitBreakerDto> {
        circuitBreakerService.reset()
        return ResponseEntity.ok(circuitBreakerService.getDto())
    }

    @PostMapping("/trip")
    fun tripCircuitBreaker(): ResponseEntity<CircuitBreakerDto> {
        circuitBreakerService.trip("Manually triggered by operator from dashboard")
        return ResponseEntity.ok(circuitBreakerService.getDto())
    }
}
