import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SaasRepository } from '../repository';
import { BillingError, type EntitlementSnapshot, type Order, type UserContext } from '../types';

const orderInputSchema = z.object({
  productId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(100),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export interface BillingConfig {
  paymentMode: 'mock' | 'disabled';
}

export interface BillingSettlementResult {
  order: Order;
  entitlement: EntitlementSnapshot;
}

export class BillingService {
  constructor(
    private readonly repository: SaasRepository,
    private readonly config: BillingConfig,
  ) {}

  async createOrder(context: UserContext, input: unknown): Promise<Order> {
    const organizationId = this.organizationIdFor(context);
    const parsed = orderInputSchema.safeParse(input);
    if (!parsed.success) throw new BillingError('VALIDATION_ERROR');

    const existing = await this.repository.findOrderByIdempotencyKey(organizationId, parsed.data.idempotencyKey);
    if (existing) return this.matchIdempotentOrder(existing, parsed.data.productId, parsed.data.quantity);

    const product = (await this.repository.listProducts()).find(({ id }) => id === parsed.data.productId);
    if (!product) throw new BillingError('PRODUCT_NOT_FOUND');
    if (!product.enabled) throw new BillingError('PRODUCT_DISABLED');
    if (!isValidCatalogPrice(product.amountFen) || product.currency.trim().length === 0) {
      throw new BillingError('CATALOG_PRICE_INVALID');
    }

    const amountFen = product.amountFen * parsed.data.quantity;
    if (!Number.isSafeInteger(amountFen)) throw new BillingError('CATALOG_PRICE_INVALID');

    const order: Order = {
      id: randomUUID(),
      organizationId,
      productId: product.id,
      quantity: parsed.data.quantity,
      idempotencyKey: parsed.data.idempotencyKey,
      amountFen,
      currency: product.currency,
      status: 'pending',
      createdAt: new Date().toISOString(),
      paidAt: null,
    };

    try {
      return structuredClone(await this.repository.createOrder(order));
    } catch (error) {
      if (!hasCode(error, 'IDEMPOTENCY_KEY_TAKEN')) throw error;
      const racedOrder = await this.repository.findOrderByIdempotencyKey(organizationId, parsed.data.idempotencyKey);
      if (!racedOrder) throw new BillingError('IDEMPOTENCY_CONFLICT');
      return this.matchIdempotentOrder(racedOrder, parsed.data.productId, parsed.data.quantity);
    }
  }

  async settleMockOrder(context: UserContext, orderId: string): Promise<BillingSettlementResult> {
    const organizationId = this.organizationIdFor(context);
    if (this.config.paymentMode !== 'mock') throw new BillingError('PAYMENT_MODE_DISABLED');

    const existingOrder = await this.repository.findOrderById(orderId);
    if (!existingOrder || existingOrder.organizationId !== organizationId) throw new BillingError('ORDER_NOT_FOUND');
    if (existingOrder.status !== 'pending' && existingOrder.status !== 'paid') {
      throw new BillingError('ORDER_NOT_SETTLEABLE');
    }

    const order = await this.repository.settleMockOrder(existingOrder.id);
    const entitlement = await this.repository.getEntitlementSnapshot(organizationId);
    return { order: structuredClone(order), entitlement: structuredClone(entitlement) };
  }

  private organizationIdFor(context: UserContext): string {
    if (context.user.id !== context.membership.userId
      || context.organization.id !== context.membership.organizationId) {
      throw new BillingError('CONTEXT_MISMATCH');
    }
    return context.membership.organizationId;
  }

  private matchIdempotentOrder(order: Order, productId: string, quantity: number): Order {
    if (order.productId !== productId || order.quantity !== quantity) {
      throw new BillingError('IDEMPOTENCY_CONFLICT');
    }
    return structuredClone(order);
  }
}

function isValidCatalogPrice(amountFen: number): boolean {
  return Number.isSafeInteger(amountFen) && amountFen >= 0;
}

function hasCode(error: unknown, code: string): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
