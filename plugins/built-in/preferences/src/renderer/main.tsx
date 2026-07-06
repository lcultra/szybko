import { initTheme } from '@szybko/ui-kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './style.css';

initTheme();

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
