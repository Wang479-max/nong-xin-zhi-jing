# SaaS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prototype authentication and client-trusted commerce with a tested modular SaaS foundation backed by PostgreSQL, while preserving the existing UI and legacy business modules during migration.

**Architecture:** Add a self-contained `server/saas` module mounted at `/api/v1`. Domain services depend on repository interfaces, so Vitest uses an in-memory repository and production uses PostgreSQL. The existing Express application mounts the new router before legacy routes; frontend authentication and entitlement reads move to v1 first, then legacy business endpoints are progressively protected by the same identity and entitlement middleware.

**Tech Stack:** TypeScript, Express 4, PostgreSQL (`pg`), Redis, bcryptjs, JSON Web Tokens, Zod, Vitest, Supertest, React 19.

---

## Scope decomposition

This plan implements the first independently deployable subsystem: identity, organizations, entitlements, catalog and idempotent mock ordering. Follow-up plans migrate farms/devices/AI data, build the platform operations console, and enable production payment providers. The first subsystem is complete only when existing users can register/login through the new API and paid modules are enforced server-side.

## File map

- `server/saas/config.ts`: validates required SaaS environment variables.
- `server/saas/types.ts`: stable domain and authenticated-request types.
- `server/saas/repository.ts`: persistence contract shared by services.
- `server/saas/memoryRepository.ts`: deterministic test repository.
- `server/saas/db/migrations/001_saas_foundation.sql`: production schema and catalog seed.
- `server/saas/db/pool.ts`: PostgreSQL pool construction.
- `server/saas/db/migrate.ts`: ordered migration runner.
- `server/saas/db/pgRepository.ts`: PostgreSQL implementation.
- `server/saas/auth/service.ts`: password and token lifecycle.
- `server/saas/auth/middleware.ts`: bearer/cookie authentication.
- `server/saas/entitlements/service.ts`: feature and quota resolution.
- `server/saas/billing/service.ts`: server-priced idempotent orders and mock settlement.
- `server/saas/router.ts`: `/api/v1` routes and error responses.
- `server/saas/index.ts`: production dependency assembly.
- `server.ts`: mount the v1 router and remove embedded AI secrets.
- `src/services/dataService.ts`: credentials-aware v1 auth and entitlement client.
- `src/components/Auth.tsx`: remove self-selected registration role.
- `src/App.tsx`: show all product modules and use a central module registry.
- `src/data/modules.ts`: visible module catalog and feature keys.
- `tests/saas/*.test.ts`: domain and HTTP behavior.

### Task 1: Test runner and runtime dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime dependencies**

Run:

```bash
npm install bcryptjs cookie-parser jsonwebtoken pg redis zod
npm install -D vitest supertest @types/cookie-parser @types/jsonwebtoken @types/pg @types/supertest
```

Expected: dependencies are added without audit-blocking install errors.

- [ ] **Step 2: Add test and migration scripts**

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"db:migrate": "tsx server/saas/db/migrate.ts"
```

- [ ] **Step 3: Add deterministic Vitest configuration**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
  },
});
```

- [ ] **Step 4: Verify the runner starts**

Run: `npm test -- --passWithNoTests`

Expected: PASS with zero test files.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add SaaS foundation test harness"
```

### Task 2: Domain contract and in-memory repository

**Files:**
- Create: `server/saas/types.ts`
- Create: `server/saas/repository.ts`
- Create: `server/saas/memoryRepository.ts`
- Create: `tests/saas/memoryRepository.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
import { describe, expect, it } from 'vitest';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';

