function normalizePath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

class Router {
  pathname = $state(normalizePath(window.location.pathname));
  search = $state(window.location.search);

  constructor() {
    window.addEventListener('popstate', () => {
      this.pathname = normalizePath(window.location.pathname);
      this.search = window.location.search;
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

      const nextPath = normalizePath(url.pathname);
      if (nextPath === this.pathname && url.search === this.search && url.hash) return;

      event.preventDefault();
      if (nextPath !== this.pathname || url.search !== this.search) {
        history.pushState({}, '', nextPath + url.search);
        this.pathname = nextPath;
        this.search = url.search;
      }
    });
  }

  replace(pathWithSearch: string) {
    const url = new URL(pathWithSearch, window.location.origin);
    const nextPath = normalizePath(url.pathname);
    history.replaceState(history.state, '', nextPath + url.search + window.location.hash);
    this.pathname = nextPath;
    this.search = url.search;
  }

  get slug(): string | null {
    return this.pathname === '/' ? null : this.pathname.slice(1);
  }
}

export const router = new Router();
