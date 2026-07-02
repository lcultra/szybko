export type ThemeVariant = 'light' | 'dark';

export function initTheme(): void {
    const theme = getTheme();
    document.documentElement.dataset.theme = theme;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    });
}

export function getTheme(): ThemeVariant {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function onThemeChange(cb: (theme: ThemeVariant) => void): () => void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
}
