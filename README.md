# High-Performance Transaction Processing System

A resilient, high-throughput transaction processing backend built with **Kotlin**, **Spring Boot 4**, **SQLite (WAL mode)**, and **Redis**.

---

## 1. System Architecture & Processing Flow

The system is designed to satisfy a strict sub-100 ms API submission latency requirement while interfacing with an unreliable, slow downstream posting service (which takes 2–10 seconds per request, fails ~5% of the time, and does not support idempotency keys).

### Transaction Lifecycle Workflow

```
[ Client ]
    |
    | 1. POST /api/transactions
    v
[ TransactionController ]
    |
    | 2. submitTransaction()
    v
[ TransactionService ]
    |
    | 3. Atomic local write (SQLite WAL):
    |    - INSERT transactions (status = PENDING)
    |    - INSERT transaction_outbox (status = PENDING)
    v
[ Client ] <-- 202 ACCEPTED (Latency < 20 ms)

--- ASYNCHRONOUS BACKGROUND PROCESSING ---

[ OutboxDispatcher ] (Every 1s)
    |
    | 4. Fetch PENDING outbox records
    | 5. Validate status sync with transactions table
    | 6. LPUSH to Redis queue ('transaction:queue')
    | 7. Update nextAttemptAt (+30s)
    v
[ Redis Queue: transaction:queue ]
    |
    | 8. LPOP transactionId
    v
[ TransactionWorker ] (Every 200ms)
    |
    | 9.  Atomic claim in DB (PENDING -> PROCESSING, lock for 30s)
    | 10. Slow HTTP POST to mock service (2-10s, outside DB transaction)
    |
    +---> SUCCESS (200 OK)
    |       └── markCompleted() -> COMPLETED (DB TX)
    |
    +---> FAILURE / TIMEOUT
            └── reconcileAfterPostFailure()
                  ├── GET /transactions/{id} (Check remote existence)
                  ├── Remote 200 OK  -> markCompleted() (COMPLETED)
                  ├── Remote 404     -> Reset to PENDING with backoff (attempt < 5)
                  |                     or mark FAILED (attempt >= 5)
                  └── Remote Timeout -> Keep PROCESSING; lock expired for recovery

--- RECOVERY MECHANISM ---

[ TransactionWorker.recoverExpiredTransactions ] (Every 10s)
    |
    | Find PROCESSING records where lockedUntil < now
    | Verify remote status via GET /transactions/{id}:
    |   - If found remotely: mark COMPLETED
    |   - If remote confirms 404: mark FAILED (manual review required)
    |   - If check fails/times out: extend lock by +30s for next cycle
```

---

## 2. Core Design Decisions & Guarantees

### A. Sub-100ms Ingestion vs. 2–10s Network Latency
- The HTTP submission endpoint performs **only local database writes** (inserting into `transactions` and `transaction_outbox`).
- No Redis operations, network calls, or remote HTTP requests occur on the submission thread.
- With SQLite configured in WAL mode (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`), ingestion latency is typically under 15 milliseconds.

### B. Transactional Outbox Pattern & At-Least-Once Delivery
- Transaction data and outbox records are committed in the **same local database transaction**.
- The `OutboxDispatcher` reads pending records and pushes them to Redis.
- If Redis is temporarily down, the dispatcher catches the failure, leaves `nextAttemptAt` unmodified, and retries on the next tick without losing transactions.

### C. Concurrency Control & Duplicate Prevention
1. **Idempotent Ingestion**:
   - Submissions with an existing ID and **identical payload** return the existing transaction record with `202 ACCEPTED`.
   - Submissions with an existing ID and **conflicting payload** are rejected with `409 CONFLICT`.
   - SQLite unique primary key constraint prevents duplicate entries under concurrent threads.
2. **Worker Atomic Claiming**:
   - Workers claim records via an atomic conditional SQL update:
     `UPDATE OutboxEntity o SET o.status = 'PROCESSING' WHERE o.transactionId = :id AND o.status = 'PENDING'`
   - If duplicate messages arrive on Redis, only one worker claims the record; all others receive `0` rows updated and skip execution.

### D. Downstream Limitations & Reconciliation Model
- **No Remote Idempotency Keys**: The mock posting service does not accept idempotency keys. Therefore, **blind retries are strictly avoided** to prevent double-charging or duplicate downstream entries.
- **Verification First**: Whenever a `POST` fails (network error, read timeout, 5xx), the worker immediately issues `GET /transactions/{id}` to verify whether the downstream service recorded the transaction.
- **Handling Ambiguity (Two Generals' Problem)**: If remote verification itself times out or fails, the transaction is kept in `PROCESSING` status with an expired lock. The scheduled recovery task reconciles it on subsequent attempts. If downstream confirms 404 during recovery after worker crash, it is marked `FAILED` with `"manual review required"` to protect against duplicate remote side effects.

---

## 3. Configuration Reference (`application.properties`)

| Property | Default Value | Description |
|---|---|---|
| `server.port` | `8081` | Spring Boot application HTTP port |
| `spring.datasource.url` | `jdbc:sqlite:./data/transactions.db` | SQLite database file location |
| `spring.datasource.hikari.maximum-pool-size` | `1` | Serializes DB writes to prevent SQLite lock contention |
| `spring.datasource.hikari.connection-init-sql` | `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000; PRAGMA synchronous=NORMAL;` | Optimizes SQLite for concurrent reads and crash safety |
| `spring.task.scheduling.pool.size` | `3` | Dedicated scheduler threads for dispatcher, worker, and recovery |
| `posting.service.url` | `http://localhost:8080` | Mock remote posting service base URL |
| `posting.service.connect-timeout-ms` | `5000` | HTTP connect timeout |
| `posting.service.read-timeout-ms` | `15000` | HTTP read timeout (safely exceeds 10s max remote delay) |

---

## 4. REST API Specification

### 1. Submit Transaction
- **Method**: `POST`
- **Path**: `/api/transactions`
- **Request Body**:
```json
{
  "id": "c9a4b810-7b5e-4c7a-9a99-0d12e4f01234",
  "amount": 150.50,
  "currency": "USD",
  "description": "Invoice payment #1042",
  "timestamp": "2026-10-16T10:00:00Z"
}
```
- **Responses**:
  - `202 ACCEPTED`: Transaction accepted for processing (or idempotent re-submission).
  - `400 BAD REQUEST`: Validation failure (invalid UUID, non-positive amount, non-3-letter currency, blank description).
  - `409 CONFLICT`: Transaction ID exists with conflicting payload data.

### 2. Query Transaction Status
- **Method**: `GET`
- **Path**: `/api/transactions/{id}`
- **Responses**:
  - `200 OK`: Returns transaction entity (`status`: `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED`).
  - `404 NOT FOUND`: Transaction does not exist.
