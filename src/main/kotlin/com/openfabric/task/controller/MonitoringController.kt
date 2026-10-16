package com.openfabric.task.controller

import com.openfabric.task.dto.MonitoringStatsDto
import com.openfabric.task.dto.SystemHealthDto
import com.openfabric.task.service.MonitoringService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/monitoring")
class MonitoringController(
    private val monitoringService: MonitoringService
) {

    @GetMapping("/stats")
    fun getStats(): ResponseEntity<MonitoringStatsDto> {
        val stats = monitoringService.getStats()
        return ResponseEntity.ok(stats)
    }

    @GetMapping("/health")
    fun getHealth(): ResponseEntity<SystemHealthDto> {
        val health = monitoringService.getHealth()
        return ResponseEntity.ok(health)
    }
}
