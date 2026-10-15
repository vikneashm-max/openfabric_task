
package com.openfabric.task.service

import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

@Component
class HttpPostingGateway(
    private val postingClient: RestClient
) : PostingGateway {

    override fun postTransaction(payload: Map<String, Any>) {
        postingClient.post()
            .uri("/transactions")
            .contentType(MediaType.APPLICATION_JSON)
            .body(payload)
            .retrieve()
            .toBodilessEntity()
    }

    override fun verifyTransactionExists(transactionId: String) {
        postingClient.get()
            .uri("/transactions/{id}", transactionId)
            .retrieve()
            .toBodilessEntity()
    }
}
