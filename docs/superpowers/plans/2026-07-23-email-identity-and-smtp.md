# Email Identity and SMTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace username-only public registration with verified-email registration, SMTP delivery, email login, password recovery, and an email-based `admin` bootstrap without changing the product’s established visual style.

**Architecture:** Keep the existing modular monolith and `/api/v1` session model. Add a focused email module with an SMTP adapter, an atomic verification-code store backed by Redis, and an in-memory test adapter; PostgreSQL remains the identity and session source of truth. Preserve the temporary `user.username` compatibility field as the normalized email until legacy business routes are migrated in a later phase.

**Tech Stack:** Node.js 22, TypeScript, Express, PostgreSQL, Redis 6 client, Nodemailer, Zod, React 19, Vitest, Supertest

---

## Scope and file map

This is phase 1 of the national-final rollout. It produces a complete, deployable email-account flow before billing/admin review and business-data migration begin.

**Create:**

- `server/saas/email/config.ts` — validates SMTP, verification and Redis settings.
- `server/saas/email/types.ts` — mail, code-store and verification contracts.
- `server/saas/email/memoryVerificationStore.ts` — deterministic test/development store.
- `server/saas/email/redisVerificationStore.ts` — atomic production verification store.
- `server/saas/email/mailer.ts` — Nodemailer adapter and Chinese verification template.
- `server/saas/email/service.ts` — code generation, HMAC validation, rate limits and delivery orchestration.
- `server/saas/db/migrations/002_email_identity.sql` — email identity and account-status schema.
- `tests/saas/emailConfig.test.ts`
- `tests/saas/emailVerificationStore.test.ts`
- `tests/saas/mailer.test.ts`
- `tests/saas/emailVerificationService.test.ts`
- `tests/frontend/authEmailFlow.test.tsx`

**Modify:**

- `package.json`, `package-lock.json`
- `.env.example`
- `server/saas/types.ts`
- `server/saas/repository.ts`
- `server/saas/memoryRepository.ts`
- `server/saas/db/pgRepository.ts`
- `server/saas/auth/service.ts`
- `server/saas/admin/bootstrap.ts`
- `server/saas/router.ts`
- `server/saas/index.ts`
- `src/types/saas.ts`
- `src/services/saasClient.ts`
- `src/components/Auth.tsx`
- `src/App.tsx`
- `tests/saas/authService.test.ts`
- `tests/saas/adminBootstrap.test.ts`
- `tests/saas/httpApi.test.ts`
- `tests/saas/migration.test.ts`
- `tests/saas/pgRepository.test.ts`
- `tests/saas/runtimeReadiness.test.ts`
- `tests/frontend/saasClient.test.ts`
- `tests/deployment/productionConfig.test.ts`

## Stable contracts for this phase

Use these exact request contracts:

```ts
type VerificationPurpose = 'register' | 'reset_password';

POST /api/v1/auth/email-code
{ email: string, purpose: VerificationPurpose }

POST /api/v1/auth/register
{ email: string, password: string, verificationCode: string }

POST /api/v1/auth/login
{ email: string, password: string }

POST /api/v1/auth/password-reset
{ email: string, password: string, verificationCode: string }
```

Successful code requests always return:

```json
{
  "success": true,
  "data": {
    "accepted": true,
    "retryAfterSeconds": 60,
    "expiresInSeconds": 300
  }
}
```

The response does not disclose whether an account exists. Registration and reset consume different codes.

---

### Task 1: Add SMTP dependency and strict configuration

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/saas/email/config.ts`
- Create: `tests/saas/emailConfig.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing configuration tests**

Create `tests/saas/emailConfig.test.ts` with cases for a valid QQ-style port-465 configuration, a valid 163-style port-465 configuration, port 587 with `secure=false`, missing credentials, a short HMAC secret, malformed Redis URL, and contradictory `secure=true` on port 587.

Use this valid fixture:

```ts
const validEnvironment = {
  REDIS_URL: 'redis://:redis-password@127.0.0.1:6379',
  EMAIL_VERIFICATION_HMAC_SECRET: 'email-code-hmac-secret-that-is-at-least-32-characters',
  SMTP_HOST: 'smtp.qq.com',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'sender@qq.com',
  SMTP_PASS: 'smtp-authorization-code',
  SMTP_FROM_NAME: '农芯智境',
};
```

Assertions:

