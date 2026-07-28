import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL('../../server/saas/db/migrations/001_saas_foundation.sql', import.meta.url));
const emailIdentityMigrationPath = fileURLToPath(new URL('../../server/saas/db/migrations/002_email_identity.sql', import.meta.url));
const coreTables = [
  'users',
  'user_credentials',
  'organizations',
  'organization_members',
  'refresh_sessions',
  'plans',
  'features',
  'plan_features',
  'products',
  'subscriptions',
  'entitlements',
  'usage_counters',
  'orders',
  'order_items',
  'payment_events',
  'audit_logs',
] as const;

describe('SaaS foundation migration', () => {
  it('defines the complete constrained tenant schema', async () => {
    const sql = await migrationSql();

    for (const table of coreTables) {
      expect(sql, `missing ${table}`).toMatch(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\b`, 'i'));
    }

    const users = tableDefinition(sql, 'users');
    const credentials = tableDefinition(sql, 'user_credentials');
    expect(users).not.toMatch(/password|credential|hash/i);
    expect(credentials).toMatch(/password_hash\s+text\s+not\s+null/i);
    expect(sql).toMatch(/unique\s*\(\s*organization_id\s*,\s*idempotency_key\s*\)/i);
    expect(sql).toMatch(/timestamp(?:tz|\s+with\s+time\s+zone)/i);
    expect(sql).toMatch(/platform_role\s+text[\s\S]*check\s*\(\s*platform_role\s+in\s*\(\s*'user'\s*,\s*'platform_admin'/i);
    expect(sql).toMatch(/role\s+text[\s\S]*'owner'[\s\S]*'admin'[\s\S]*'expert'[\s\S]*'operator'[\s\S]*'viewer'/i);
    expect(sql).toMatch(/status\s+text[\s\S]*'pending'[\s\S]*'paid'[\s\S]*'cancelled'[\s\S]*'refunded'/i);
    expect(sql).toMatch(/amount_fen\s+integer\s+not\s+null[\s\S]*check\s*\(\s*amount_fen\s*>=\s*0\s*\)/i);
    expect(sql).toMatch(/quantity\s+integer\s+not\s+null[\s\S]*check\s*\(\s*quantity\s*>\s*0\s*\)/i);
    expect(sql).toMatch(/create\s+function\s+saas_jsonb_nonnegative_integer_object/i);
    for (const table of ['plans', 'products']) {
      expect(tableDefinition(sql, table)).toMatch(/saas_jsonb_nonnegative_integer_object\s*\(\s*limits\s*\)/i);
    }

    for (const table of ['organization_members', 'subscriptions', 'entitlements', 'usage_counters', 'orders', 'payment_events', 'audit_logs']) {
      expect(tableDefinition(sql, table), `${table} must be tenant-bound`).toMatch(/organization_id\s+text\s+not\s+null/i);
    }
    expect(tableDefinition(sql, 'order_items')).toMatch(/organization_id\s+text\s+not\s+null/i);
  });

  it('seeds only approved catalog data and no credentials', async () => {
    const sql = await migrationSql();

    expect(sql).not.toMatch(/insert\s+into\s+(?:users|user_credentials|organization_members)/i);
    expect(sql).toMatch(/insert\s+into\s+plans/i);
    for (const plan of ['free', 'pro', 'enterprise']) expect(sql).toMatch(new RegExp(`'${plan}'`, 'i'));
    for (const feature of [
      'monitoring.basic', 'monitoring.realtime', 'ai.diagnosis', 'digital_twin.advanced',
      'analytics.advanced', 'device.control', 'team.members', 'deployment.private',
    ]) expect(sql).toContain(`'${feature}'`);
    expect(sql).toMatch(/'addon\.ai\.pro'[\s\S]*'addon'[\s\S]*9900[\s\S]*'CNY'[\s\S]*true/i);
    expect(sql).toMatch(/'free'[\s\S]*'plan'/i);
    expect(sql).toMatch(/'pro'[\s\S]*'plan'/i);
    expect(sql).toMatch(/'enterprise'[\s\S]*'plan'/i);
  });

  it('stores immutable order-item grant snapshots', async () => {
    const sql = await migrationSql();
    const item = tableDefinition(sql, 'order_items');
    const subscription = tableDefinition(sql, 'subscriptions');

    expect(item).toMatch(/product_kind\s+text\s+not\s+null/i);
    expect(item).toMatch(/plan_id_snapshot\s+text/i);
    expect(item).toMatch(/unit_amount_fen\s+integer\s+not\s+null/i);
    expect(item).toMatch(/quantity\s+integer\s+not\s+null/i);
    expect(item).toMatch(/granted_features\s+jsonb\s+not\s+null/i);
    expect(item).toMatch(/granted_limits\s+jsonb\s+not\s+null/i);
    expect(item).toMatch(/check\s*\(\s*jsonb_typeof\s*\(\s*granted_features\s*\)\s*=\s*'array'\s*\)/i);
    expect(item).toMatch(/check\s*\(\s*jsonb_typeof\s*\(\s*granted_limits\s*\)\s*=\s*'object'\s*\)/i);
    expect(item).toMatch(/saas_jsonb_nonnegative_integer_object\s*\(\s*granted_limits\s*\)/i);
    expect(subscription).toMatch(/granted_features\s+jsonb\s+not\s+null/i);
    expect(subscription).toMatch(/granted_limits\s+jsonb\s+not\s+null/i);
    expect(subscription).toMatch(/saas_jsonb_nonnegative_integer_object\s*\(\s*granted_limits\s*\)/i);
    expect(sql).toMatch(/create\s+function\s+enforce_order_item_snapshot\s*\(\s*\)/i);
    expect(sql).toMatch(/if\s+tg_op\s*=\s*'UPDATE'[\s\S]*order item snapshots are immutable/i);
    expect(sql).toMatch(/new\.product_kind\s+is\s+distinct\s+from\s+catalog\.kind/i);
    expect(sql).toMatch(/new\.unit_amount_fen\s+is\s+distinct\s+from\s+catalog\.amount_fen/i);
    expect(sql).toMatch(/new\.granted_features\s+is\s+distinct\s+from\s+catalog\.features/i);
    expect(sql).toMatch(/new\.granted_limits\s+is\s+distinct\s+from\s+catalog\.limits/i);
    expect(sql).toMatch(/create\s+trigger\s+order_items_snapshot_guard[\s\S]*before\s+insert\s+or\s+update\s+on\s+order_items/i);
  });

  it('defines indexes for authentication, tenant, order, and entitlement lookups', async () => {
    const sql = await migrationSql();

    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]*users[\s\S]*normalized_username/i);
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]*refresh_sessions[\s\S]*token_hash/i);
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]*organization_members[\s\S]*organization_id/i);
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]*orders[\s\S]*organization_id/i);
    expect(sql).toMatch(/create\s+(?:unique\s+)?index[\s\S]*entitlements[\s\S]*organization_id/i);
  });
});

describe('email identity migration', () => {
  it('backfills normalized verified email identity without removing username compatibility', async () => {
    const sql = await readFile(emailIdentityMigrationPath, 'utf8');

    expect(sql).toMatch(/alter\s+table\s+users\s+add\s+column\s+normalized_email\s+text/i);
    expect(sql).toMatch(/alter\s+table\s+users\s+add\s+column\s+display_name\s+text/i);
    expect(sql).toMatch(/alter\s+table\s+users\s+add\s+column\s+email_verified_at\s+timestamptz/i);
    expect(sql).toMatch(/alter\s+table\s+users\s+add\s+column\s+account_status\s+text\s+not\s+null\s+default\s+'active'/i);
    expect(sql).toMatch(/row_number\s*\(\s*\)\s+over\s*\(\s*order\s+by\s+id\s*\)/i);
    expect(sql).toMatch(/'legacy\+'\s*\|\|[\s\S]*'@legacy\.invalid'/i);
    expect(sql).toMatch(/normalized_username[\s\S]*~[\s\S]*@[\s\S]*\\\.[\s\S]*not\s+like\s+'%@legacy\.invalid'/i);
    expect(sql).toMatch(/display_name\s*=\s*normalized_username/i);
    expect(sql).toMatch(/email_verified_at\s*=\s*null/i);
    expect(sql).toMatch(/raise\s+exception[\s\S]*duplicate\s+normalized_email/i);
    expect(sql).toMatch(/alter\s+table\s+users\s+alter\s+column\s+normalized_email\s+set\s+not\s+null/i);
    expect(sql).toMatch(/alter\s+table\s+users\s+alter\s+column\s+display_name\s+set\s+not\s+null/i);
    expect(sql).toMatch(/users_normalized_email_format[\s\S]*normalized_email\s*=\s*lower\s*\(\s*btrim\s*\(\s*normalized_email\s*\)\s*\)[\s\S]*normalized_email\s+like\s+'%_@_%\.__%'/i);
    expect(sql).toMatch(/users_account_status[\s\S]*account_status\s+in\s*\(\s*'active'\s*,\s*'disabled'\s*\)/i);
    expect(sql).toMatch(/create\s+unique\s+index\s+users_normalized_email_idx\s+on\s+users\s*\(\s*normalized_email\s*\)/i);
    expect(sql).not.toMatch(/drop\s+column\s+normalized_username/i);
  });
});

async function migrationSql(): Promise<string> {
  return readFile(migrationPath, 'utf8');
}

function tableDefinition(sql: string, table: string): string {
  const match = sql.match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  expect(match, `missing parseable definition for ${table}`).not.toBeNull();
  return match?.[1] ?? '';
}
