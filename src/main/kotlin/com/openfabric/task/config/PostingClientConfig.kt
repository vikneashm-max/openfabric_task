package com.openfabric.task.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.client.RestClient

@Configuration
class PostingClientConfig {

    @Bean
    fun postingClient(): RestClient {
        return RestClient.builder()
            .baseUrl("http://localhost:8080")
            .build()
    }
}