```ts
expect(loadEmailConfig(validEnvironment)).toMatchObject({
  smtp: { host: 'smtp.qq.com', port: 465, secure: true, user: 'sender@qq.com' },
  codeTtlSeconds: 300,
  resendCooldownSeconds: 60,
  emailHourlyLimit: 5,
  ipHourlyLimit: 20,
  maxAttempts: 5,
});
expect(() => loadEmailConfig({ ...validEnvironment, SMTP_PASS: '' })).toThrow();
expect(() => loadEmailConfig({ ...validEnvironment, EMAIL_VERIFICATION_HMAC_SECRET: 'short' })).toThrow();
expect(() => loadEmailConfig({ ...validEnvironment, SMTP_PORT: '587', SMTP_SECURE: 'true' })).toThrow();
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```bash
npx vitest run tests/saas/emailConfig.test.ts
```

Expected: FAIL because `server/saas/email/config.ts` does not exist.

- [ ] **Step 3: Install the mail dependency**

Run:

```bash
npm install nodemailer
npm install --save-dev @types/nodemailer
```

Expected: `package.json` and `package-lock.json` contain Nodemailer and its TypeScript types.

- [ ] **Step 4: Implement strict configuration**

Create `server/saas/email/config.ts` with:

```ts
import { z } from 'zod';

const emailConfigSchema = z.object({
  redisUrl: z.string().url().refine((value) => value.startsWith('redis://') || value.startsWith('rediss://')),
  hmacSecret: z.string().min(32),
  smtp: z.object({
    host: z.string().trim().min(1),
    port: z.union([z.literal(465), z.literal(587)]),
    secure: z.boolean(),
    user: z.string().email(),
    pass: z.string().min(1),
    fromName: z.string().trim().min(1).max(64),
  }).superRefine((smtp, context) => {
    if ((smtp.port === 465) !== smtp.secure) {
      context.addIssue({ code: 'custom', message: 'Port 465 requires secure=true; port 587 requires secure=false.' });
    }
  }),
  codeTtlSeconds: z.literal(300).default(300),
  resendCooldownSeconds: z.literal(60).default(60),
  emailHourlyLimit: z.literal(5).default(5),
  ipHourlyLimit: z.literal(20).default(20),
  maxAttempts: z.literal(5).default(5),
}).strict();

export type EmailConfig = z.infer<typeof emailConfigSchema>;

export function loadEmailConfig(environment: Record<string, string | undefined>): EmailConfig {
  return emailConfigSchema.parse({
    redisUrl: environment.REDIS_URL,
    hmacSecret: environment.EMAIL_VERIFICATION_HMAC_SECRET,
    smtp: {
      host: environment.SMTP_HOST,
      port: Number(environment.SMTP_PORT),
      secure: environment.SMTP_SECURE?.trim().toLowerCase() === 'true',
      user: environment.SMTP_USER,
      pass: environment.SMTP_PASS,
      fromName: environment.SMTP_FROM_NAME,
    },
    codeTtlSeconds: 300,
    resendCooldownSeconds: 60,
    emailHourlyLimit: 5,
    ipHourlyLimit: 20,
    maxAttempts: 5,
  });
}
```

Add the exact environment names to `.env.example`; keep their values empty except ports, booleans and non-secret defaults.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/saas/emailConfig.test.ts
npx tsc --noEmit
```

Expected: both commands PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example server/saas/email/config.ts tests/saas/emailConfig.test.ts
git commit -m "feat: add strict smtp verification config"
```

---

### Task 2: Add email identity columns and repository contracts

**Files:**

- Create: `server/saas/db/migrations/002_email_identity.sql`
- Modify: `server/saas/types.ts`
- Modify: `server/saas/repository.ts`
- Modify: `server/saas/memoryRepository.ts`
- Modify: `server/saas/db/pgRepository.ts`
- Modify: `tests/saas/migration.test.ts`
- Modify: `tests/saas/memoryRepository.test.ts`
- Modify: `tests/saas/pgRepository.test.ts`

- [ ] **Step 1: Write failing migration and repository tests**

Add assertions that:

```ts
expect(context.user).toMatchObject({
  username: 'grower@example.com',
  email: 'grower@example.com',
  displayName: 'grower',
  accountStatus: 'active',
});
expect(await repository.findUserByEmail(' GROWER@EXAMPLE.COM ')).not.toBeNull();
await expect(repository.createUserWithOrganization({
  email: 'GROWER@example.com',
  displayName: 'Other',
  passwordHash: 'hash',
  emailVerifiedAt: new Date().toISOString(),
})).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
```

Migration assertions must check `normalized_email`, `display_name`, `email_verified_at`, `account_status`, the unique email index, and the `active|disabled` constraint.

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
npx vitest run tests/saas/migration.test.ts tests/saas/memoryRepository.test.ts tests/saas/pgRepository.test.ts
```

