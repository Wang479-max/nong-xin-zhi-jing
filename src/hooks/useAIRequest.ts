import { useState, useCallback } from 'react';

interface AIRequestState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  progress: number;
  stepText: string;
}

export function useAIRequest<T, P extends any[]>(apiFunc: (...args: P) => Promise<T>) {
  const [state, setState] = useState<AIRequestState<T>>({
    data: null,
    isLoading: false,
    error: null,
    progress: 0,
    stepText: 'idle'
  });

  const [lastArgs, setLastArgs] = useState<any[] | null>(null);

  const request = useCallback(async (...args: any[]) => {
    setLastArgs(args);
    const lastArg = args[args.length - 1];
    const hasSteps = typeof lastArg === 'object' && lastArg !== null && 'steps' in lastArg && Array.isArray(lastArg.steps);
    const steps = hasSteps ? (lastArg as any).steps : null;
    const actualArgs = hasSteps ? args.slice(0, -1) : args;

    setState({
      data: null,
      isLoading: true,
      error: null,
      progress: 0,
      stepText: steps ? steps[0] : 'initializing'
    });

    let isFinished = false;

    // Start API call immediately
    const apiPromise = apiFunc(...(actualArgs as unknown as P));

    // Simulate progress in background if steps are provided
    if (steps && steps.length > 0) {
      const isTurbo = typeof window !== 'undefined' && localStorage.getItem('ai_turbo_mode') === 'true';
      const stepDelay = isTurbo ? 40 : 200;
      (async () => {
        for (let i = 0; i < steps.length; i++) {
          if (isFinished) break;
          setState(prev => ({
            ...prev,
            stepText: steps[i],
            progress: Math.min(95, Math.round(((i + 1) / (steps.length + 1)) * 100))
          }));
          await new Promise(resolve => setTimeout(resolve, stepDelay));
        }
      })();
    }

    try {
      const result = await apiPromise;
      isFinished = true;

      setState({
        data: result,
        isLoading: false,
        error: null,
        progress: 100,
        stepText: 'completed'
      });

      return result;
    } catch (err: any) {
      isFinished = true;
      const errorMessage = err.message || 'An unexpected error occurred during AI analysis.';
      setState({
        data: null,
        isLoading: false,
        error: errorMessage,
        progress: 0,
        stepText: 'failed'
      });
      throw err;
    }
  }, [apiFunc]);

  const retry = useCallback(() => {
    if (lastArgs) {
      return request(...lastArgs);
    }
  }, [lastArgs, request]);

  const reset = useCallback(() => {
    setState({
      data: null,
      isLoading: false,
      error: null,
      progress: 0,
      stepText: 'idle'
    });
    setLastArgs(null);
  }, []);

  return {
    ...state,
    request,
    retry,
    reset
  };
}
