import { initTheme } from '@szybko/ui-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FloatingApp } from './pages/floating/FloatingApp';
import App from './pages/shell/Shell';

initTheme();

function createRootElement(selector: string): HTMLElement {
    const el = document.querySelector(selector);
    if (!el) {
        throw new Error(
            `[renderer] Root element "${selector}" not found. `
            + 'Ensure the HTML template has a matching element.',
        );
    }
    return el as HTMLElement;
}

function wrapStrictMode(children: React.ReactNode) {
    return <StrictMode>{children}</StrictMode>;
}

export function mountMain(selector = '#root') {
    const el = createRootElement(selector);
    createRoot(el).render(wrapStrictMode(<App />));
}

export function mountFloating(selector = '#root') {
    const el = createRootElement(selector);
    createRoot(el).render(wrapStrictMode(<FloatingApp />));
}
