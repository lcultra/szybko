import { initTheme } from '@szybko/design-system';
import { App } from '@szybko/launcher';
import React from 'react';
import ReactDOM from 'react-dom/client';

import './main.css';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
