package com.openfabric.task.config

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.TaskScheduler
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.SchedulingConfigurer
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler
import org.springframework.scheduling.config.ScheduledTaskRegistrar

@Configuration
@EnableScheduling
@ConditionalOnProperty(name = ["app.scheduling.enabled"], havingValue = "true", matchIfMissing = true)
class SchedulingConfig(
    @Value("\${spring.task.scheduling.pool.size:3}")
    private val poolSize: Int
) : SchedulingConfigurer {

    private val logger = LoggerFactory.getLogger(SchedulingConfig::class.java)

    @Bean
    fun taskScheduler(): TaskScheduler {
        val scheduler = ThreadPoolTaskScheduler()
        scheduler.poolSize = poolSize
        scheduler.setThreadNamePrefix("task-scheduler-")
        scheduler.setErrorHandler { throwable ->
            logger.warn("Handled exception in scheduled background task: {}", throwable.message)
        }
        scheduler.initialize()
        return scheduler
    }

    override fun configureTasks(taskRegistrar: ScheduledTaskRegistrar) {
        taskRegistrar.setTaskScheduler(taskScheduler())
    }
}
