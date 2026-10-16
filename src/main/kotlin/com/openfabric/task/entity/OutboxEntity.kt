
package com.openfabric.task.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Index
import jakarta.persistence.Table
import java.time.Instant


enum class OutboxStatus {
    PENDING,
    PROCESSING,
    COMPLETED,
    FAILED
}


@Entity
@Table(
    name = "transaction_outbox",
    indexes = [
        Index(name = "idx_outbox_status_created_at", columnList = "status, createdAt"),
        Index(name = "idx_outbox_status_locked_until", columnList = "status, lockedUntil")
    ]
)
class OutboxEntity(

    @Id
    @Column(name = "transaction_id", nullable = false)
    var transactionId: String = "",

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: OutboxStatus = OutboxStatus.PENDING,

    @Column(nullable = false)
    var attemptCount: Int = 0,

    @Column(nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(nullable = true)
    var nextAttemptAt: Instant? = null,

    @Column(nullable = true)
    var lockedUntil: Instant? = null,

    @Column(nullable = true)
    var workerId: String? = null,

    @Column(nullable = true)
    var lastError: String? = null
)
