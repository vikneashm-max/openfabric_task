
package com.openfabric.task.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.math.BigDecimal
import java.time.Instant
@Entity
@Table(name = "transactions")
class TransactionEntity(

    @Id
    @Column(length = 36, nullable = false)
    var id: String = "",

    @Column(nullable = false, precision = 19, scale = 4)
    var amount: BigDecimal = BigDecimal.ZERO,

    @Column(nullable = false, length = 3)
    var currency: String = "",

    @Column(nullable = false)
    var description: String = "",

    @Column(name = "transaction_timestamp", nullable = false)
    var transactionTimestamp: Instant = Instant.now(),

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var status: TransactionStatus = TransactionStatus.PENDING,

    @Column(name = "submitted_at", nullable = false)
    var submittedAt: Instant = Instant.now(),

    @Column(name = "completed_at")
    var completedAt: Instant? = null,

    @Column(name = "last_error")
    var lastError: String? = null,

    @Column(name = "attempt_count", nullable = false)
    var attemptCount: Int = 0
)
