package com.openfabric.task.service

import com.openfabric.task.dto.CircuitBreakerDto
import com.openfabric.task.dto.CircuitBreakerState
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

@Service
class CircuitBreakerService(
    @Value("\${circuitbreaker.failure-threshold:5}")
    private val failureThreshold: Int = 5,
    @Value("\${circuitbreaker.reset-timeout-seconds:15}")
    private val resetTimeoutSeconds: Long = 15
) {
    private val logger = LoggerFactory.getLogger(CircuitBreakerService::class.java)

    private val state = AtomicReference(CircuitBreakerState.CLOSED)
    private val failureCount = AtomicInteger(0)
    private val successCount = AtomicInteger(0)
    private val halfOpenSuccessThreshold = 2

    @Volatile
    private var lastStateChange: Instant = Instant.now()

    @Volatile
    private var lastFailureReason: String? = null

    fun allowExecution(): Boolean {
        val currentState = state.get()
        return when (currentState) {
            CircuitBreakerState.CLOSED -> true
            CircuitBreakerState.OPEN -> {
                val now = Instant.now()
                if (now.isAfter(lastStateChange.plusSeconds(resetTimeoutSeconds))) {
                    if (state.compareAndSet(CircuitBreakerState.OPEN, CircuitBreakerState.HALF_OPEN)) {
                        lastStateChange = now
                        successCount.set(0)
                        logger.info("Circuit breaker transitioned from OPEN to HALF_OPEN (canary probe)")
                        true
                    } else {
                        state.get() == CircuitBreakerState.HALF_OPEN
                    }
                } else {
                    false
                }
            }
            CircuitBreakerState.HALF_OPEN -> true
        }
    }

    fun recordSuccess() {
        val currentState = state.get()
        if (currentState == CircuitBreakerState.HALF_OPEN) {
            val successes = successCount.incrementAndGet()
            if (successes >= halfOpenSuccessThreshold) {
                if (state.compareAndSet(CircuitBreakerState.HALF_OPEN, CircuitBreakerState.CLOSED)) {
                    lastStateChange = Instant.now()
                    failureCount.set(0)
                    lastFailureReason = null
                    logger.info("Circuit breaker transitioned from HALF_OPEN to CLOSED (recovered)")
                }
            }
        } else if (currentState == CircuitBreakerState.CLOSED) {
            failureCount.set(0)
        }
    }

    fun recordFailure(reason: String? = null) {
        val now = Instant.now()
        lastFailureReason = reason

        val currentState = state.get()
        when (currentState) {
            CircuitBreakerState.HALF_OPEN -> {
                if (state.compareAndSet(CircuitBreakerState.HALF_OPEN, CircuitBreakerState.OPEN)) {
                    lastStateChange = now
                    failureCount.set(failureThreshold)
                    logger.warn("Canary probe failed; circuit breaker transitioned from HALF_OPEN to OPEN. Reason: {}", reason)
                }
            }
            CircuitBreakerState.CLOSED -> {
                val currentFailures = failureCount.incrementAndGet()
                if (currentFailures >= failureThreshold) {
                    if (state.compareAndSet(CircuitBreakerState.CLOSED, CircuitBreakerState.OPEN)) {
                        lastStateChange = now
                        logger.warn(
                            "Circuit breaker tripped to OPEN after {} consecutive failures. Reset in {}s. Reason: {}",
                            currentFailures,
                            resetTimeoutSeconds,
                            reason
                        )
                    }
                }
            }
            CircuitBreakerState.OPEN -> {
                // Already open
            }
        }
    }

    fun reset() {
        state.set(CircuitBreakerState.CLOSED)
        failureCount.set(0)
        successCount.set(0)
        lastStateChange = Instant.now()
        lastFailureReason = null
        logger.info("Circuit breaker manually reset to CLOSED")
    }

    fun trip(reason: String = "Manual operator trip") {
        state.set(CircuitBreakerState.OPEN)
        failureCount.set(failureThreshold)
        lastStateChange = Instant.now()
        lastFailureReason = reason
        logger.warn("Circuit breaker manually tripped to OPEN: {}", reason)
    }

    fun getDto(): CircuitBreakerDto {
        val currentState = state.get()
        return CircuitBreakerDto(
            state = currentState,
            failureCount = failureCount.get(),
            failureThreshold = failureThreshold,
            successCount = successCount.get(),
            halfOpenSuccessThreshold = halfOpenSuccessThreshold,
            resetTimeoutSeconds = resetTimeoutSeconds,
            lastStateChange = lastStateChange,
            lastFailureReason = lastFailureReason,
            isAvailable = currentState != CircuitBreakerState.OPEN
        )
    }
}
