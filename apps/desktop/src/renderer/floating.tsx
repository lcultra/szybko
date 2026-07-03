import { initTheme } from '@szybko/design-system';
import { DetachedApp } from '@szybko/shell';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './main.css';

initTheme();

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <DetachedApp />
        </StrictMode>,
    );
}
