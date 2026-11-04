CREATE TABLE auth_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (expires_at > created_at)
);
CREATE INDEX ix_auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE refresh_credentials (
    token_hash varchar(64) PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
    parent_hash varchar(64) UNIQUE REFERENCES refresh_credentials(token_hash),
    used_at timestamptz
);
CREATE INDEX ix_refresh_credentials_session ON refresh_credentials(session_id);
