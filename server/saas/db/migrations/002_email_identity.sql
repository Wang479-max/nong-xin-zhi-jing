ALTER TABLE users ADD COLUMN normalized_email TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';

UPDATE users
SET normalized_email = CASE
      WHEN normalized_username LIKE '%@%' THEN lower(btrim(normalized_username))
      ELSE lower(btrim(normalized_username)) || '@legacy.invalid'
    END,
    display_name = normalized_username,
    email_verified_at = created_at;

ALTER TABLE users ALTER COLUMN normalized_email SET NOT NULL;
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_normalized_email_format
  CHECK (
    normalized_email = lower(btrim(normalized_email))
    AND normalized_email LIKE '%_@_%.__%'
  );
ALTER TABLE users ADD CONSTRAINT users_account_status
  CHECK (account_status IN ('active', 'disabled'));

CREATE UNIQUE INDEX users_normalized_email_idx ON users(normalized_email);