Expected: FAIL because the new fields and repository methods are missing.

- [ ] **Step 3: Add the additive database migration**

`002_email_identity.sql` must:

```sql
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
  CHECK (normalized_email = lower(btrim(normalized_email)) AND normalized_email LIKE '%_@_%.__%');
ALTER TABLE users ADD CONSTRAINT users_account_status
  CHECK (account_status IN ('active', 'disabled'));
CREATE UNIQUE INDEX users_normalized_email_idx ON users (normalized_email);
```

Do not drop `normalized_username` in this phase. It is the compatibility identity used by legacy routes until phase 3.

- [ ] **Step 4: Update domain and repository contracts**

Use these exact public fields:

```ts
export interface User {
  id: string;
  username: string; // compatibility alias; equals normalized email for new accounts
  email: string;
  displayName: string;
  accountStatus: 'active' | 'disabled';
  platformRole: PlatformRole;
  createdAt: string;
}
```

Replace repository identity methods with:

```ts
createUserWithOrganization(input: {
  email: string;
  displayName: string;
  passwordHash: string;
  emailVerifiedAt: string;
}): Promise<UserContext>;
findUserByEmail(email: string): Promise<UserWithCredential | null>;
resetPasswordAndRevokeSessions(input: {
  userId: string;
  passwordHash: string;
  revokedAt: string;
}): Promise<void>;
```

Add `EMAIL_TAKEN` to `SaasDomainErrorCode`. Implement identical behavior in memory and PostgreSQL repositories. PostgreSQL registration must create user, credential, organization, owner membership and free subscription in one transaction.

`resetPasswordAndRevokeSessions` must update the credential and revoke every active refresh session in one PostgreSQL transaction; the memory repository must expose the same all-or-nothing behavior.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run tests/saas/migration.test.ts tests/saas/memoryRepository.test.ts tests/saas/pgRepository.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/saas/db/migrations/002_email_identity.sql server/saas/types.ts server/saas/repository.ts server/saas/memoryRepository.ts server/saas/db/pgRepository.ts tests/saas/migration.test.ts tests/saas/memoryRepository.test.ts tests/saas/pgRepository.test.ts
git commit -m "feat: add verified email identity persistence"
```

---

### Task 3: Build the verification-code stores

**Files:**

- Create: `server/saas/email/types.ts`
- Create: `server/saas/email/memoryVerificationStore.ts`
- Create: `server/saas/email/redisVerificationStore.ts`
- Create: `tests/saas/emailVerificationStore.test.ts`

- [ ] **Step 1: Write a shared contract test**

Run the same behavior suite against the memory store and a Redis-client fake. Cover:

- first reservation succeeds;
- a concurrent reservation returns `IN_PROGRESS`;
- committed code creates 60-second cooldown;
- sixth email send in the same hour returns `EMAIL_RATE_LIMITED`;
- twenty-first IP send returns `IP_RATE_LIMITED`;
- abort removes only the in-progress reservation;
- consume returns `MATCH`, `MISMATCH`, `EXPIRED`, or `LOCKED`;
- fifth mismatch deletes the code;
- a successful consume deletes the code immediately;
- register and reset-password codes never match each other.

Define the contract:

```ts
export type VerificationPurpose = 'register' | 'reset_password';
export type ReserveResult =
  | { allowed: true; reservationId: string }
  | { allowed: false; reason: 'COOLDOWN' | 'IN_PROGRESS' | 'EMAIL_RATE_LIMITED' | 'IP_RATE_LIMITED'; retryAfterSeconds: number };

