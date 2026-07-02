import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '@szybko/launcher'
import '@szybko/design-system/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
