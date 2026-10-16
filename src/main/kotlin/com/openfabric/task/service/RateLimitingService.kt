package com.openfabric.task.service

import com.openfabric.task.dto.RateLimitDto
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.DoubleAdder
import kotlin.math.min

@Service
class RateLimitingService(
    @Value("\${ratelimit.limit-per-second:100.0}")
    private var limitPerSecond: Double = 100.0
) {
    private val logger = LoggerFactory.getLogger(RateLimitingService::class.java)

    private val burstCapacityFactor = 1.5
    private var burstCapacity = limitPerSecond * burstCapacityFactor

    @Volatile
    private var availableTokens = limitPerSecond

    @Volatile
    private var enabled: Boolean = true

    fun isEnabled(): Boolean = enabled

    fun setEnabled(value: Boolean) {
        enabled = value
        logger.info("Rate limiter enabled state changed to: {}", value)
    }

    @Volatile
    private var lastRefillTimestampNanos = System.nanoTime()

    private val totalAccepted = AtomicLong(0)
    private val totalRejected = AtomicLong(0)

    // For sliding 1-second window RPS measurement
    private val currentWindowSeconds = AtomicLong(System.currentTimeMillis() / 1000)
    private val requestsInCurrentWindow = AtomicLong(0)
    private val requestsInPreviousWindow = AtomicLong(0)

    @Synchronized
    fun tryAcquire(): Boolean {
        refillTokens()
        trackRequestRate()

        return if (availableTokens >= 1.0) {
            availableTokens -= 1.0
            totalAccepted.incrementAndGet()
            true
        } else {
            totalRejected.incrementAndGet()
            false
        }
    }

    private fun refillTokens() {
        val now = System.nanoTime()
        val elapsedNanos = now - lastRefillTimestampNanos
        if (elapsedNanos <= 0) return

        val elapsedSeconds = elapsedNanos / 1_000_000_000.0
        val tokensToAdd = elapsedSeconds * limitPerSecond

        availableTokens = min(burstCapacity, availableTokens + tokensToAdd)
        lastRefillTimestampNanos = now
    }

    private fun trackRequestRate() {
        val nowSec = System.currentTimeMillis() / 1000
        val prevSec = currentWindowSeconds.get()

        if (nowSec > prevSec) {
            if (currentWindowSeconds.compareAndSet(prevSec, nowSec)) {
                requestsInPreviousWindow.set(requestsInCurrentWindow.get())
                requestsInCurrentWindow.set(1)
            } else {
                requestsInCurrentWindow.incrementAndGet()
            }
        } else {
            requestsInCurrentWindow.incrementAndGet()
        }
    }

    @Synchronized
    fun setLimit(newLimit: Double) {
        require(newLimit > 0) { "Rate limit must be greater than zero" }
        limitPerSecond = newLimit
        burstCapacity = newLimit * burstCapacityFactor
        availableTokens = min(burstCapacity, availableTokens)
        logger.info("Rate limit dynamically updated to {} req/sec (burst capacity: {})", newLimit, burstCapacity)
    }

    fun getDto(): RateLimitDto {
        val nowSec = System.currentTimeMillis() / 1000
        val currentSec = currentWindowSeconds.get()
        val rps = if (nowSec == currentSec) {
            requestsInCurrentWindow.get().toDouble()
        } else if (nowSec == currentSec + 1) {
            requestsInPreviousWindow.get().toDouble()
        } else {
            0.0
        }

        return RateLimitDto(
            enabled = enabled,
            limitPerSecond = limitPerSecond,
            currentRps = rps,
            totalAccepted = totalAccepted.get(),
            totalRejected = totalRejected.get(),
            isThrottled = availableTokens < 1.0
        )
    }
}
