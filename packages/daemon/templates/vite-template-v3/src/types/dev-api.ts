export interface DevAPI {
  execute: <T = any>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
}

declare global {
  interface Window {
    dev?: DevAPI;
  }
}
