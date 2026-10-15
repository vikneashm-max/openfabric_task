package com.openfabric.task.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.web.client.RestClient
import java.time.Duration

@Configuration
class PostingClientConfig(
    @Value("\${posting.service.url:http://localhost:8080}")
    private val postingServiceUrl: String,
    @Value("\${posting.service.connect-timeout-ms:5000}")
    private val connectTimeoutMs: Long,
    @Value("\${posting.service.read-timeout-ms:15000}")
    private val readTimeoutMs: Long
) {

    @Bean
    fun postingClient(): RestClient {
        val requestFactory = SimpleClientHttpRequestFactory().apply {
            setConnectTimeout(Duration.ofMillis(connectTimeoutMs))
            setReadTimeout(Duration.ofMillis(readTimeoutMs))
        }

        return RestClient.builder()
            .baseUrl(postingServiceUrl)
            .requestFactory(requestFactory)
            .build()
    }
}