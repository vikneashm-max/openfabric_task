package com.openfabric.task

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling
@SpringBootApplication
class TaskApplication

fun main(args: Array<String>) {
	runApplication<TaskApplication>(*args)
}
