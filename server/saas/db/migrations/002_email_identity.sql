ALTER TABLE users ADD COLUMN normalized_email TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';

WITH ranked_legacy_users AS (
  SELECT
    id,
    normalized_username,
    row_number() OVER (ORDER BY id) AS legacy_number
  FROM users
),
backfilled_identities AS (
  SELECT
    id,
    CASE
      WHEN lower(btrim(normalized_username)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        AND lower(btrim(normalized_username)) NOT LIKE '%@legacy.invalid'
        THEN lower(btrim(normalized_username))
      ELSE 'legacy+' || legacy_number::text || '@legacy.invalid'
    END AS normalized_email
  FROM ranked_legacy_users
)
UPDATE users AS target
SET normalized_email = identity.normalized_email,
    display_name = normalized_username,
    email_verified_at = NULL
FROM backfilled_identities AS identity
WHERE identity.id = target.id;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT normalized_email
    FROM users
    GROUP BY normalized_email
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'email identity migration produced duplicate normalized_email values';
  END IF;
END
$migration$;

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
