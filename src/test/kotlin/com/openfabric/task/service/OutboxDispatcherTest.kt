package com.openfabric.task.service

import com.openfabric.task.entity.OutboxEntity
import com.openfabric.task.entity.OutboxStatus
import com.openfabric.task.repository.OutboxRepository
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.data.redis.core.ListOperations
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Instant

class OutboxDispatcherTest {

    @Test
    fun `dispatcher pushes pending records to redis and updates nextAttemptAt`() {
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOps = Mockito.mock(ListOperations::class.java) as ListOperations<String, String>
        Mockito.`when`(redisTemplate.opsForList()).thenReturn(listOps)

        val item1 = OutboxEntity(transactionId = "TXN-1", status = OutboxStatus.PENDING)
        val item2 = OutboxEntity(transactionId = "TXN-2", status = OutboxStatus.PENDING)

        Mockito.`when`(outboxRepository.findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING))
            .thenReturn(listOf(item1, item2))

        val dispatcher = OutboxDispatcher(outboxRepository, redisTemplate)
        dispatcher.dispatchPendingTransactions()

        Mockito.verify(listOps).rightPush("transaction:queue", "TXN-1")
        Mockito.verify(listOps).rightPush("transaction:queue", "TXN-2")
        Mockito.verify(outboxRepository).save(item1)
        Mockito.verify(outboxRepository).save(item2)

        assertNotNull(item1.nextAttemptAt)
        assertTrue(item1.nextAttemptAt!!.isAfter(Instant.now()))
    }

    @Test
    fun `dispatcher skips items with nextAttemptAt in the future`() {
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOps = Mockito.mock(ListOperations::class.java) as ListOperations<String, String>
        Mockito.`when`(redisTemplate.opsForList()).thenReturn(listOps)

        val futureItem = OutboxEntity(
            transactionId = "TXN-FUTURE",
            status = OutboxStatus.PENDING,
            nextAttemptAt = Instant.now().plusSeconds(60)
        )

        Mockito.`when`(outboxRepository.findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING))
            .thenReturn(listOf(futureItem))

        val dispatcher = OutboxDispatcher(outboxRepository, redisTemplate)
        dispatcher.dispatchPendingTransactions()

        Mockito.verifyNoInteractions(listOps)
        Mockito.verify(outboxRepository, Mockito.never()).save(futureItem)
    }

    @Test
    fun `dispatcher handles redis failure gracefully`() {
        val outboxRepository = Mockito.mock(OutboxRepository::class.java)
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val listOps = Mockito.mock(ListOperations::class.java) as ListOperations<String, String>
        Mockito.`when`(redisTemplate.opsForList()).thenReturn(listOps)

        Mockito.`when`(listOps.rightPush(Mockito.anyString(), Mockito.anyString()))
            .thenThrow(RuntimeException("Redis connection failed"))

        val item = OutboxEntity(transactionId = "TXN-ERR", status = OutboxStatus.PENDING)
        Mockito.`when`(outboxRepository.findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING))
            .thenReturn(listOf(item))

        val dispatcher = OutboxDispatcher(outboxRepository, redisTemplate)
        // Should not throw exception
        dispatcher.dispatchPendingTransactions()

        Mockito.verify(outboxRepository, Mockito.never()).save(item)
    }
}
