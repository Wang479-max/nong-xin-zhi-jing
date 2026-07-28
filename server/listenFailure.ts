export type ListenFailureAction = 'retry-random-port' | 'terminated';

export interface ListenFailureDependencies {
  production: boolean;
  allowDevelopmentFallback: boolean;
  closeRuntime(): Promise<void>;
  exit(code: number): void;
  logError(message: string, error?: unknown): void;
}

export async function handleListenFailure(
  error: unknown,
  dependencies: ListenFailureDependencies,
): Promise<ListenFailureAction> {
  if (!dependencies.production
    && dependencies.allowDevelopmentFallback
    && errorCode(error) === 'EADDRINUSE') {
    return 'retry-random-port';
  }

  dependencies.logError('[Server] HTTP 监听失败，正在关闭服务。', error);
  try {
    await dependencies.closeRuntime();
  } catch (closeError) {
    dependencies.logError('[Server] 监听失败后关闭 SaaS 运行时失败。', closeError);
  }
  dependencies.exit(1);
  return 'terminated';
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
