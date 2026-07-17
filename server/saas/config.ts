import { z } from 'zod';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const authConfigSchema = z.object({
  accessTokenSecret: z.string().min(32, 'Access token secret must be at least 32 characters long.'),
  accessTokenTtlSeconds: z.literal(ACCESS_TOKEN_TTL_SECONDS).default(ACCESS_TOKEN_TTL_SECONDS),
  refreshTokenTtlSeconds: z.number().int().positive().default(DEFAULT_REFRESH_TOKEN_TTL_SECONDS),
}).strict();

export type AuthConfig = z.infer<typeof authConfigSchema>;

export function createAuthConfig(input: unknown): AuthConfig {
  return authConfigSchema.parse(input);
}

export function loadAuthConfig(environment: Record<string, string | undefined> = process.env): AuthConfig {
  return createAuthConfig({
    accessTokenSecret: environment.ACCESS_TOKEN_SECRET,
    accessTokenTtlSeconds: environment.ACCESS_TOKEN_TTL_SECONDS === undefined
      ? ACCESS_TOKEN_TTL_SECONDS
      : Number(environment.ACCESS_TOKEN_TTL_SECONDS),
    refreshTokenTtlSeconds: environment.REFRESH_TOKEN_TTL_SECONDS === undefined
      ? DEFAULT_REFRESH_TOKEN_TTL_SECONDS
      : Number(environment.REFRESH_TOKEN_TTL_SECONDS),
  });
}
