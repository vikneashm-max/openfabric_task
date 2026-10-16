package com.openfabric.task.controller

import com.openfabric.task.dto.RateLimitConfigDto
import com.openfabric.task.dto.RateLimitDto
import com.openfabric.task.service.RateLimitingService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/rate-limit")
class RateLimitController(
    private val rateLimitingService: RateLimitingService
) {

    @GetMapping
    fun getRateLimitStatus(): ResponseEntity<RateLimitDto> {
        return ResponseEntity.ok(rateLimitingService.getDto())
    }

    @PostMapping("/config")
    fun updateRateLimit(
        @RequestBody config: RateLimitConfigDto
    ): ResponseEntity<RateLimitDto> {
        rateLimitingService.setLimit(config.limitPerSecond)
        return ResponseEntity.ok(rateLimitingService.getDto())
    }
}
