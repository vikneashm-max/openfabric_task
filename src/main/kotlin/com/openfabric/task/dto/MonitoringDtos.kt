package com.openfabric.task.dto

import java.time.Instant

data class TimeSeriesPointDto(
    val timestamp: String,
    val completed: Long,
    val failed: Long,
    val pending: Long,
    val avgLatencyMs: Double
)

data class MonitoringStatsDto(
    val totalTransactions: Long,
    val pendingTransactions: Long,
    val processingTransactions: Long,
    val completedTransactions: Long,
    val failedTransactions: Long,
    val redisQueueBacklog: Long,
    val throughputPerMinute: Double,
    val averageLatencyMs: Double,
    val successRatePercent: Double,
    val failureRatePercent: Double,
    val activeAlertsCount: Int,
    val alerts: List<String>,
    val timeSeries: List<TimeSeriesPointDto>
)

data class ComponentHealthDto(
    val name: String,
    val status: String, // "UP" | "DOWN" | "DEGRADED"
    val latencyMs: Long? = null,
    val message: String? = null,
    val details: Map<String, Any> = emptyMap()
)

data class SystemHealthDto(
    val overallStatus: String, // "UP" | "DOWN" | "DEGRADED"
    val timestamp: Instant = Instant.now(),
    val uptimeSeconds: Long,
    val components: List<ComponentHealthDto>
)

enum class CircuitBreakerState {
    CLOSED,
    OPEN,
    HALF_OPEN
}

data class CircuitBreakerDto(
    val state: CircuitBreakerState,
    val failureCount: Int,
    val failureThreshold: Int,
    val successCount: Int,
    val halfOpenSuccessThreshold: Int,
    val resetTimeoutSeconds: Long,
    val lastStateChange: Instant,
    val lastFailureReason: String? = null,
    val isAvailable: Boolean
)

data class RateLimitDto(
    val enabled: Boolean,
    val limitPerSecond: Double,
    val currentRps: Double,
    val totalAccepted: Long,
    val totalRejected: Long,
    val isThrottled: Boolean
)

data class RateLimitConfigDto(
    val limitPerSecond: Double
)
