CREATE FUNCTION saas_jsonb_nonnegative_integer_object(candidate JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
STRICT
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(candidate) <> 'object' THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM jsonb_each(candidate) AS entry(key, value)
      WHERE CASE
        WHEN jsonb_typeof(value) = 'number' THEN
          (value #>> '{}')::numeric < 0
          OR trunc((value #>> '{}')::numeric) <> (value #>> '{}')::numeric
        ELSE true
      END
    )
  END
$function$;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  normalized_username TEXT NOT NULL UNIQUE CHECK (normalized_username = lower(btrim(normalized_username)) AND length(normalized_username) > 0),
  platform_role TEXT NOT NULL DEFAULT 'user' CHECK (platform_role IN ('user', 'platform_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_normalized_username_idx ON users (normalized_username);

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL CHECK (length(password_hash) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'expert', 'operator', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX organization_members_organization_id_idx ON organization_members (organization_id, role);
CREATE INDEX organization_members_user_id_idx ON organization_members (user_id, created_at);

CREATE TABLE refresh_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) > 0),
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_hash TEXT REFERENCES refresh_sessions (token_hash) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE UNIQUE INDEX refresh_sessions_token_hash_idx ON refresh_sessions (token_hash);
CREATE INDEX refresh_sessions_user_id_active_idx ON refresh_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object') CHECK (saas_jsonb_nonnegative_integer_object(limits)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE features (
  feature_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plan_features (
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES features (feature_key) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_key)
);

CREATE INDEX plan_features_feature_key_idx ON plan_features (feature_key, plan_id);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('plan', 'addon')),
  plan_id TEXT REFERENCES plans (id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing_interval TEXT CHECK (billing_interval IN ('month', 'year')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  features JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(features) = 'array'),
  limits JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object') CHECK (saas_jsonb_nonnegative_integer_object(limits)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'plan' AND plan_id IS NOT NULL) OR (kind = 'addon' AND plan_id IS NULL))
);

CREATE INDEX products_kind_enabled_idx ON products (kind, enabled);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'expired')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  granted_features JSONB NOT NULL CHECK (jsonb_typeof(granted_features) = 'array'),
  granted_limits JSONB NOT NULL CHECK (jsonb_typeof(granted_limits) = 'object') CHECK (saas_jsonb_nonnegative_integer_object(granted_limits)),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX subscriptions_organization_active_idx ON subscriptions (organization_id) WHERE status = 'active';
CREATE INDEX subscriptions_organization_status_idx ON subscriptions (organization_id, status, ends_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) > 0),
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (id, organization_id),
  CHECK ((status = 'paid' AND paid_at IS NOT NULL) OR status <> 'paid')
);

CREATE INDEX orders_organization_id_status_idx ON orders (organization_id, status, created_at DESC);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  product_kind TEXT NOT NULL CHECK (product_kind IN ('plan', 'addon')),
  plan_id_snapshot TEXT REFERENCES plans (id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  unit_amount_fen INTEGER NOT NULL CHECK (unit_amount_fen >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  granted_features JSONB NOT NULL CHECK (jsonb_typeof(granted_features) = 'array'),
  granted_limits JSONB NOT NULL CHECK (jsonb_typeof(granted_limits) = 'object') CHECK (saas_jsonb_nonnegative_integer_object(granted_limits)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, product_id),
  UNIQUE (id, organization_id),
  FOREIGN KEY (order_id, organization_id) REFERENCES orders (id, organization_id) ON DELETE CASCADE,
  CHECK ((product_kind = 'plan' AND plan_id_snapshot IS NOT NULL) OR (product_kind = 'addon' AND plan_id_snapshot IS NULL))
);

CREATE INDEX order_items_organization_order_idx ON order_items (organization_id, order_id);

CREATE FUNCTION enforce_order_item_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  catalog products%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'order item snapshots are immutable' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO catalog FROM products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item product does not exist' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.product_kind IS DISTINCT FROM catalog.kind
    OR NEW.plan_id_snapshot IS DISTINCT FROM catalog.plan_id
    OR NEW.product_name IS DISTINCT FROM catalog.name
    OR NEW.unit_amount_fen IS DISTINCT FROM catalog.amount_fen
    OR NEW.currency IS DISTINCT FROM catalog.currency
    OR NEW.granted_features IS DISTINCT FROM catalog.features
    OR NEW.granted_limits IS DISTINCT FROM catalog.limits THEN
    RAISE EXCEPTION 'order item snapshot does not match catalog product' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER order_items_snapshot_guard
BEFORE INSERT OR UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION enforce_order_item_snapshot();

CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  order_item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  granted_features JSONB NOT NULL CHECK (jsonb_typeof(granted_features) = 'array'),
  granted_limits JSONB NOT NULL CHECK (jsonb_typeof(granted_limits) = 'object') CHECK (saas_jsonb_nonnegative_integer_object(granted_limits)),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_item_id),
  FOREIGN KEY (order_item_id, organization_id) REFERENCES order_items (id, organization_id) ON DELETE RESTRICT,
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at)
);

