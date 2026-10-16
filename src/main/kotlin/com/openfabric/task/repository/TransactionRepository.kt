package com.openfabric.task.repository

import com.openfabric.task.entity.TransactionEntity
import com.openfabric.task.entity.TransactionStatus
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import java.time.Instant

interface TransactionRepository : JpaRepository<TransactionEntity, String> {
    fun findAllByOrderBySubmittedAtDesc(pageable: Pageable): List<TransactionEntity>

    fun findByStatusOrderBySubmittedAtDesc(
        status: TransactionStatus,
        pageable: Pageable
    ): List<TransactionEntity>

    fun countByStatus(status: TransactionStatus): Long

    fun findBySubmittedAtAfterOrderBySubmittedAtDesc(after: Instant): List<TransactionEntity>
}
