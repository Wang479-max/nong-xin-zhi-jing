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
