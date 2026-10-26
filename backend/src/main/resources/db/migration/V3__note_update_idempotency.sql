-- Success ledger intentionally has no Note FK: replay must survive a later physical deletion.
-- No TTL/delete job: successful keys and original results are retained indefinitely.
CREATE TABLE note_update_operations (
    operation_id UUID PRIMARY KEY,
    note_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL CHECK (length(request_hash) = 64),
    response_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
