package com.openfabric.task.repository

import com.openfabric.task.entity.TransactionEntity
import org.springframework.data.jpa.repository.JpaRepository

interface TransactionRepository :
    JpaRepository<TransactionEntity, String>
