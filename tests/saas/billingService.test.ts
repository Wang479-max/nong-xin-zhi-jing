import { describe, expect, it } from 'vitest';
import { BillingService } from '../../server/saas/billing/service';
import { MemorySaasRepository } from '../../server/saas/memoryRepository';
import type { Order, Product } from '../../server/saas/types';

const createService = (paymentMode: 'mock' | 'disabled' = 'mock') => {
  const repository = new MemorySaasRepository();
  return { repository, service: new BillingService(repository, { paymentMode }) };
};

describe('BillingService', () => {
  it('uses the server catalog price instead of a forged client amount', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'price-user', passwordHash: 'hash' });

    const order = await service.createOrder(context, {
      productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1', amountFen: 1, currency: 'USD', status: 'paid',
    });

    expect(order).toMatchObject({ productId: 'addon.ai.pro', quantity: 1, amountFen: 9_900, currency: 'CNY', status: 'pending', paidAt: null });
  });

  it('returns the original order for the same organization key and semantic request', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'repeat-user', passwordHash: 'hash' });

    const first = await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });
    const second = await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });

    expect(second.id).toBe(first.id);
  });

  it('rejects missing and disabled catalog products with stable errors', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'catalog-user', passwordHash: 'hash' });

    await expect(service.createOrder(context, { productId: 'missing', quantity: 1, idempotencyKey: 'missing-product' }))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });

    const disabledRepository = new DisabledAddonRepository();
    const disabledContext = await disabledRepository.createUserWithOrganization({ username: 'disabled-user', passwordHash: 'hash' });
    const disabledService = new BillingService(disabledRepository, { paymentMode: 'mock' });
    await expect(disabledService.createOrder(disabledContext, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'disabled-product' }))
      .rejects.toMatchObject({ code: 'PRODUCT_DISABLED' });
  });

  it.each([0, 101, 1.5])('rejects invalid quantity %s', async (quantity) => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: `quantity-${quantity}`, passwordHash: 'hash' });

    await expect(service.createOrder(context, { productId: 'addon.ai.pro', quantity, idempotencyKey: `quantity-${quantity}` }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it.each(['', '   ', 'x'.repeat(129)])('rejects malformed idempotency key', async (idempotencyKey) => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: `key-${idempotencyKey.length}`, passwordHash: 'hash' });

    await expect(service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a reused key with a different request', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'conflict-user', passwordHash: 'hash' });
    await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });

    await expect(service.createOrder(context, { productId: 'addon.ai.pro', quantity: 2, idempotencyKey: 'checkout-1' }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(service.createOrder(context, { productId: 'missing', quantity: 1, idempotencyKey: 'checkout-1' }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('converges concurrent identical requests on one order', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'concurrent-user', passwordHash: 'hash' });

    const orders = await Promise.all(Array.from({ length: 8 }, () => service.createOrder(context, {
      productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'concurrent-checkout',
    })));

    expect(new Set(orders.map((order) => order.id)).size).toBe(1);
  });

  it('allows different organizations to reuse an idempotency key', async () => {
    const { repository, service } = createService();
    const first = await repository.createUserWithOrganization({ username: 'org-one', passwordHash: 'hash' });
    const second = await repository.createUserWithOrganization({ username: 'org-two', passwordHash: 'hash' });

    const [firstOrder, secondOrder] = await Promise.all([
      service.createOrder(first, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' }),
      service.createOrder(second, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' }),
    ]);

    expect(firstOrder.id).not.toBe(secondOrder.id);
    expect(firstOrder.organizationId).not.toBe(secondOrder.organizationId);
  });

  it('fails closed when user context bindings do not match', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'context-user', passwordHash: 'hash' });
    const mismatched = { ...context, membership: { ...context.membership, userId: 'other-user' } };

    await expect(service.createOrder(mismatched, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' }))
      .rejects.toMatchObject({ code: 'CONTEXT_MISMATCH' });
  });

  it('does not settle a foreign organization order before mutating it', async () => {
    const { repository, service } = createService();
    const buyer = await repository.createUserWithOrganization({ username: 'buyer', passwordHash: 'hash' });
    const foreign = await repository.createUserWithOrganization({ username: 'foreign', passwordHash: 'hash' });
    const order = await service.createOrder(buyer, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });

    const foreignAdmin = { ...foreign, user: { ...foreign.user, platformRole: 'platform_admin' as const } };
    await expect(service.settleMockOrder(foreignAdmin, order.id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    await expect(repository.findOrderById(order.id)).resolves.toMatchObject({ status: 'pending', paidAt: null });
  });

  it('disables mock settlement unless explicitly configured for mock mode', async () => {
    const { repository, service } = createService('disabled');
    const context = await repository.createUserWithOrganization({ username: 'disabled-payment', passwordHash: 'hash' });
    const order = await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });

    await expect(service.settleMockOrder(context, order.id)).rejects.toMatchObject({ code: 'PAYMENT_MODE_DISABLED' });
    await expect(repository.findOrderById(order.id)).resolves.toMatchObject({ status: 'pending' });
  });

  it('settles add-ons once and returns the refreshed entitlement union', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'settle-user', passwordHash: 'hash' });
    const order = await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });

    const result = await service.settleMockOrder(context, order.id);

    expect(result.order).toMatchObject({ id: order.id, status: 'paid', paidAt: expect.any(String) });
    expect(result.entitlement).toMatchObject({ features: expect.arrayContaining(['monitoring.basic', 'ai.diagnosis']), limits: { aiMonthly: 505 } });
  });

  it('returns the same paid order and entitlement on repeated settlement', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'repeat-settle', passwordHash: 'hash' });
    const order = await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });

    const first = await service.settleMockOrder(context, order.id);
    const second = await service.settleMockOrder(context, order.id);

    expect(second.order).toEqual(first.order);
    expect(second.entitlement).toEqual(first.entitlement);
  });

  it('does not settle a cancelled order or grant its entitlement', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'cancelled-order', passwordHash: 'hash' });
    const cancelledOrder: Order = {
      id: 'cancelled-order', organizationId: context.organization.id, productId: 'addon.ai.pro', quantity: 1,
      idempotencyKey: 'cancelled-checkout', amountFen: 9_900, currency: 'CNY', status: 'cancelled',
      createdAt: '2030-01-01T00:00:00.000Z', paidAt: null,
    };
    await repository.createOrder(cancelledOrder);

    await expect(service.settleMockOrder(context, cancelledOrder.id)).rejects.toMatchObject({ code: 'ORDER_NOT_SETTLEABLE' });
    await expect(repository.findOrderById(cancelledOrder.id)).resolves.toMatchObject({ status: 'cancelled', paidAt: null });
    await expect(repository.getEntitlementSnapshot(context.organization.id)).resolves.toMatchObject({
      features: ['monitoring.basic'], limits: { aiMonthly: 5 },
    });
  });

  it('returns the same non-enumerating error for missing orders', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'missing-order', passwordHash: 'hash' });

    await expect(service.settleMockOrder(context, 'missing-order')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('keeps catalog and returned order data defensive', async () => {
    const { repository, service } = createService();
    const context = await repository.createUserWithOrganization({ username: 'defensive-user', passwordHash: 'hash' });
    const catalog = await repository.listProducts();
    catalog.find((product) => product.id === 'addon.ai.pro')!.amountFen = 1;

    const order = await service.createOrder(context, { productId: 'addon.ai.pro', quantity: 1, idempotencyKey: 'checkout-1' });
    order.amountFen = 1;

    expect((await repository.listProducts()).find((product) => product.id === 'addon.ai.pro')).toMatchObject({ amountFen: 9_900 });
    expect(await repository.findOrderById(order.id)).toMatchObject({ amountFen: 9_900 });
  });
});

class DisabledAddonRepository extends MemorySaasRepository {
  override async listProducts(): Promise<Product[]> {
    return (await super.listProducts()).map((product) => (
      product.id === 'addon.ai.pro' ? { ...product, enabled: false } : product
    ));
  }
}