export interface VerificationCodeStore {
  reserve(input: { emailHash: string; ipHash: string; purpose: VerificationPurpose; nowMs: number }): Promise<ReserveResult>;
  commit(input: { reservationId: string; emailHash: string; ipHash: string; purpose: VerificationPurpose; codeHash: string; nowMs: number }): Promise<void>;
  abort(reservationId: string): Promise<void>;
  consume(input: { emailHash: string; purpose: VerificationPurpose; candidateHash: string; nowMs: number }): Promise<'MATCH' | 'MISMATCH' | 'EXPIRED' | 'LOCKED'>;
  close(): Promise<void>;
}
```

- [ ] **Step 2: Verify failing tests**

Run:

```bash
npx vitest run tests/saas/emailVerificationStore.test.ts
```

Expected: FAIL because both stores are missing.

- [ ] **Step 3: Implement the in-memory store**

Use maps keyed by `purpose:emailHash`, `hour:emailHash`, and `hour:ipHash`. All returned objects must be cloned. Accept a clock only through each method’s `nowMs` input so fake timers remain deterministic.

- [ ] **Step 4: Implement the Redis store atomically**

Use Redis `EVAL` scripts for `reserve`, `commit`, `abort`, and `consume`. Keys must use HMAC-derived email/IP hashes and never raw personal data:

```text
nxzj:verify:reservation:{reservationId}
nxzj:verify:code:{purpose}:{emailHash}
nxzj:verify:cooldown:{purpose}:{emailHash}
nxzj:verify:email-hour:{hourBucket}:{emailHash}
nxzj:verify:ip-hour:{hourBucket}:{ipHash}
```

`reserve` sets a 30-second reservation with `NX`; `commit` verifies the reservation ID before writing the code, cooldown and hour counters; `abort` deletes only a matching reservation; `consume` increments attempts and deletes the code at five mismatches.

- [ ] **Step 5: Run store tests**

Run:

```bash
npx vitest run tests/saas/emailVerificationStore.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/saas/email/types.ts server/saas/email/memoryVerificationStore.ts server/saas/email/redisVerificationStore.ts tests/saas/emailVerificationStore.test.ts
git commit -m "feat: add atomic email verification store"
```

---

### Task 4: Add SMTP delivery and the branded email template

**Files:**

- Create: `server/saas/email/mailer.ts`
- Create: `tests/saas/mailer.test.ts`

- [ ] **Step 1: Write failing mailer tests**

Inject a transport exposing `sendMail`. Assert:

```ts
expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
  from: '"农芯智境" <sender@qq.com>',
  to: 'grower@example.com',
  subject: '农芯智境邮箱验证码',
}));
expect(sendMail.mock.calls[0][0].text).toContain('123456');
expect(sendMail.mock.calls[0][0].text).toContain('5 分钟');
expect(sendMail.mock.calls[0][0].html).toContain('https://www.nongxinzhijing.site');
expect(JSON.stringify(sendMail.mock.calls[0][0])).not.toContain('smtp-authorization-code');
```

Also assert SMTP rejection becomes `MailDeliveryError('SMTP_DELIVERY_FAILED')`.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npx vitest run tests/saas/mailer.test.ts
```

Expected: FAIL because the mailer is missing.

- [ ] **Step 3: Implement the mailer**

Expose:

```ts
export interface VerificationMailer {
  sendCode(input: { email: string; code: string; purpose: VerificationPurpose }): Promise<void>;
}
```

Create one Nodemailer transporter at runtime startup. Use escaped values in HTML, provide both text and HTML bodies, set a 10-second connection timeout and 15-second socket timeout, and use the subject:

- register: `农芯智境邮箱验证码`
- reset: `农芯智境密码重置验证码`

Wrap transport errors without including the provider response, credentials or recipient in the public error.

Emit one structured delivery event after each attempt with purpose, duration, result and a masked address such as `g***@example.com`. Never log the code, complete address, provider authorization response or SMTP credentials.

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/saas/mailer.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/saas/email/mailer.ts tests/saas/mailer.test.ts
git commit -m "feat: send branded smtp verification mail"
```

---

### Task 5: Implement verification orchestration

**Files:**

- Create: `server/saas/email/service.ts`
- Create: `tests/saas/emailVerificationService.test.ts`

- [ ] **Step 1: Write failing service tests**

Inject the store, mailer, deterministic code generator and clock. Test normalization, six-digit generation, HMAC storage, successful consumption, wrong-purpose rejection, delivery abort, generic delivery errors, and rate-limit propagation.

The test must prove no plain code is passed to the store:

```ts
await service.sendCode({ email: ' Grower@Example.COM ', purpose: 'register', ip: '127.0.0.1' });
expect(store.commit).toHaveBeenCalledWith(expect.objectContaining({
  codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
}));
expect(store.commit).not.toHaveBeenCalledWith(expect.objectContaining({ codeHash: '123456' }));
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx vitest run tests/saas/emailVerificationService.test.ts
```

Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement the service**

Use:

```ts
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const codeSchema = z.string().regex(/^\d{6}$/);
const hmac = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');
```

Generate the code with `randomInt(0, 1_000_000).toString().padStart(6, '0')`. Hash email and IP independently; hash codes with `purpose`, normalized email and code:

```ts
hmac(secret, `${purpose}\n${normalizedEmail}\n${code}`)
```

Call order:

```text
normalize → reserve → generate → send SMTP → commit
                                  ↘ on failure: abort
