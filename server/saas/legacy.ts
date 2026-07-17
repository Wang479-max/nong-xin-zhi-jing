import type { RequestHandler } from 'express';

export const legacyUserApiDisabled: RequestHandler = (_request, response) => {
  response.status(410).json({
    success: false,
    error: {
      code: 'LEGACY_USER_API_DISABLED',
      message: 'Legacy user APIs are disabled. Use authenticated /api/v1 APIs.',
    },
  });
};

export const legacyCommerceApiDisabled: RequestHandler = (_request, response) => {
  response.status(410).json({
    success: false,
    error: {
      code: 'LEGACY_COMMERCE_API_DISABLED',
      message: 'Legacy commerce APIs are disabled. Use /api/v1/catalog and /api/v1/orders.',
    },
  });
};
