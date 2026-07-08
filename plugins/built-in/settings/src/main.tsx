import { initTheme } from '@szybko/ui-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './style.css';

initTheme();

window.szybko.onPluginEnter((payload) => {
    console.error('插件进入 UI 模式', payload);
});

window.szybko.onPluginOut((payload) => {
    console.error('插件离开 UI 模式', payload);
});

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
