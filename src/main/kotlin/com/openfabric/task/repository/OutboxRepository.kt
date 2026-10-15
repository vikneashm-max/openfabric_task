
package com.openfabric.task.repository

import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant
interface OutboxRepository : JpaRepository<OutboxEntity, String> {
    fun findTop100ByStatusOrderByCreatedAtAsc(
        status: OutboxStatus
    ): List<OutboxEntity>
    fun findByStatusAndLockedUntilBefore(
    status: OutboxStatus,
    time: Instant
): List<OutboxEntity>
}

