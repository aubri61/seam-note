CREATE TABLE external_identities (
    issuer varchar(255) NOT NULL,
    subject varchar(255) NOT NULL,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(issuer,subject),
    UNIQUE(user_id,issuer)
);