CREATE INDEX entitlements_organization_id_active_idx ON entitlements (organization_id, expires_at) WHERE status = 'active' AND revoked_at IS NULL;

CREATE TABLE usage_counters (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  counter_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  used_quantity INTEGER NOT NULL DEFAULT 0 CHECK (used_quantity >= 0),
  limit_quantity INTEGER CHECK (limit_quantity IS NULL OR limit_quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, counter_key, window_start),
  CHECK (window_end > window_start)
);

CREATE INDEX usage_counters_organization_window_idx ON usage_counters (organization_id, window_end);

CREATE TABLE payment_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  order_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('pending', 'paid', 'cancelled', 'refunded')),
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id),
  FOREIGN KEY (order_id, organization_id) REFERENCES orders (id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX payment_events_organization_order_idx ON payment_events (organization_id, order_id, created_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) > 0),
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_organization_created_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_actor_user_idx ON audit_logs (actor_user_id, created_at DESC) WHERE actor_user_id IS NOT NULL;

INSERT INTO plans (id, name, description, enabled, limits) VALUES
  ('free', 'Free', 'Essential monitoring for a small organization.', true, '{"aiMonthly":5,"plots":2,"members":1}'::jsonb),
  ('pro', 'Pro', 'Advanced monitoring, AI, analytics, and team collaboration.', true, '{"aiMonthly":100,"plots":20,"members":25}'::jsonb),
  ('enterprise', 'Enterprise', 'Full platform capabilities and private deployment support.', true, '{"aiMonthly":1000,"plots":1000,"members":500}'::jsonb);

INSERT INTO features (feature_key, name) VALUES
  ('monitoring.basic', 'Basic monitoring'),
  ('monitoring.realtime', 'Realtime monitoring'),
  ('ai.diagnosis', 'AI diagnosis'),
  ('digital_twin.advanced', 'Advanced digital twin'),
  ('analytics.advanced', 'Advanced analytics'),
  ('device.control', 'Device control'),
  ('team.members', 'Team members'),
  ('deployment.private', 'Private deployment');

INSERT INTO plan_features (plan_id, feature_key) VALUES
  ('free', 'monitoring.basic'),
  ('pro', 'monitoring.basic'),
  ('pro', 'monitoring.realtime'),
  ('pro', 'ai.diagnosis'),
  ('pro', 'analytics.advanced'),
  ('pro', 'team.members'),
  ('enterprise', 'monitoring.basic'),
  ('enterprise', 'monitoring.realtime'),
  ('enterprise', 'ai.diagnosis'),
  ('enterprise', 'digital_twin.advanced'),
  ('enterprise', 'analytics.advanced'),
  ('enterprise', 'device.control'),
  ('enterprise', 'team.members'),
  ('enterprise', 'deployment.private');

INSERT INTO products (id, kind, plan_id, name, description, amount_fen, currency, billing_interval, enabled, features, limits) VALUES
  ('free', 'plan', 'free', 'Free', 'Essential monitoring for a small organization.', 0, 'CNY', 'month', true, '["monitoring.basic"]'::jsonb, '{"aiMonthly":5,"plots":2,"members":1}'::jsonb),
  ('pro', 'plan', 'pro', 'Pro', 'Advanced monitoring, AI, analytics, and team collaboration.', 9900, 'CNY', 'month', true, '["monitoring.basic","monitoring.realtime","ai.diagnosis","analytics.advanced","team.members"]'::jsonb, '{"aiMonthly":100,"plots":20,"members":25}'::jsonb),
  ('enterprise', 'plan', 'enterprise', 'Enterprise', 'Full platform capabilities and private deployment support.', 99900, 'CNY', 'month', true, '["monitoring.basic","monitoring.realtime","ai.diagnosis","digital_twin.advanced","analytics.advanced","device.control","team.members","deployment.private"]'::jsonb, '{"aiMonthly":1000,"plots":1000,"members":500}'::jsonb),
  ('addon.ai.pro', 'addon', NULL, 'AI Pro Add-on', 'Additional AI diagnosis capacity.', 9900, 'CNY', NULL, true, '["ai.diagnosis"]'::jsonb, '{"aiMonthly":500}'::jsonb);
