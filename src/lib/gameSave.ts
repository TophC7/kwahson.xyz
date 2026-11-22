import type { Scope } from './scope';

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in private browsing or full quota.
  }
}

export function readHashCode(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('g');
}

export function writeHashCode(code: string): void {
  history.replaceState(
    history.state,
    '',
    window.location.pathname + window.location.search + '#g=' + code,
  );
}

/** Runs `save` whenever the page is hidden or unloaded (covers mobile tab-switching and PWA kills). */
export function onLeavePage(scope: Scope, save: () => void): void {
  const onVis = () => {
    if (document.visibilityState === 'hidden') save();
  };
  document.addEventListener('visibilitychange', onVis, { signal: scope.signal });
  window.addEventListener('pagehide', save, { signal: scope.signal });
}