```

Expose `sendCode(...)` and `consumeCode(...)`. Return stable domain codes:

```ts
type EmailVerificationErrorCode =
  | 'INVALID_EMAIL'
  | 'INVALID_CODE'
  | 'CODE_EXPIRED'
  | 'CODE_LOCKED'
  | 'TOO_MANY_REQUESTS'
  | 'EMAIL_DELIVERY_UNAVAILABLE'
  | 'VERIFICATION_UNAVAILABLE';
```

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/saas/emailVerificationService.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/saas/email/service.ts tests/saas/emailVerificationService.test.ts
git commit -m "feat: orchestrate secure email verification"
```

---

### Task 6: Convert auth, reset and admin bootstrap to email

**Files:**

- Modify: `server/saas/auth/service.ts`
- Modify: `server/saas/admin/bootstrap.ts`
- Modify: `tests/saas/authService.test.ts`
- Modify: `tests/saas/adminBootstrap.test.ts`

- [ ] **Step 1: Update tests first**

Registration tests must call:

```ts
await service.register({
  email: 'grower@example.com',
  password: 'StrongPass123!',
  verificationCode: '123456',
});
```

Inject a verification service fake whose `consumeCode` succeeds once. Add tests for:

- missing/invalid verification code;
- duplicate email normalized case-insensitively;
- disabled accounts rejected with `ACCOUNT_DISABLED`;
- reset consumes a `reset_password` code, hashes the replacement password, and revokes all refresh sessions;
- `bootstrapPlatformAdmin` accepts `{ email, password, displayName: 'admin' }`;
- public input containing `platformRole` is rejected.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/saas/authService.test.ts tests/saas/adminBootstrap.test.ts
```

Expected: FAIL on the old username contracts.

- [ ] **Step 3: Implement email auth**

Use exact schemas:

```ts
const passwordSchema = z.string()
  .min(12).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).regex(/[^A-Za-z0-9]/);
const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  verificationCode: z.string().regex(/^\d{6}$/),
}).strict();
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1),
}).strict();
```

Registration consumes the code before creating the account. A duplicate race maps to `EMAIL_TAKEN`. Login uses the existing dummy bcrypt hash to prevent account enumeration and additionally checks `accountStatus === 'active'`.

Add:

```ts
resetPassword(input: unknown): Promise<void>
```

It consumes a reset code, hashes the replacement password, then calls the repository’s atomic `resetPasswordAndRevokeSessions` operation.

- [ ] **Step 4: Implement email admin bootstrap**

Rename environment-facing input from `username` to `email`. The bootstrap:

1. validates a real email;
2. finds by normalized email;
3. creates a verified account when absent;
4. sets `displayName` to `admin`;
5. promotes only through repository-controlled `setUserPlatformRole`;
6. never exposes the password.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/saas/authService.test.ts tests/saas/adminBootstrap.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/saas/auth/service.ts server/saas/admin/bootstrap.ts tests/saas/authService.test.ts tests/saas/adminBootstrap.test.ts
git commit -m "feat: authenticate verified email accounts"
```

---

### Task 7: Expose safe HTTP endpoints and wire runtime resources

**Files:**

- Modify: `server/saas/router.ts`
- Modify: `server/saas/index.ts`
- Modify: `tests/saas/httpApi.test.ts`
- Modify: `tests/saas/runtimeReadiness.test.ts`
- Modify: `tests/deployment/productionConfig.test.ts`

- [ ] **Step 1: Add failing HTTP tests**

Add tests for:

```ts
await request(app).post('/api/v1/auth/email-code').send({
  email: 'grower@example.com',
  purpose: 'register',
}).set('X-Forwarded-For', '203.0.113.10');
```

