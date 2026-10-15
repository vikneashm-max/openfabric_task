
package com.openfabric.task.repository

import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

interface OutboxRepository : JpaRepository<OutboxEntity, String> {

    fun findTop100ByStatusOrderByCreatedAtAsc(
        status: OutboxStatus
    ): List<OutboxEntity>

    fun findByStatusAndLockedUntilBefore(
        status: OutboxStatus,
        time: Instant
    ): List<OutboxEntity>

    fun findByStatusAndLockedUntilIsNull(
        status: OutboxStatus
    ): List<OutboxEntity>

    @Modifying
    @Transactional
    @Query("""
        UPDATE OutboxEntity o 
        SET o.status = :newStatus, 
            o.attemptCount = o.attemptCount + 1, 
            o.lockedUntil = :lockedUntil, 
            o.workerId = :workerId 
        WHERE o.transactionId = :id AND o.status = :expectedStatus
    """)
    fun claimForProcessing(
        @Param("id") id: String,
        @Param("expectedStatus") expectedStatus: OutboxStatus,
        @Param("newStatus") newStatus: OutboxStatus,
        @Param("lockedUntil") lockedUntil: Instant,
        @Param("workerId") workerId: String
    ): Int
}

