function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

class Router {
  pathname = $state(normalizePath(window.location.pathname));

  constructor() {
    window.addEventListener('popstate', () => {
      this.pathname = normalizePath(window.location.pathname);
    });

    // Bubble-phase on window so Svelte's delegated document handlers run first and can preventDefault.
    window.addEventListener('click', (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const next = normalizePath(url.pathname);
      if (next === this.pathname && url.hash) return;

      event.preventDefault();
      if (next !== this.pathname) {
        history.pushState({}, '', next);
        this.pathname = next;
      }
    });
  }

  get slug(): string | null {
    return this.pathname === '/' ? null : this.pathname.slice(1);
  }
}

export const router = new Router();
