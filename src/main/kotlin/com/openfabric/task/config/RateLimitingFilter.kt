package com.openfabric.task.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.openfabric.task.service.RateLimitingService
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 50)
class RateLimitingFilter(
    private val rateLimitingService: RateLimitingService,
    private val objectMapper: ObjectMapper = ObjectMapper()
) : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val uri = request.requestURI
        val isTransactionPost = request.method.equals("POST", ignoreCase = true) &&
                (uri == "/api/transactions" || uri == "/api/transactions/")

        val bypass = request.getHeader("X-Bypass-Rate-Limit")?.equals("true", ignoreCase = true) == true

        if (isTransactionPost && rateLimitingService.isEnabled() && !bypass) {
            if (!rateLimitingService.tryAcquire()) {
                val stats = rateLimitingService.getDto()
                response.status = HttpStatus.TOO_MANY_REQUESTS.value()
                response.contentType = MediaType.APPLICATION_JSON_VALUE
                response.setHeader("Retry-After", "1")
                response.setHeader("X-RateLimit-Limit", stats.limitPerSecond.toString())

                val errorBody = mapOf(
                    "status" to 429,
                    "error" to "Rate limit exceeded. System is configured for maximum ${stats.limitPerSecond} requests/sec. Please retry shortly.",
                    "limitPerSecond" to stats.limitPerSecond,
                    "rejectedCount" to stats.totalRejected
                )

                response.writer.write(objectMapper.writeValueAsString(errorBody))
                return
            }
        }

        filterChain.doFilter(request, response)
    }
}
