import { describe, expect, it } from 'vitest';
import { PgSaasRepository } from '../../server/saas/db/pgRepository';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';
import type { SaasRepository, VerifiedEmailRegistrationInput } from '../../server/saas/repository';

const validRegistration: VerifiedEmailRegistrationInput = {
  email: 'grower@example.com',
  displayName: 'grower',
  passwordHash: '  exact hash bytes  ',
  emailVerifiedAt: '2030-01-01T00:00:00.000Z',
};

const invalidRegistrations: Array<[string, VerifiedEmailRegistrationInput]> = [
  ['malformed email', { ...validRegistration, email: 'not-an-email' }],
  ['blank display name', { ...validRegistration, displayName: '   ' }],
  ['blank password hash', { ...validRegistration, passwordHash: '\t ' }],
  ['invalid verification timestamp', { ...validRegistration, emailVerifiedAt: 'not-a-date' }],
  ['impossible verification date', { ...validRegistration, emailVerifiedAt: '2030-02-31T00:00:00.000Z' }],
];

const invalidResets = [
  ['empty user id', { userId: '', passwordHash: 'new-hash', revokedAt: '2030-01-02T00:00:00.000Z' }],
  ['blank user id', { userId: '   ', passwordHash: 'new-hash', revokedAt: '2030-01-02T00:00:00.000Z' }],
  ['blank password hash', { userId: 'user-1', passwordHash: '   ', revokedAt: '2030-01-02T00:00:00.000Z' }],
  ['invalid revocation timestamp', { userId: 'user-1', passwordHash: 'new-hash', revokedAt: 'not-a-date' }],
] as const;

describe.each([
  ['memory', (): { repository: SaasRepository; queries: string[] } => ({
    repository: new MemorySaasRepository(),
    queries: [],
  })],
  ['PostgreSQL', (): { repository: SaasRepository; queries: string[] } => {
    const queries: string[] = [];
    return {
      repository: new PgSaasRepository({
        connect: async () => {
          throw new Error('validation must run before acquiring a database client');
        },
        query: async (text: string) => {
          queries.push(text);
          throw new Error('validation must run before querying the database');
        },
      } as never),
      queries,
    };
  }],
])('%s identity validation', (_name, repositoryFactory) => {
  it.each(invalidRegistrations)('rejects %s before mutation', async (_caseName, input) => {
    const { repository, queries } = repositoryFactory();

    await expect(repository.createUserWithOrganization(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(queries).toEqual([]);
  });

  it.each(invalidResets)('rejects reset with %s before mutation', async (_caseName, input) => {
    const { repository, queries } = repositoryFactory();

    await expect(repository.resetPasswordAndRevokeSessions(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(queries).toEqual([]);
  });
});

describe('identity validation preserves credential bytes', () => {
  it('stores a valid password hash without trimming it', async () => {
    const repository = new MemorySaasRepository();

    await repository.createUserWithOrganization(validRegistration);

    await expect(repository.findUserByEmail(validRegistration.email)).resolves.toMatchObject({
      passwordHash: validRegistration.passwordHash,
    });
  });
});
