import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { SaasRepository } from '../repository';
import type { UserContext } from '../types';

const PASSWORD_HASH_ROUNDS = 12;
const bootstrapSchema = z.object({
  username: z.string()
    .transform((username) => username.trim().toLowerCase())
    .pipe(z.string().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/)),
  password: z.string()
    .min(12)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/\d/)
    .regex(/[^A-Za-z0-9]/),
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
  input: { username: string; password: string },
): Promise<UserContext> {
  try {
    const parsed = bootstrapSchema.safeParse(input);
    if (!parsed.success) throw new AdminBootstrapError();

    const credential = await repository.findUserByUsername(parsed.data.username);
    let userId: string;
    if (credential) {
      if (!await bcrypt.compare(parsed.data.password, credential.passwordHash)) {
        throw new AdminBootstrapError();
      }
      userId = credential.user.id;
    } else {
      const passwordHash = await bcrypt.hash(parsed.data.password, PASSWORD_HASH_ROUNDS);
      try {
        const created = await repository.createUserWithOrganization({
          username: parsed.data.username,
          passwordHash,
        });
        userId = created.user.id;
      } catch (error) {
        if (!hasErrorCode(error, 'USERNAME_TAKEN')) throw error;
        const concurrentCredential = await repository.findUserByUsername(parsed.data.username);
        if (!concurrentCredential
          || !await bcrypt.compare(parsed.data.password, concurrentCredential.passwordHash)) {
          throw new AdminBootstrapError();
        }
        userId = concurrentCredential.user.id;
      }
    }

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