Assert status 202, generic body, no code, no existence leak, `Retry-After: 60` for throttling, verified registration status 201, email login status 200, reset status 200, and stable error mapping:

- `INVALID_EMAIL` → 400
- `INVALID_CODE` → 400
- `CODE_EXPIRED` → 410
- `CODE_LOCKED` → 429
- `TOO_MANY_REQUESTS` → 429
- `EMAIL_DELIVERY_UNAVAILABLE` → 503
- `VERIFICATION_UNAVAILABLE` → 503
- `EMAIL_TAKEN` → 409
- `ACCOUNT_DISABLED` → 403

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx vitest run tests/saas/httpApi.test.ts tests/saas/runtimeReadiness.test.ts tests/deployment/productionConfig.test.ts
```

Expected: FAIL because dependencies and routes are missing.

- [ ] **Step 3: Wire runtime**

Extend `SaasRuntime` with the verification store and close it during shutdown. In production, require all email and Redis settings; in tests/development allow explicitly injected memory store and fake mailer.

Runtime startup order:

```text
database ready → Redis connect → SMTP transporter create → admin bootstrap → router create
```

Runtime shutdown order:

```text
stop HTTP acceptance → close verification Redis connection → close PostgreSQL pool
```

Use `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and fixed display name `admin`; remove `ADMIN_USERNAME`.

- [ ] **Step 4: Add routes**

Add:

```ts
router.post('/auth/email-code', emailCodeLimiter, asyncRoute(...));
router.post('/auth/register', asyncRoute(...));
router.post('/auth/login', loginLimiter, asyncRoute(...));
router.post('/auth/password-reset', asyncRoute(...));
```

Obtain the client IP from Express after trusted-proxy configuration; do not read arbitrary `X-Forwarded-For` inside the service.

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/saas/httpApi.test.ts tests/saas/runtimeReadiness.test.ts tests/deployment/productionConfig.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/saas/router.ts server/saas/index.ts tests/saas/httpApi.test.ts tests/saas/runtimeReadiness.test.ts tests/deployment/productionConfig.test.ts
git commit -m "feat: expose verified email auth api"
```

---

### Task 8: Update the typed frontend client

**Files:**

- Modify: `src/types/saas.ts`
- Modify: `src/services/saasClient.ts`
- Modify: `tests/frontend/saasClient.test.ts`

- [ ] **Step 1: Write failing client tests**

Assert exact bodies:

```ts
await client.sendEmailCode({ email: 'grower@example.com', purpose: 'register' });
await client.register({ email: 'grower@example.com', password: 'StrongPass123!', verificationCode: '123456' });
await client.login({ email: 'grower@example.com', password: 'StrongPass123!' });
await client.resetPassword({ email: 'grower@example.com', password: 'NewStrongPass123!', verificationCode: '654321' });
```

Also assert parsed sessions include `email`, `displayName`, and `accountStatus`, and malformed values cause `INVALID_RESPONSE`.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx vitest run tests/frontend/saasClient.test.ts
```

Expected: FAIL on missing methods and old request fields.

- [ ] **Step 3: Implement client and types**

Add:

```ts
sendEmailCode(input: { email: string; purpose: 'register' | 'reset_password' })
register(input: { email: string; password: string; verificationCode: string })
login(input: { email: string; password: string })
resetPassword(input: { email: string; password: string; verificationCode: string })
```

Keep `username` in `SaasUser` during compatibility migration, but render `displayName` in new UI code.

- [ ] **Step 4: Run tests**

Run:

```bash
npx vitest run tests/frontend/saasClient.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/saas.ts src/services/saasClient.ts tests/frontend/saasClient.test.ts
git commit -m "feat: add typed email auth client"
```

---

### Task 9: Integrate the email flow into the existing auth screen

**Files:**

- Modify: `src/components/Auth.tsx`
- Modify: `src/App.tsx`
- Create: `tests/frontend/authEmailFlow.test.tsx`

- [ ] **Step 1: Add component tests before changing UI**

Test the existing `Auth` component with a mocked client:

- login shows an email field and no verification field;
- register shows email, password, verification code and send-code button;
- send button becomes disabled with a `60 秒后重发` countdown;
- invalid email does not call the API;
- successful register calls `onLogin`;
- reset mode requests `reset_password` and returns to login after success;
- switching mode clears passwords, codes and stale errors;
- the existing admin shortcut switches to login mode but does not reveal or prefill the administrator email or password.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx vitest run tests/frontend/authEmailFlow.test.tsx
```

Expected: FAIL because the UI still uses `username`.

- [ ] **Step 3: Update the form without changing the visual system**

Keep the existing hero image, glass card, colors, typography and entry-mode selector. Replace the username field with:

```tsx
<input
  type="email"
  autoComplete="email"
  inputMode="email"
  value={email}
  onChange={(event) => setEmail(event.target.value)}
  placeholder="请输入邮箱"
