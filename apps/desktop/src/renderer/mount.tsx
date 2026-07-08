import { initTheme } from '@szybko/ui-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { FloatingApp } from './pages/floating/FloatingApp';
import App from './pages/shell/Shell';

initTheme();

/**
 * 从 Electron 主进程获取布局常量，设为 CSS 自定义属性。
 * 保证前端 CSS（如 h-header）值与后端偏移计算一致。
 */
async function initLayoutConstants(): Promise<void> {
    const api = window.szybkoInternal?.getLayoutConstants;
    if (!api)
        return;
    const { css } = await api();
    const root = document.documentElement;
    for (const [name, val] of Object.entries(css))
        root.style.setProperty(name, val);
}

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

export async function mountMain(selector = '#root') {
    await initLayoutConstants();
    const el = createRootElement(selector);
    createRoot(el).render(wrapStrictMode(<App />));
}

export async function mountFloating(selector = '#root') {
    await initLayoutConstants();
    const el = createRootElement(selector);
    createRoot(el).render(wrapStrictMode(<FloatingApp />));
}
