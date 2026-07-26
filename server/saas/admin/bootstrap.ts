import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { SaasRepository } from '../repository';
import type { UserContext } from '../types';

const PASSWORD_HASH_ROUNDS = 12;
const passwordSchema = z.string()
  .min(12)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/\d/)
  .regex(/[^A-Za-z0-9]/);
const bootstrapSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  displayName: z.literal('admin'),
}).strict();

export class AdminBootstrapError extends Error {
  readonly code = 'ADMIN_BOOTSTRAP_FAILED';

  constructor() {
    super('Platform admin bootstrap failed.');
    this.name = 'AdminBootstrapError';
  }
}

export async function bootstrapPlatformAdmin(
  repository: SaasRepository,
  input: { email: string; password: string; displayName: 'admin' },
): Promise<UserContext> {
  try {
    const parsed = bootstrapSchema.safeParse(input);
    if (!parsed.success) throw new AdminBootstrapError();

    const credential = await repository.findUserByEmail(parsed.data.email);
    let userId: string;
    if (credential) {
      if (!await bcrypt.compare(parsed.data.password, credential.passwordHash)) {
        throw new AdminBootstrapError();
      }
      if (credential.user.accountStatus !== 'active') throw new AdminBootstrapError();
      userId = credential.user.id;
    } else {
      const passwordHash = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_ROUNDS);
      try {
        const created = await repository.createUserWithOrganization({
          email: parsed.data.email,
          displayName: parsed.data.displayName,
          passwordHash,
          emailVerifiedAt: new Date().toISOString(),
        });
        userId = created.user.id;
      } catch (error) {
        if (!hasErrorCode(error, 'EMAIL_TAKEN')) throw error;
        const concurrentCredential = await repository.findUserByEmail(parsed.data.email);
        if (!concurrentCredential
          || concurrentCredential.user.accountStatus !== 'active'
          || !await bcrypt.compare(parsed.data.password, concurrentCredential.passwordHash)) {
          throw new AdminBootstrapError();
        }
        userId = concurrentCredential.user.id;
      }
    }

    await repository.setUserDisplayName(userId, parsed.data.displayName);
    await repository.setUserPlatformRole(userId, 'platform_admin');
    const context = await repository.findUserContext(userId);
    if (!context) throw new AdminBootstrapError();
    return context;
  } catch (error) {
    if (error instanceof AdminBootstrapError) throw error;
    throw new AdminBootstrapError();
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === code;
}