/>
```

In registration and reset modes add a six-digit input and a sibling send button using the current rounded emerald styling. Provide accessible labels, a live status region, loading state, retry countdown and Chinese error messages. Do not display raw backend error codes to normal users.

Use three form modes:

```ts
type AuthMode = 'login' | 'register' | 'reset';
```

Keep the existing administrator shortcut only as a presentation aid: it sets login mode and displays “请使用部署时配置的管理员邮箱登录”，without inserting any account value.

- [ ] **Step 4: Render display name in the application shell**

In `src/App.tsx`, replace user-facing `user.username` labels with `user.displayName`. Keep `user.username` only where a legacy data request still requires the compatibility identity.

- [ ] **Step 5: Run component and regression tests**

Run:

```bash
npx vitest run tests/frontend/authEmailFlow.test.tsx tests/frontend/saasClient.test.ts tests/frontend/moduleAccess.test.ts
npx tsc --noEmit
npm run build
```

Expected: all commands PASS and the production build completes.

- [ ] **Step 6: Commit**

```bash
git add src/components/Auth.tsx src/App.tsx tests/frontend/authEmailFlow.test.tsx
git commit -m "feat: add polished email registration flow"
```

---

### Task 10: Complete production configuration and full verification

**Files:**

- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `docs/04-部署手册.md`
- Modify: `tests/deployment/productionConfig.test.ts`

- [ ] **Step 1: Add failing deployment assertions**

Assert that Compose passes `REDIS_URL`, all SMTP variables, `EMAIL_VERIFICATION_HMAC_SECRET`, and `ADMIN_EMAIL` only to the application container; secrets must not appear in the frontend build arguments or Nginx configuration.

- [ ] **Step 2: Run and verify failure**

Run:

```bash
npx vitest run tests/deployment/productionConfig.test.ts
```

Expected: FAIL until the new variables are wired.

- [ ] **Step 3: Update deployment files**

Document both provider examples without real credentials:

```env
# QQ
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true

# 163
# SMTP_HOST=smtp.163.com
# SMTP_PORT=465
# SMTP_SECURE=true
```

Document that `SMTP_PASS` is the provider authorization code, not the webmail password. Add a pre-deployment SMTP smoke test that sends only to the administrator mailbox and does not print secrets.

- [ ] **Step 4: Run the full quality gate**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
npm audit --omit=dev
git diff --check
```

Expected:

- all Vitest suites PASS;
- TypeScript emits no errors;
- production frontend, server and migration bundles build;
- runtime migrations are present in `dist/migrations`;
- audit reports no unresolved high or critical production vulnerability;
- `git diff --check` reports no whitespace errors.

- [ ] **Step 5: Perform manual local acceptance**

With a non-production test SMTP mailbox and local PostgreSQL/Redis:

1. send a registration code to a controlled mailbox;
2. confirm the message sender, subject, layout and five-minute notice;
3. register and verify the free plan;
4. log out and log in with email;
5. request reset code, change password and prove the prior refresh session is invalid;
6. restart the application and prove the account persists;
7. stop Redis and verify registration fails safely without a bypass;
8. restore Redis and prove registration works again.

Expected: every step matches the approved design; no code or secret appears in logs.

- [ ] **Step 6: Commit**

```bash
git add .env.example docker-compose.yml docs/04-部署手册.md tests/deployment/productionConfig.test.ts
git commit -m "docs: operationalize smtp account delivery"
```

---

## Phase exit criteria

Do not begin the administrator-order plan until:

- the full existing test suite and all new email tests pass;
- a real controlled QQ or 163 mailbox receives a code;
- registration is impossible without the correct code;
- the same email cannot register twice with different casing;
- `admin` logs in with a configured email and retains full entitlement;
- Redis failure does not create a bypass;
- production build and migration layout verification pass;
- the branch is clean and every task has its own reviewable commit.

The next plan is `administrator order review and expiring entitlements`; it will replace mock self-settlement with the approved user-request/admin-approval flow.