describe('MemorySaasRepository', () => {
  it('normalizes usernames and enforces uniqueness', async () => {
    const repo = new MemorySaasRepository();
    await repo.createUserWithOrganization({ username: ' Farmer ', passwordHash: 'hash' });
    await expect(repo.createUserWithOrganization({ username: 'farmer', passwordHash: 'hash2' }))
      .rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/memoryRepository.test.ts`

Expected: FAIL because `MemorySaasRepository` does not exist.

- [ ] **Step 3: Define focused domain types and repository methods**

`types.ts` must define `User`, `Organization`, `Membership`, `EntitlementSnapshot`, `Order`, `Product`, and `FeatureKey`. `repository.ts` must expose methods used by the services only:

```ts
export interface SaasRepository {
  createUserWithOrganization(input: { username: string; passwordHash: string }): Promise<UserContext>;
  findUserByUsername(username: string): Promise<UserWithCredential | null>;
  findUserContext(userId: string): Promise<UserContext | null>;
  saveRefreshSession(session: RefreshSession): Promise<void>;
  findRefreshSession(tokenHash: string): Promise<RefreshSession | null>;
  revokeRefreshSession(tokenHash: string): Promise<void>;
  listProducts(): Promise<Product[]>;
  getEntitlementSnapshot(organizationId: string): Promise<EntitlementSnapshot>;
  findOrderByIdempotencyKey(organizationId: string, key: string): Promise<Order | null>;
  createOrder(order: Order): Promise<Order>;
  settleMockOrder(orderId: string): Promise<Order>;
}
```

- [ ] **Step 4: Implement the in-memory repository**

Use Maps keyed by normalized username, ID and idempotency key. `createUserWithOrganization` must create the user, a personal organization, an `owner` membership and a free subscription atomically from the caller's perspective.

- [ ] **Step 5: Run GREEN**

Run: `npm test -- tests/saas/memoryRepository.test.ts`

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add server/saas tests/saas/memoryRepository.test.ts
git commit -m "feat: define SaaS domain repository"
```

### Task 3: Authentication service

**Files:**
- Create: `server/saas/config.ts`
- Create: `server/saas/auth/service.ts`
- Create: `tests/saas/authService.test.ts`

- [ ] **Step 1: Write failing registration and login tests**

```ts
it('registers every public user as a normal owner and hashes the password', async () => {
  const result = await service.register({ username: 'grower', password: 'StrongPass123!' });
  expect(result.user.platformRole).toBe('user');
  expect(result.membership.role).toBe('owner');
  expect((await repo.findUserByUsername('grower'))?.passwordHash).not.toBe('StrongPass123!');
});

it('rejects an invalid password without returning tokens', async () => {
  await service.register({ username: 'grower', password: 'StrongPass123!' });
  await expect(service.login({ username: 'grower', password: 'wrong-pass' }))
    .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/authService.test.ts`

Expected: FAIL because `AuthService` is missing.

- [ ] **Step 3: Implement registration, access tokens and rotating refresh sessions**

`AuthService` must:

- normalize usernames;
- validate passwords with Zod;
- hash passwords with bcrypt cost 12;
- sign 15-minute access tokens containing `sub`, `org`, `platformRole` and `membershipRole`;
- generate 32-byte refresh tokens and persist only their SHA-256 hash;
- rotate and revoke refresh tokens;
- never accept a role from public registration input.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- tests/saas/authService.test.ts`

Expected: all auth service tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/saas/config.ts server/saas/auth tests/saas/authService.test.ts
git commit -m "feat: add secure SaaS authentication service"
```

### Task 4: Entitlement resolver

**Files:**
- Create: `server/saas/entitlements/service.ts`
- Create: `tests/saas/entitlementService.test.ts`

- [ ] **Step 1: Write failing free and admin tests**

```ts
it('gives free organizations basic monitoring and five AI uses', async () => {
  const snapshot = await service.forOrganization(freeContext.organization.id);
  expect(snapshot.features).toContain('monitoring.basic');
  expect(snapshot.limits.aiMonthly).toBe(5);
  expect(snapshot.limits.plots).toBe(2);
});

it('allows platform admin regardless of purchased features', async () => {
  expect(await service.canUse(adminContext, 'device.control')).toEqual({ allowed: true, source: 'admin' });
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/entitlementService.test.ts`

Expected: FAIL because `EntitlementService` is missing.

- [ ] **Step 3: Implement feature union and denial responses**

The service must merge plan and active add-on features, ignore expired/revoked rows, return numeric limits, and produce a stable denial object containing `code: 'FEATURE_REQUIRED'`, `feature`, and `upgradePath: '/market'`.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/saas/entitlementService.test.ts`

```bash
git add server/saas/entitlements tests/saas/entitlementService.test.ts
git commit -m "feat: centralize SaaS entitlement resolution"
```

### Task 5: Idempotent billing service

**Files:**
- Create: `server/saas/billing/service.ts`
- Create: `tests/saas/billingService.test.ts`

- [ ] **Step 1: Write failing pricing and idempotency tests**

```ts
it('uses the server catalog price and ignores client supplied amounts', async () => {
  const order = await service.createOrder(context, {
    productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1'
  });
  expect(order.amountFen).toBe(9900);
});

it('returns the same order for a repeated idempotency key', async () => {
  const input = { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-2' };
  const first = await service.createOrder(context, input);
  const second = await service.createOrder(context, input);
  expect(second.id).toBe(first.id);
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/billingService.test.ts`

Expected: FAIL because `BillingService` is missing.

- [ ] **Step 3: Implement catalog-priced orders and mock settlement**

Only enabled products may be ordered. Quantity must be 1-100. Mock settlement must be atomic in the repository, mark the order paid once, add the product feature entitlement once, and return the refreshed snapshot.

- [ ] **Step 4: Run GREEN and commit**

Run: `npm test -- tests/saas/billingService.test.ts`

```bash
git add server/saas/billing tests/saas/billingService.test.ts
git commit -m "feat: add idempotent SaaS order service"
```

### Task 6: PostgreSQL schema and repository

**Files:**
- Create: `server/saas/db/migrations/001_saas_foundation.sql`
- Create: `server/saas/db/pool.ts`
- Create: `server/saas/db/migrate.ts`
- Create: `server/saas/db/pgRepository.ts`
- Create: `tests/saas/migration.test.ts`

- [ ] **Step 1: Write a migration contract test**

The test reads the SQL file and asserts that every core table exists, passwords are separated into `user_credentials`, order idempotency is unique per organization, and tenant-owned tables include `organization_id`.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/migration.test.ts`

Expected: FAIL because the migration is absent.

- [ ] **Step 3: Add the versioned schema**

Create all tables listed in the design using UUID text IDs, `timestamptz`, foreign keys, check constraints and unique indexes. Seed free/pro/enterprise plans, feature keys and the initial enabled products. Do not seed a password.

- [ ] **Step 4: Implement pool, migration runner and repository transactions**

The migration runner must use an advisory lock and `schema_migrations`. `createUserWithOrganization` and `settleMockOrder` must each run in a database transaction. Map PostgreSQL unique violations to stable domain errors.

- [ ] **Step 5: Run GREEN and commit**

Run: `npm test -- tests/saas/migration.test.ts`

```bash
git add server/saas/db tests/saas/migration.test.ts
git commit -m "feat: persist SaaS foundation in PostgreSQL"
```

### Task 7: Versioned HTTP API

**Files:**
- Create: `server/saas/auth/middleware.ts`
- Create: `server/saas/router.ts`
- Create: `server/saas/index.ts`
- Create: `tests/saas/httpApi.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write failing Supertest flows**

Cover registration, login, `/me`, entitlements, catalog, unauthenticated rejection, feature denial, mock order creation and duplicate idempotency keys.

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/httpApi.test.ts`

Expected: FAIL because `createSaasRouter` is missing.

- [ ] **Step 3: Implement routes and secure cookies**

Routes:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/me
GET  /api/v1/entitlements
GET  /api/v1/catalog
POST /api/v1/orders
POST /api/v1/orders/:id/mock-settle
```

Return stable JSON errors. Set refresh cookies as HttpOnly, SameSite=Lax, Path `/api/v1/auth`, and Secure in production. Limit auth payloads independently from legacy image APIs.

- [ ] **Step 4: Mount before legacy routes and remove embedded AI secrets**

`server.ts` must initialize the SaaS router before legacy route declarations. Replace hardcoded AI fallback strings with empty configuration and preserve the existing explicit mock response when keys are absent.

- [ ] **Step 5: Run GREEN, lint and commit**

Run:

```bash
npm test -- tests/saas/httpApi.test.ts
npm run lint
```

```bash
git add server.ts server/saas tests/saas/httpApi.test.ts
git commit -m "feat: expose secure versioned SaaS API"
```

### Task 8: Frontend authentication and visible module registry

**Files:**
- Create: `src/data/modules.ts`
- Modify: `src/services/dataService.ts`
- Modify: `src/components/Auth.tsx`
- Modify: `src/App.tsx`
- Modify: `src/hooks/usePlanGate.ts`
- Create: `tests/saas/moduleCatalog.test.ts`

- [ ] **Step 1: Write failing module visibility test**

```ts
import { expect, it } from 'vitest';
import { visibleModulesFor } from '../../src/data/modules';

it('shows every product module to a free registered user', () => {
  const ids = visibleModulesFor({ platformRole: 'user' }).map(item => item.id);
  expect(ids).toEqual(expect.arrayContaining(['dashboard', 'monitoring', 'management', 'ai', 'digital-twin', 'market']));
});
```

- [ ] **Step 2: Run RED**

Run: `npm test -- tests/saas/moduleCatalog.test.ts`

Expected: FAIL because `modules.ts` is missing.

- [ ] **Step 3: Implement module registry and v1 client**

`apiFetch` must use `credentials: 'include'`, attach the in-memory access token, refresh once on 401, and never fall back to local registration in production mode. `Auth.tsx` must stop sending a role. `App.tsx` must render all registered-user menu entries and attach plan badges rather than filtering monitoring and management by self-selected registration role.

- [ ] **Step 4: Run GREEN, lint and commit**

Run:

```bash
npm test -- tests/saas/moduleCatalog.test.ts
npm run lint
```

```bash
git add src tests/saas/moduleCatalog.test.ts
git commit -m "feat: connect UI to SaaS identity and module visibility"
```

### Task 9: Production configuration and operations documentation

**Files:**
- Modify: `.env.example`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Create: `deploy/nginx/nongxinzhijing.conf`
- Create: `deploy/systemd/nongxinzhijing.service`
- Create: `deploy/scripts/pg_backup.sh`
- Modify: `docs/04-部署手册.md`

- [ ] **Step 1: Add safe configuration contracts**

Document `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_INITIAL_PASSWORD`, `PAYMENT_MODE`, cookie security and AI provider keys. No real value may be committed.

- [ ] **Step 2: Upgrade runtime and bind private services**

Use Node 22 in Docker. Bind the application to `127.0.0.1:3000` in host deployment. PostgreSQL and Redis must not publish host ports in Compose; the application is the only service reachable by Nginx.

- [ ] **Step 3: Add Nginx, systemd and backup artifacts**

Nginx must redirect HTTP to HTTPS, proxy WebSocket upgrades, cache fingerprinted assets and limit auth requests. The backup script must use `pg_dump --format=custom`, a protected `.pgpass`, retention directories, SHA-256 checksums and an optional COS upload command; it must never contain a password literal.

- [ ] **Step 4: Validate configuration and commit**

Run:

```bash
docker compose config
npm run lint
```

```bash
git add .env.example Dockerfile docker-compose.yml deploy docs/04-部署手册.md
git commit -m "ops: add production SaaS deployment baseline"
```

### Task 10: Complete verification

**Files:**
- Modify only files needed to fix verified regressions, with a failing regression test first.

- [ ] **Step 1: Run all automated checks**

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0 with no TypeScript errors or failed tests.

- [ ] **Step 2: Run security scans**

```bash
git grep -nE "password123|sk-[A-Za-z0-9]{16,}|mock-token|demo-token" -- ':!docs/superpowers/**'
```

Expected: no embedded credentials or fixed authentication tokens in production paths.

- [ ] **Step 3: Verify worktree cleanliness**

Run: `git status --short`

Expected: no unexpected or untracked artifacts.

- [ ] **Step 4: Commit any test-led corrections**

If verification required a correction, first add a regression test, stage that test and the corresponding implementation file explicitly, then commit with `git commit -m "test: verify SaaS foundation release"`. If no correction was required, do not create an empty commit.

## Self-review

- Spec coverage: identity, organization creation, server-enforced entitlements, admin override, catalog, mock orders, PostgreSQL persistence, frontend visibility and deployment are covered.
- Deferred by explicit scope: legacy farm/device/AI row migration, operations console UI and real payment provider signatures each require a follow-up implementation plan.
- Placeholder scan: no implementation step relies on an undefined decision; secrets and production merchant values are intentionally environment-supplied configuration, not placeholders in code.
- Type consistency: `platformRole`, `membershipRole`, `FeatureKey`, `EntitlementSnapshot`, `amountFen` and `idempotencyKey` use the same names across service, repository, API and tests.
