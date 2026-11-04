-- Internal identity is independent of its login method. OAuth identities follow later.
CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    email_normalized VARCHAR(254) NOT NULL,
    nickname VARCHAR(30) NOT NULL CHECK (length(btrim(nickname)) BETWEEN 2 AND 30),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uk_app_users_email UNIQUE (email_normalized),
    CONSTRAINT app_users_canonical_email CHECK (email_normalized = lower(btrim(email_normalized)))
);
CREATE TABLE password_credentials (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    password_hash VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
