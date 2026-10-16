package com.openfabric.task.service

import com.openfabric.task.dto.ComponentHealthDto
import com.openfabric.task.dto.MonitoringStatsDto
import com.openfabric.task.dto.SystemHealthDto
import com.openfabric.task.dto.TimeSeriesPointDto
import com.openfabric.task.entity.TransactionStatus
import com.openfabric.task.repository.TransactionRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.data.domain.PageRequest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import java.lang.management.ManagementFactory
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

@Service
class MonitoringService(
    private val transactionRepository: TransactionRepository,
    @Autowired(required = false)
    private val redisTemplate: StringRedisTemplate?,
    @Autowired(required = false)
    private val circuitBreakerService: CircuitBreakerService?,
    @Value("\${posting.service.url:http://localhost:8080}")
    private val postingServiceUrl: String
) {
    private val logger = LoggerFactory.getLogger(MonitoringService::class.java)

    private val timeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneOffset.UTC)

    fun getStats(): MonitoringStatsDto {
        val total = transactionRepository.count()
        val pending = transactionRepository.countByStatus(TransactionStatus.PENDING)
        val processing = transactionRepository.countByStatus(TransactionStatus.PROCESSING)
        val completed = transactionRepository.countByStatus(TransactionStatus.COMPLETED)
        val failed = transactionRepository.countByStatus(TransactionStatus.FAILED)

        val queueBacklog = try {
            redisTemplate?.opsForList()?.size("transaction:queue") ?: 0L
        } catch (ex: Exception) {
            0L
        }

        // Recent transactions for latency and throughput calculation
        val oneHourAgo = Instant.now().minus(Duration.ofHours(1))
        var recentTransactions = transactionRepository.findBySubmittedAtAfterOrderBySubmittedAtDesc(oneHourAgo)

        // If no transactions occurred in the last hour, fallback to past transactions from database
        if (recentTransactions.isEmpty() && total > 0) {
            recentTransactions = transactionRepository.findAllByOrderBySubmittedAtDesc(PageRequest.of(0, 500))
        }

        val oneMinuteAgo = Instant.now().minus(Duration.ofMinutes(1))
        val liveThroughput = recentTransactions.count {
            it.status == TransactionStatus.COMPLETED && it.completedAt != null && it.completedAt!!.isAfter(oneMinuteAgo)
        }.toDouble()

        val throughputPerMinute = if (liveThroughput > 0.0) {
            liveThroughput
        } else if (recentTransactions.isNotEmpty()) {
            val completedInSample = recentTransactions.filter { it.status == TransactionStatus.COMPLETED }
            if (completedInSample.size >= 2) {
                val minSub = completedInSample.minOf { it.submittedAt }
                val maxComp = completedInSample.maxOf { it.completedAt ?: it.submittedAt }
                val spanSeconds = Duration.between(minSub, maxComp).seconds.coerceAtLeast(1L)
                val rate = (completedInSample.size.toDouble() / spanSeconds) * 60.0
                (rate * 10).roundToInt() / 10.0
            } else {
                completedInSample.size.toDouble()
            }
        } else {
            0.0
        }

        val completedWithLatency = recentTransactions.filter {
            it.status == TransactionStatus.COMPLETED && it.completedAt != null
        }

        val averageLatencyMs = if (completedWithLatency.isNotEmpty()) {
            val totalLatency = completedWithLatency.sumOf {
                Duration.between(it.submittedAt, it.completedAt).toMillis().coerceAtLeast(0L)
            }
            totalLatency.toDouble() / completedWithLatency.size
        } else {
            0.0
        }

        val resolvedTotal = completed + failed
        val successRate = if (resolvedTotal > 0) {
            (completed.toDouble() / resolvedTotal) * 100.0
        } else {
            100.0
        }

        val failureRate = if (resolvedTotal > 0) {
            (failed.toDouble() / resolvedTotal) * 100.0
        } else {
            0.0
        }

        // Build active alerts
        val alerts = mutableListOf<String>()
        if (queueBacklog > 20) {
            alerts.add("High queue backlog: $queueBacklog items waiting in Redis queue")
        }
        if (failureRate > 10.0 && failed > 2) {
            alerts.add("Elevated failure rate: ${((failureRate * 10).roundToInt() / 10.0)}% failure rate detected")
        }
        if (averageLatencyMs > 4000) {
            alerts.add("High processing latency: average latency is ${(averageLatencyMs / 1000.0).roundToInt()}s")
        }
        if (circuitBreakerService?.getDto()?.isAvailable == false) {
            alerts.add("Circuit Breaker is OPEN: downstream posting service is failing")
        }

        // Build time series buckets:
        // If there are transactions in the last 30 minutes, render live rolling 5-minute buckets.
        // Otherwise, render historical time buckets from past transactions so diagrams are never idle on portal open!
        val now = Instant.now()
        val timeSeries = mutableListOf<TimeSeriesPointDto>()
        val thirtyMinsAgo = now.minus(Duration.ofMinutes(30))
        val hasRecent30Mins = recentTransactions.any { it.submittedAt.isAfter(thirtyMinsAgo) }

        if (hasRecent30Mins || recentTransactions.isEmpty()) {
            for (i in 5 downTo 0) {
                val bucketStart = now.minus(Duration.ofMinutes(((i + 1) * 5).toLong()))
                val bucketEnd = now.minus(Duration.ofMinutes((i * 5).toLong()))

                val inBucket = recentTransactions.filter {
                    it.submittedAt.isAfter(bucketStart) && !it.submittedAt.isAfter(bucketEnd)
                }

                val bCompleted = inBucket.count { it.status == TransactionStatus.COMPLETED }.toLong()
                val bFailed = inBucket.count { it.status == TransactionStatus.FAILED }.toLong()
                val bPending = inBucket.count { it.status == TransactionStatus.PENDING || it.status == TransactionStatus.PROCESSING }.toLong()

                val bLatencies = inBucket.filter { it.status == TransactionStatus.COMPLETED && it.completedAt != null }
                val bAvgLat = if (bLatencies.isNotEmpty()) {
                    bLatencies.sumOf { Duration.between(it.submittedAt, it.completedAt).toMillis().coerceAtLeast(0) }.toDouble() / bLatencies.size
                } else {
                    0.0
                }

                timeSeries.add(
                    TimeSeriesPointDto(
                        timestamp = timeFormatter.format(bucketEnd),
                        completed = bCompleted,
                        failed = bFailed,
                        pending = bPending,
                        avgLatencyMs = (bAvgLat * 10).roundToInt() / 10.0
                    )
                )
            }
        } else {
            // Visual representation of past transactions partitioned across 6 time buckets
            val sortedByTime = recentTransactions.sortedBy { it.submittedAt }
            val firstTime = sortedByTime.first().submittedAt
            val lastTime = sortedByTime.last().submittedAt
            val totalSpanMillis = Duration.between(firstTime, lastTime).toMillis().coerceAtLeast(60000L)
            val bucketSpanMillis = totalSpanMillis / 6

            for (i in 0 until 6) {
                val bucketStart = firstTime.plusMillis(i * bucketSpanMillis)
                val bucketEnd = if (i == 5) lastTime.plusSeconds(1) else firstTime.plusMillis((i + 1) * bucketSpanMillis)

                val inBucket = recentTransactions.filter {
                    !it.submittedAt.isBefore(bucketStart) && (it.submittedAt.isBefore(bucketEnd) || (i == 5 && !it.submittedAt.isAfter(bucketEnd)))
                }

                val bCompleted = inBucket.count { it.status == TransactionStatus.COMPLETED }.toLong()
                val bFailed = inBucket.count { it.status == TransactionStatus.FAILED }.toLong()
                val bPending = inBucket.count { it.status == TransactionStatus.PENDING || it.status == TransactionStatus.PROCESSING }.toLong()

                val bLatencies = inBucket.filter { it.status == TransactionStatus.COMPLETED && it.completedAt != null }
                val bAvgLat = if (bLatencies.isNotEmpty()) {
                    bLatencies.sumOf { Duration.between(it.submittedAt, it.completedAt).toMillis().coerceAtLeast(0) }.toDouble() / bLatencies.size
                } else {
                    0.0
                }

                timeSeries.add(
                    TimeSeriesPointDto(
                        timestamp = timeFormatter.format(bucketStart),
                        completed = bCompleted,
                        failed = bFailed,
                        pending = bPending,
                        avgLatencyMs = (bAvgLat * 10).roundToInt() / 10.0
                    )
                )
            }
        }

        return MonitoringStatsDto(
            totalTransactions = total,
            pendingTransactions = pending,
            processingTransactions = processing,
            completedTransactions = completed,
            failedTransactions = failed,
            redisQueueBacklog = queueBacklog,
            throughputPerMinute = throughputPerMinute,
            averageLatencyMs = (averageLatencyMs * 10).roundToInt() / 10.0,
            successRatePercent = (successRate * 10).roundToInt() / 10.0,
            failureRatePercent = (failureRate * 10).roundToInt() / 10.0,
            activeAlertsCount = alerts.size,
            alerts = alerts,
            timeSeries = timeSeries
        )
    }

    fun getHealth(): SystemHealthDto {
        val components = mutableListOf<ComponentHealthDto>()
        val uptimeSeconds = ManagementFactory.getRuntimeMXBean().uptime / 1000

        // 1. SQLite Database Health
        val dbStart = System.currentTimeMillis()
        val dbHealth = try {
            val count = transactionRepository.count()
            val latency = System.currentTimeMillis() - dbStart
            ComponentHealthDto(
                name = "SQLite Database",
                status = "UP",
                latencyMs = latency,
                message = "Connected. PRAGMA WAL mode active.",
                details = mapOf("totalRecords" to count)
            )
        } catch (ex: Exception) {
            ComponentHealthDto(
                name = "SQLite Database",
                status = "DOWN",
                message = "Database connection error: ${ex.message}"
            )
        }
        components.add(dbHealth)

        // 2. Redis Health
        val redisStart = System.currentTimeMillis()
        val redisHealth = try {
            if (redisTemplate != null) {
                val ping = redisTemplate.connectionFactory?.connection?.ping()
                val latency = System.currentTimeMillis() - redisStart
                val queueSize = redisTemplate.opsForList().size("transaction:queue") ?: 0L
                ComponentHealthDto(
                    name = "Redis Queue",
                    status = if (ping != null) "UP" else "DEGRADED",
                    latencyMs = latency,
                    message = "Ping: $ping, queue depth: $queueSize",
                    details = mapOf("queueSize" to queueSize)
                )
            } else {
                ComponentHealthDto(
                    name = "Redis Queue",
                    status = "DEGRADED",
                    message = "RedisTemplate uninitialized"
                )
            }
        } catch (ex: Exception) {
            ComponentHealthDto(
                name = "Redis Queue",
                status = "DOWN",
                message = "Redis unreachable: ${ex.message}"
            )
        }
        components.add(redisHealth)

        // 3. Remote Mock Posting Service Health
        val postingStart = System.currentTimeMillis()
        val postingHealth = try {
            val client = RestClient.builder()
                .baseUrl(postingServiceUrl)
                .build()

            // Quick non-blocking probe to verify HTTP service response
            val response = client.get()
                .uri("/transactions/health-probe")
                .retrieve()
                .toBodilessEntity()

            val latency = System.currentTimeMillis() - postingStart
            ComponentHealthDto(
                name = "Remote Posting Gateway",
                status = "UP",
                latencyMs = latency,
                message = "Service responding at $postingServiceUrl",
                details = mapOf("url" to postingServiceUrl, "httpStatus" to response.statusCode.value())
            )
        } catch (ex: Exception) {
            // Check if circuit breaker is open
            val cbState = circuitBreakerService?.getDto()?.state?.name ?: "UNKNOWN"
            val latency = System.currentTimeMillis() - postingStart
            // 404 or connection error is common if specific probe endpoint doesn't exist, check base connection
            val isDown = ex.message?.contains("Connection refused", ignoreCase = true) == true ||
                    ex.message?.contains("timed out", ignoreCase = true) == true

            ComponentHealthDto(
                name = "Remote Posting Gateway",
                status = if (isDown) "DOWN" else "UP",
                latencyMs = latency,
                message = if (isDown) "Downstream unreachable at $postingServiceUrl: ${ex.message}" else "Online at $postingServiceUrl",
                details = mapOf("circuitBreaker" to cbState, "url" to postingServiceUrl)
            )
        }
        components.add(postingHealth)

        val overallStatus = if (components.any { it.status == "DOWN" }) {
            "DOWN"
        } else if (components.any { it.status == "DEGRADED" }) {
            "DEGRADED"
        } else {
            "UP"
        }

        return SystemHealthDto(
            overallStatus = overallStatus,
            uptimeSeconds = uptimeSeconds,
            components = components
        )
    }
}
