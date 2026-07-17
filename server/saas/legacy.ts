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
