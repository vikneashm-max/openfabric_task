
package com.openfabric.task.service

interface PostingGateway {
    fun postTransaction(payload: Map<String, Any>)

    fun verifyTransactionExists(transactionId: String)
}
