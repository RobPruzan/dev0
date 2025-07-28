import React, { useState } from "react";

type AsyncifyFunction<T> = T extends (...args: infer Args) => infer R
  ? (...args: Args) => Promise<R>
  : T;

type AsyncifyArgs<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? AsyncifyFunction<T[K]>
    : T[K];
};

type ExecuteFunction = <TArgs extends readonly unknown[], TResult>(
  fn: (...args: AsyncifyArgs<TArgs>) => TResult | Promise<TResult>,
  ...args: TArgs
) => Promise<TResult>;

interface DevAPI {
  execute: ExecuteFunction;
}

declare global {
  interface Window {
    dev?: DevAPI;
  }
}

/**
 * Type-safe wrapper for window.dev.execute
 *
 * @example
 * ```typescript
 * // Simple function execution
 * const result = await devExecute(
 *   () => document.title,
 * );
 *
 * // With function arguments (automatically async)
 * const [count, setCount] = useState(0);
 * await devExecute(
 *   async (updateCount) => {
 *     await updateCount(prev => prev + 1);
 *   },
 *   setCount
 * );
 *
 * // Multiple function arguments
 * await devExecute(
 *   async (updateCount, updateMessage) => {
 *     await updateMessage("Processing...");
 *     await updateCount(prev => prev + 1);
 *     await updateMessage("Done!");
 *   },
 *   setCount,
 *   setMessage
 * );
 * ```
 */
export const devExecute: ExecuteFunction = async (fn, ...args) => {
  if (!window.dev) {
    throw new Error(
      "Dev API not available. Make sure instrumentation is loaded."
    );
  }

  return window.dev.execute(fn, ...args);
};

/**
 * Check if the dev API is available
 */
export const isDevAvailable = (): boolean => {
  return !!(window.dev && window.__DEV0__?.ready);
};

/**
 * Wait for the dev API to be ready
 */
export const waitForDev = async (timeout = 5000): Promise<void> => {
  const startTime = Date.now();

  while (!isDevAvailable()) {
    if (Date.now() - startTime > timeout) {
      throw new Error("Dev API initialization timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

/**
 * Higher-order function to create type-safe dev execute functions
 *
 * @example
 * ```typescript
 * const executeInParent = createDevExecutor<[string], string>();
 * const result = await executeInParent(
 *   (message) => `Parent says: ${message}`,
 *   "Hello"
 * );
 * ```
 */
export function createDevExecutor<
  TArgs extends readonly unknown[] = [],
  TResult = void
>(): (
  fn: (...args: AsyncifyArgs<TArgs>) => TResult | Promise<TResult>,
  ...args: TArgs
) => Promise<TResult> {
  return (fn, ...args) => devExecute(fn, ...args);
}

/**
 * React hook for dev execute with loading and error states
 */
export function useDevExecute() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const executeInParent = React.useCallback(
    async <TArgs extends readonly unknown[], TResult>(
      fn: (...args: AsyncifyArgs<TArgs>) => TResult | Promise<TResult>,
      ...args: TArgs
    ): Promise<TResult | undefined> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await devExecute(fn, ...args);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Unknown error");
        setError(error);
        console.error("Dev execute error:", error);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    executeInParent,
    isLoading,
    error,
    isReady: isDevAvailable(),
  };
}
