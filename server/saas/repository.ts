import type {
  EntitlementSnapshot,
  Order,
  Product,
  RefreshSession,
  UserContext,
  User,
  PlatformRole,
  UserWithCredential,
} from './types';

export interface LegacyUserRegistrationInput {
  username: string;
  passwordHash: string;
  email?: never;
  displayName?: never;
  emailVerifiedAt?: never;
}

export interface VerifiedEmailRegistrationInput {
  email: string;
  displayName: string;
  passwordHash: string;
  emailVerifiedAt: string;
  username?: never;
}

export type UserRegistrationInput = LegacyUserRegistrationInput | VerifiedEmailRegistrationInput;

export interface SaasRepository {
  createUserWithOrganization(input: UserRegistrationInput): Promise<UserContext>;
  findUserByUsername(username: string): Promise<UserWithCredential | null>;
  findUserByEmail(email: string): Promise<UserWithCredential | null>;
  findUserContext(userId: string): Promise<UserContext | null>;
  setUserPlatformRole(userId: string, role: PlatformRole): Promise<User>;
  saveRefreshSession(session: RefreshSession): Promise<void>;
  findRefreshSession(tokenHash: string): Promise<RefreshSession | null>;
  revokeRefreshSession(tokenHash: string): Promise<void>;
  resetPasswordAndRevokeSessions(input: {
    userId: string;
    passwordHash: string;
    revokedAt: string;
  }): Promise<void>;
  /** Atomically consumes an active session and stores its replacement, or returns null without mutation. */
  rotateRefreshSession(currentTokenHash: string, replacementSession: RefreshSession, now: number): Promise<RefreshSession | null>;
  listProducts(): Promise<Product[]>;
  getEntitlementSnapshot(organizationId: string): Promise<EntitlementSnapshot>;
  findOrderByIdempotencyKey(organizationId: string, key: string): Promise<Order | null>;
  findOrderById(orderId: string): Promise<Order | null>;
  listOrders(organizationId: string): Promise<Order[]>;
  createOrder(order: Order): Promise<Order>;
  settleMockOrder(orderId: string): Promise<Order>;
}
