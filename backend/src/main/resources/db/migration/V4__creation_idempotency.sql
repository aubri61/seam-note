-- Successful creation results survive later deletion. No TTL: keys are never recycled.
CREATE TABLE creation_operations (
    operation_id UUID PRIMARY KEY,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('FOLDER_CREATE','NOTE_CREATE')),
    entity_id UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
