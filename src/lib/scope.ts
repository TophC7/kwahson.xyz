export interface Scope {
  /** Aborts on dispose; pass it to addEventListener. */
  readonly signal: AbortSignal;
  /** Registers teardown, run newest first after the signal aborts. */
  add(...fns: (() => void)[]): void;
  dispose(): void;
}

/** A throw mid-mount runs the teardown registered so far, then rethrows. */
export function scoped<T>(mount: (scope: Scope) => T): T {
  const abort = new AbortController();
  const cleanups: (() => void)[] = [];
  const scope: Scope = {
    signal: abort.signal,
    add: (...fns) => { cleanups.push(...fns); },
    dispose() {
      if (abort.signal.aborted) return;
      abort.abort();
      while (cleanups.length) cleanups.pop()!();
    },
  };
  try {
    return mount(scope);
  } catch (err) {
    scope.dispose();
    throw err;
  }
}
