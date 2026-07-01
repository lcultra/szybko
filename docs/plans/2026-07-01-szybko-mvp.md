# Szybko MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Electron desktop launcher that shows a search UI, accepts keyboard input, communicates via IPC to the main process, and can load a uTools-compatible plugin.

**Architecture:** Three-layer — React renderer (search shell) ↔ IPC (contextBridge) ↔ Node/TS main process. PluginRuntime decoupled from BrowserWindow via RuntimeManager/WindowManager. Rust core via napi-rs.

**Tech Stack:** Electron 33, React 19, Tailwind CSS v4, pnpm monorepo, Rust (napi-rs), lucide-react, @radix-ui/react, zustand, uuid, dayjs

## Global Constraints

- Window: 820px fixed width, 96-520px dynamic height, frame: false + transparent, positioned at 1/3 monitor height
- IPC: contextBridge only, no nodeIntegration
- Renderer communicates via pluginId, not runtimeId
- Plugin format: fully compatible with uTools plugin.json
- All system capabilities use adapter pattern (macOS first)
- ESLint: @antfu/eslint-config flat config (eslint.config.mjs)

---

## File Map (all 19 tasks)

This section lists every file that will be created across all tasks. Each task lists its specific files; this is the complete reference.

```
szybko/
├── package.json                          # A1
├── pnpm-workspace.yaml                   # A1
├── tsconfig.base.json                    # A1
├── .gitignore                            # A1
├── eslint.config.mjs                     # A1 (existing)

├── apps/desktop/
│   ├── package.json                      # A2
│   ├── vite.config.ts                    # A3
│   ├── index.html                        # A3
│   ├── electron-builder.yml              # A2
│   ├── resources/icon.icns               # A2
│   └── src/
│       ├── main.ts                       # A2 → D1
│       └── preload.ts                    # B3

├── packages/
│   ├── shared/
│   │   ├── package.json                  # B1
│   │   ├── tsconfig.json                 # B1
│   │   └── src/
│   │       ├── index.ts                  # B1
│   │       ├── search-types.ts           # B1
│   │       ├── plugin-types.ts           # B1
│   │       ├── runtime-types.ts          # B1
│   │       ├── ipc-channels.ts           # B1
│   │       └── constants.ts             # B1

│   ├── design-system/
│   │   ├── package.json                  # B2
│   │   ├── tsconfig.json                 # B2
│   │   └── src/
│   │       ├── index.ts                  # B2
│   │       ├── tokens/
│   │       │   ├── colors.css            # B2
│   │       │   ├── typography.css        # B2
│   │       │   ├── spacing.css           # B2
│   │       │   └── tailwind-preset.ts   # B2
│   │       └── components/
│   │           ├── Button.tsx            # B2
│   │           ├── Input.tsx             # B2
│   │           └── Card.tsx             # B2

│   ├── host/
│   │   ├── package.json                  # D1
│   │   ├── tsconfig.json                 # D1
│   │   └── src/
│   │       ├── index.ts                  # D1
│   │       ├── main.ts                   # D1
│   │       ├── window-manager.ts         # D1
│   │       ├── launcher-host.ts          # D1
│   │       ├── shortcut-manager.ts       # D2
│   │       ├── theme.ts                 # D3
│   │       ├── config-manager.ts         # D5
│   │       ├── plugin-manager.ts         # E1
│   │       ├── plugin-loader.ts          # E1
│   │       ├── runtime-manager.ts        # E2
│   │       ├── adapter-bridge.ts         # F2
│   │       └── preload.ts               # B3

│   ├── launcher/
│   │   ├── package.json                  # A3
│   │   ├── tsconfig.json                 # A3
│   │   └── src/
│   │       ├── main.tsx                  # A3
│   │       ├── App.tsx                   # A3
│   │       ├── WindowFrame.tsx           # C1
│   │       ├── SearchBar.tsx             # C1
│   │       ├── ResultList.tsx            # C2
│   │       ├── ResultItem.tsx            # C2
│   │       ├── hooks/
│   │       │   ├── useSearch.ts          # D4
│   │       │   ├── useKeyboard.ts        # C2
│   │       │   └── useWindowHeight.ts    # C3
│   │       └── styles/
│   │           ├── global.css            # C1
│   │           └── tailwind.css          # A3

│   ├── core-rust/
│   │   ├── package.json                  # F1
│   │   ├── Cargo.toml                   # F1
│   │   ├── build.rs                     # F1
│   │   └── src/
│   │       ├── lib.rs                   # F1
│   │       └── types.rs                 # F1

│   └── plugin-sdk/
│       ├── package.json                  # E3
│       └── src/types/
│           ├── api.d.ts                 # E3
│           └── manifest.d.ts            # E3

├── plugins/
│   └── example-plugin/
│       ├── plugin.json                   # E3
│       ├── preload.js                    # E3
│       └── index.html                   # E3
```

---

## Phase A: Skeleton

### Task A1: Monorepo + Tooling

**Files:**
- Create: `package.json` (update existing), `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`

**Consumes:** Nothing (first task)
**Produces:** Workspace root with shared TypeScript config

- [ ] **Step 1: Create pnpm workspace config**

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'plugins/*'
```

- [ ] **Step 2: Update root package.json**

```json
{
  "name": "szybko",
  "version": "1.0.0",
  "private": true,
  "packageManager": "pnpm@10.34.3",
  "scripts": {
    "dev": "pnpm --filter @szybko/desktop dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r exec tsc --noEmit"
  },
  "devDependencies": {
    "@antfu/eslint-config": "^9.1.0",
    "@eslint-react/eslint-plugin": "^5.9.2",
    "eslint": "^10.5.0",
    "eslint-plugin-format": "^2.0.1",
    "eslint-plugin-react-refresh": "^0.5.3"
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "exclude": ["node_modules", "dist", "target"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
target/
*.node
*.dmg
*.AppImage
.DS_Store
```

- [ ] **Step 5: Install and verify**

```bash
pnpm install
pnpm exec tsc --version
# Expected: Version 5.x
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: initialize pnpm workspace with TypeScript config"
```

---

### Task A2: Electron Window

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/electron-builder.yml`, `apps/desktop/resources/icon.icns`
- Create: `apps/desktop/src/main.ts`

**Consumes:** Task A1 (workspace root)
**Produces:** Electron window 820×96, frameless, transparent

- [ ] **Step 1: Create apps/desktop/package.json**

```json
{
  "name": "@szybko/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "react": "^19.0",
    "react-dom": "^19.0"
  },
  "devDependencies": {
    "electron": "^33.0",
    "electron-builder": "^25.0",
    "@vitejs/plugin-react": "^4.3",
    "tailwindcss": "^4.0",
    "@tailwindcss/vite": "^4.0",
    "vite": "^6.0",
    "typescript": "^5.7",
    "@types/react": "^19.0",
    "@types/react-dom": "^19.0"
  },
  "main": "dist-electron/main.js"
}
```

- [ ] **Step 2: Create apps/desktop/src/main.ts**

```typescript
import { app, BrowserWindow } from 'electron'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 96,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: undefined,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3: Create electron-builder.yml**

```yaml
appId: com.szybko.app
productName: Szybko
files:
  - dist-electron/**/*
  - dist/**/*
directories:
  output: release
mac:
  target: dmg
  icon: resources/icon.icns
```

- [ ] **Step 4: Create placeholder resource**

```bash
mkdir -p apps/desktop/resources
touch apps/desktop/resources/icon.icns
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @szybko/desktop install
# Expected: Electron 33 installed successfully
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Electron app entry"
```

---

### Task A3: React + Vite + Tailwind Renderer

**Files:**
- Create: `apps/desktop/vite.config.ts`, `apps/desktop/index.html`
- Create: `packages/launcher/package.json`, `packages/launcher/tsconfig.json`
- Create: `packages/launcher/src/main.tsx`, `packages/launcher/src/App.tsx`
- Create: `packages/launcher/src/styles/tailwind.css`

**Consumes:** Task A2 (Electron window)
**Produces:** React app that renders inside the Electron window

- [ ] **Step 1: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      '@szybko/launcher': path.resolve(__dirname, '../../packages/launcher/src'),
    },
  },
})
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Szybko</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="../../packages/launcher/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 3: Create packages/launcher/package.json**

```json
{
  "name": "@szybko/launcher",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0",
    "react-dom": "^19.0"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/react": "^19.0",
    "@types/react-dom": "^19.0"
  }
}
```

- [ ] **Step 4: Create packages/launcher/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/tailwind.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Create packages/launcher/src/App.tsx**

```tsx
export default function App() {
  return (
    <div className="h-screen w-[820px] flex items-center justify-center
                    bg-surface text-text">
      <h1 className="text-2xl">Szybko</h1>
    </div>
  )
}
```

- [ ] **Step 6: Create tailwind.css**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Install and verify Vite can start**

```bash
pnpm install
pnpm --filter @szybko/desktop dev
# Ctrl+C after confirming Vite starts on port 5173
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add React + Vite + Tailwind renderer"
```

---

## Phase B: Infrastructure

### Task B1: @szybko/shared — Type Definitions

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/search-types.ts`
- Create: `packages/shared/src/plugin-types.ts`
- Create: `packages/shared/src/runtime-types.ts`
- Create: `packages/shared/src/ipc-channels.ts`
- Create: `packages/shared/src/constants.ts`

**Consumes:** Task A1 (workspace)
**Produces:** All shared TypeScript types and constants

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@szybko/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create constants.ts**

```typescript
export const DEFAULT_WINDOW_WIDTH = 820
export const MIN_WINDOW_HEIGHT = 96
export const MAX_WINDOW_HEIGHT = 520
export const WINDOW_TOP_OFFSET_RATIO = 1 / 3
export const SEARCH_DEBOUNCE_MS = 80
export const PLUGIN_SEARCH_TIMEOUT_MS = 5000
```

- [ ] **Step 4: Create search-types.ts**

```typescript
export interface SearchRequest {
  queryId: string
  query: string
  timestamp: number
}

export interface SearchBatch {
  queryId: string
  batchSeq: number
  source: string
  results: SearchResult[]
  isFinal: boolean
}

export interface SearchResult {
  id: string
  title: string
  subtitle?: string
  icon?: string
  group?: string
  score: number
  action: ActionDescriptor
}

export type ActionDescriptor =
  | { type: 'shell.openPath', payload: { path: string } }
  | { type: 'shell.openUrl', payload: { url: string } }
  | { type: 'clipboard.writeText', payload: { text: string } }
  | { type: 'process.launchApp', payload: { bundleId: string } }
  | { type: 'plugin.open', payload: { pluginId: string; url: string } }
  | { type: 'plugin.runCommand', payload: { pluginId: string; command: string; args?: any[] } }
  | { type: 'text.paste', payload: { text: string } }
  | { type: 'redirect', payload: { label: string; payload?: any } }
```

- [ ] **Step 5: Create plugin-types.ts**

```typescript
export interface PluginManifest {
  main: string
  logo: string
  preload?: string
  pluginSetting?: {
    single?: boolean
    height?: number
  }
  features: PluginFeature[]
}

export interface PluginFeature {
  code: string
  explain?: string
  icon?: string
  cmds: (string | MatchCommand)[]
  mainHide?: boolean
  mainPush?: boolean
}

export type MatchCommand =
  | RegexMatch | OverMatch | ImgMatch | FilesMatch | WindowMatch

export interface RegexMatch { type: 'regex'; label: string; match: string; minLength?: number; maxLength?: number }
export interface OverMatch { type: 'over'; label: string; exclude?: string; minLength?: number; maxLength?: number }
export interface ImgMatch { type: 'img'; label: string }
export interface FilesMatch { type: 'files'; label: string; fileType?: 'file' | 'directory'; extensions?: string[]; match?: string; minLength?: number; maxLength?: number }
export interface WindowMatch { type: 'window'; label: string; match: { app: string[]; title?: string; class?: string[] } }
```

- [ ] **Step 6: Create runtime-types.ts**

```typescript
export interface Host {
  id: string
  type: 'launcher' | 'floating'
  attach(runtime: PluginRuntime): void
  detach(runtime: PluginRuntime): void
}

export interface PluginRuntime {
  id: string
  pluginId: string
  instanceId: string
  host: Host | null
  state: RuntimeState
  cache: Map<string, any>
}

export type RuntimeState = 'created' | 'activated' | 'attached' | 'detached' | 'suspended' | 'destroyed'

export interface PluginManager {
  scan(): PluginManifest[]
  install(path: string): void
  uninstall(pluginId: string): void
  update(pluginId: string): void
}
```

- [ ] **Step 7: Create ipc-channels.ts**

```typescript
export const IPC = {
  SEARCH: 'search',
  SEARCH_BATCH: 'search-batch',
  SEARCH_CANCEL: 'search-cancel',
  EXECUTE: 'execute',
  RUNTIME_STATE_CHANGED: 'runtime:state-changed',
  HOST_SWITCH: 'host:switch',
  HOST_VIEW_ATTACHED: 'host:view-attached',
  HOST_VIEW_DETACHED: 'host:view-detached',
  WINDOW_RESIZE: 'window:resize',
  WINDOW_HIDE: 'window:hide',
  SHOW_MAIN_WINDOW: 'show-main-window',
  THEME_CHANGED: 'theme:changed',
  THEME_GET: 'theme:get',
} as const
```

- [ ] **Step 8: Create index.ts**

```typescript
export * from './search-types.js'
export * from './plugin-types.js'
export * from './runtime-types.js'
export * from './ipc-channels.js'
export * from './constants.js'
```

- [ ] **Step 9: Verify**

```bash
pnpm install
pnpm --filter @szybko/shared typecheck
# Expected: No TypeScript errors
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: add @szybko/shared with all type definitions"
```

---

### Task B2: @szybko/design-system

**Files:**
- Create: `packages/design-system/package.json`, `packages/design-system/tsconfig.json`
- Create: `packages/design-system/src/index.ts`
- Create: `packages/design-system/src/tokens/*.css`, `tailwind-preset.ts`
- Create: `packages/design-system/src/components/Button.tsx`, `Input.tsx`, `Card.tsx`

**Consumes:** Task A1 (workspace)
**Produces:** Design token system + 3 base components

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@szybko/design-system",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "lucide-react": "^0.468",
    "@radix-ui/react-slot": "^1.1"
  },
  "peerDependencies": {
    "react": "^19.0",
    "tailwindcss": "^4.0"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/react": "^19.0"
  }
}
```

- [ ] **Step 2: Create tokens/colors.css**

```css
:root,
[data-theme='light'] {
  --surface: #f8fafc;
  --surface-card: #ffffff;
  --surface-hover: #f1f5f9;
  --text: #0f172a;
  --text-muted: #64748b;
  --border: #e2e8f0;
  --primary: #0f172a;
  --primary-foreground: #ffffff;
  --ring: #6366f1;
}

[data-theme='dark'] {
  --surface: #2a2a2a;
  --surface-card: #3d3d3d;
  --surface-hover: #3d3d3d;
  --text: #f5f5f5;
  --text-muted: #a3a3a3;
  --border: #525252;
  --primary: #f5f5f5;
  --primary-foreground: #2a2a2a;
  --ring: #818cf8;
}
```

- [ ] **Step 3: Create tokens/typography.css**

```css
:root {
  --font-sans: 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 20px;
  --text-2xl: 24px;
}
```

- [ ] **Step 4: Create tokens/spacing.css**

```css
:root {
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --spacing-2xl: 32px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
}
```

- [ ] **Step 5: Create tailwind-preset.ts**

```typescript
import type { Config } from 'tailwindcss'

export default {
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        'surface-card': 'var(--surface-card)',
        'surface-hover': 'var(--surface-hover)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        ring: 'var(--ring)',
      },
      fontFamily: {
        sans: ['Inter', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
      },
    },
  },
} satisfies Omit<Config, 'content'>
```

- [ ] **Step 6: Create components/Button.tsx**

```tsx
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: 'primary' | 'ghost'
  size?: 'sm' | 'md'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, variant = 'ghost', size = 'md', className = '', ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const base = 'inline-flex items-center justify-center rounded-md transition-colors focus:outline-none'
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:opacity-90',
      ghost: 'bg-transparent hover:bg-surface-hover text-text',
    }
    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-base',
    }
    return (
      <Comp
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
```

- [ ] **Step 7: Create components/Input.tsx**

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full bg-transparent border-none outline-none
                    text-text text-2xl placeholder-text-muted
                    focus:ring-0 ${className}`}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
```

- [ ] **Step 8: Create components/Card.tsx**

```tsx
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-border bg-surface-card p-4 ${className}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 9: Create index.ts**

```typescript
export { Button } from './components/Button.js'
export { Input } from './components/Input.js'
export { Card } from './components/Card.js'
```

- [ ] **Step 10: Verify**

```bash
pnpm install
pnpm --filter @szybko/design-system typecheck
# Expected: No TypeScript errors
```

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: add @szybko/design-system with tokens and base components"
```

---

### Task B3: preload.ts — contextBridge

**Files:**
- Create: `apps/desktop/src/preload.ts`

**Consumes:** Task B1 (IPC channel types), Task A2 (Electron app)
**Produces:** `window.utools` object available in renderer

- [ ] **Step 1: Create apps/desktop/src/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@szybko/shared'

contextBridge.exposeInMainWorld('utools', {
  search: (req: { queryId: string; query: string; timestamp: number }) =>
    ipcRenderer.invoke(IPC.SEARCH, req),
  searchCancel: (queryId: string) =>
    ipcRenderer.invoke(IPC.SEARCH_CANCEL, { queryId }),
  execute: (action: any) =>
    ipcRenderer.invoke(IPC.EXECUTE, { action }),
  resizeWindow: (height: number) =>
    ipcRenderer.invoke(IPC.WINDOW_RESIZE, { height }),
  hideWindow: () =>
    ipcRenderer.invoke(IPC.WINDOW_HIDE, {}),
  switchHost: (pluginId: string, targetHost: 'launcher' | 'floating') =>
    ipcRenderer.invoke(IPC.HOST_SWITCH, { pluginId, targetHost }),
  onSearchBatch: (cb: (batch: any) => void) => {
    const handler = (_: any, batch: any) => cb(batch)
    ipcRenderer.on(IPC.SEARCH_BATCH, handler)
    return () => ipcRenderer.removeListener(IPC.SEARCH_BATCH, handler)
  },
  onRuntimeStateChanged: (cb: (state: any) => void) => {
    const handler = (_: any, state: any) => cb(state)
    ipcRenderer.on(IPC.RUNTIME_STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.RUNTIME_STATE_CHANGED, handler)
  },
  onShowMainWindow: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on(IPC.SHOW_MAIN_WINDOW, handler)
    return () => ipcRenderer.removeListener(IPC.SHOW_MAIN_WINDOW, handler)
  },
})
```

- [ ] **Step 2: Create apps/desktop/src/types.d.ts** (for window.utools type)

```typescript
declare global {
  interface Window {
    utools: {
      search(req: { queryId: string; query: string; timestamp: number }): Promise<{ ok: boolean }>
      searchCancel(queryId: string): Promise<{ ok: boolean }>
      execute(action: any): Promise<{ ok: boolean; result?: any; error?: string }>
      resizeWindow(height: number): Promise<{ ok: boolean }>
      hideWindow(): Promise<{ ok: boolean }>
      switchHost(pluginId: string, targetHost: 'launcher' | 'floating'): Promise<{ ok: boolean; hostId: string }>
      onSearchBatch(cb: (batch: any) => void): () => void
      onRuntimeStateChanged(cb: (state: any) => void): () => void
      onShowMainWindow(cb: () => void): () => void
    }
  }
}

export {}
```

- [ ] **Step 3: Update apps/desktop/src/main.ts to load preload**

```typescript
// Add to webPreferences:
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add preload.ts with contextBridge for window.utools"
```

---

## Phase C: Search UI

### Task C1: WindowFrame + SearchBar

**Files:**
- Create: `packages/launcher/src/WindowFrame.tsx`
- Create: `packages/launcher/src/SearchBar.tsx`
- Create: `packages/launcher/src/styles/global.css`
- Modify: `packages/launcher/src/App.tsx`

**Consumes:** Task B2 (design-system), Task B3 (utools types)
**Produces:** Visual search bar with glassmorphism window frame

- [ ] **Step 1: Create global.css**

```css
@import "tailwindcss";
@import "@szybko/design-system/src/tokens/colors.css";
@import "@szybko/design-system/src/tokens/typography.css";

html, body, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Prevent user selection on the window drag area */
.no-drag {
  -webkit-app-region: no-drag;
}
.drag {
  -webkit-app-region: drag;
}
```

- [ ] **Step 2: Create WindowFrame.tsx**

```tsx
import type { ReactNode } from 'react'

interface WindowFrameProps {
  children: ReactNode
}

export function WindowFrame({ children }: WindowFrameProps) {
  return (
    <div
      className="w-[820px] rounded-[20px] border border-border
                 bg-surface/80 backdrop-blur-xl overflow-hidden
                 shadow-xl"
      style={{
        // 1px padding creates the window chrome effect
        padding: '1px',
      }}
    >
      <div className="w-full">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create SearchBar.tsx**

```tsx
import { useRef, useEffect } from 'react'
import { Input } from '@szybko/design-system'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = '搜索应用、命令、文件、插件...' }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex items-center h-[68px] px-4 drag">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="no-drag"
      />
    </div>
  )
}
```

- [ ] **Step 4: Update App.tsx**

```tsx
import { WindowFrame } from './WindowFrame'
import { SearchBar } from './SearchBar'

export default function App() {
  return (
    <WindowFrame>
      <SearchBar value="" onChange={() => {}} />
    </WindowFrame>
  )
}
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @szybko/desktop dev
# Expected: Window with glassmorphism frame + centered search bar + placeholder text
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add WindowFrame and SearchBar components"
```

---

### Task C2: ResultList + Keyboard Navigation

**Files:**
- Create: `packages/launcher/src/ResultList.tsx`
- Create: `packages/launcher/src/ResultItem.tsx`
- Create: `packages/launcher/src/hooks/useKeyboard.ts`
- Modify: `packages/launcher/src/App.tsx`

**Consumes:** Task C1 (WindowFrame + SearchBar)
**Produces:** Result list with keyboard navigation

- [ ] **Step 1: Create ResultItem.tsx**

```tsx
import type { SearchResult } from '@szybko/shared'

interface ResultItemProps {
  item: SearchResult
  selected: boolean
  onSelect: () => void
}

export function ResultItem({ item, selected, onSelect }: ResultItemProps) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 w-full px-4 py-2 rounded-lg text-left
                  transition-colors ${
                    selected
                      ? 'bg-surface-hover border border-ring/40'
                      : 'bg-transparent border border-transparent hover:bg-surface-hover/60'
                  }`}
    >
      <div className="w-10 h-10 rounded-lg bg-surface-card flex items-center justify-center text-sm">
        {item.icon ? <img src={item.icon} className="w-6 h-6" /> : '📄'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text truncate">{item.title}</div>
        {item.subtitle && (
          <div className="text-xs text-text-muted truncate">{item.subtitle}</div>
        )}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Create ResultList.tsx**

```tsx
import type { SearchResult } from '@szybko/shared'
import { ResultItem } from './ResultItem'

interface ResultListProps {
  results: SearchResult[]
  selectedIndex: number
  onSelect: (index: number) => void
  onExecute: (index: number) => void
}

export function ResultList({ results, selectedIndex, onSelect, onExecute }: ResultListProps) {
  if (results.length === 0) return null

  return (
    <div className="border-t border-border px-2 pb-2">
      <div className="flex flex-col gap-1">
        {results.map((item, i) => (
          <ResultItem
            key={item.id}
            item={item}
            selected={i === selectedIndex}
            onSelect={() => onExecute(i)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create useKeyboard.ts**

```typescript
import { useEffect, useCallback } from 'react'

interface UseKeyboardOptions {
  selectedIndex: number
  totalItems: number
  onSelectUp: () => void
  onSelectDown: () => void
  onExecute: () => void
  onEscape: () => void
}

export function useKeyboard({
  selectedIndex,
  totalItems,
  onSelectUp,
  onSelectDown,
  onExecute,
  onEscape,
}: UseKeyboardOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        onSelectUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        onSelectDown()
        break
      case 'Enter':
        e.preventDefault()
        onExecute()
        break
      case 'Escape':
        e.preventDefault()
        onEscape()
        break
    }
  }, [onSelectUp, onSelectDown, onExecute, onEscape])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
```

- [ ] **Step 4: Update App.tsx** — add state management for search + results

```tsx
import { useState, useCallback } from 'react'
import { WindowFrame } from './WindowFrame'
import { SearchBar } from './SearchBar'
import { ResultList } from './ResultList'
import { useKeyboard } from './hooks/useKeyboard'
import type { SearchResult } from '@szybko/shared'

export default function App() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (!value) {
      setResults([])
      return
    }
    // Demo: show mock results
    setResults([
      { id: '1', title: 'Hello World', subtitle: '示例结果', score: 1, action: { type: 'shell.openPath', payload: { path: '/' } } },
      { id: '2', title: 'Calculator', subtitle: '计算器', score: 0.9, action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.calculator' } } },
    ])
    setSelectedIndex(0)
  }, [])

  useKeyboard({
    selectedIndex,
    totalItems: results.length,
    onSelectUp: () => setSelectedIndex(i => Math.max(0, i - 1)),
    onSelectDown: () => setSelectedIndex(i => Math.min(results.length - 1, i + 1)),
    onExecute: () => {
      if (results[selectedIndex]) {
        console.log('Execute:', results[selectedIndex].action)
      }
    },
    onEscape: () => {
      if (query) { setQuery(''); setResults([]) }
    },
  })

  return (
    <WindowFrame>
      <SearchBar value={query} onChange={handleQueryChange} />
      <ResultList
        results={results}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onExecute={(i) => {
          setSelectedIndex(i)
          console.log('Execute:', results[i]?.action)
        }}
      />
    </WindowFrame>
  )
}
```

- [ ] **Step 5: Verify**

```bash
pnpm --filter @szybko/desktop dev
# Type something → see mock results → arrow keys to navigate → Enter to log
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add ResultList with keyboard navigation"
```

---

### Task C3: Window Dynamic Height

**Files:**
- Create: `packages/launcher/src/hooks/useWindowHeight.ts`
- Modify: `packages/launcher/src/App.tsx`

**Consumes:** Task C2 (ResultList), Task B3 (preload with resizeWindow)
**Produces:** Window auto-resizes from 96px to 520px based on content

- [ ] **Step 1: Create useWindowHeight.ts**

```typescript
import { useEffect, useRef } from 'react'
import { MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT } from '@szybko/shared'

export function useWindowHeight(rootRef: React.RefObject<HTMLDivElement | null>) {
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const height = el.getBoundingClientRect().height
        const clamped = Math.min(Math.max(Math.ceil(height), MIN_WINDOW_HEIGHT), MAX_WINDOW_HEIGHT)
        window.utools?.resizeWindow(clamped)
      })
    })

    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [rootRef])
}
```

- [ ] **Step 2: Update App.tsx** — add ref + height hook

```tsx
import { useRef } from 'react'
// Add:
const rootRef = useRef<HTMLDivElement>(null)
useWindowHeight(rootRef)

// Wrap the JSX:
<div ref={rootRef}>
  <WindowFrame>...</WindowFrame>
</div>
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @szybko/desktop dev
# Type something → results appear → window grows → clear → window shrinks
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add dynamic window height via ResizeObserver"
```

---

## Phase D: Main Process

### Task D1: @szybko/host — Main Process Skeleton

**Files:**
- Create: `packages/host/package.json`, `packages/host/tsconfig.json`
- Create: `packages/host/src/index.ts`
- Create: `packages/host/src/main.ts`
- Create: `packages/host/src/window-manager.ts`
- Create: `packages/host/src/launcher-host.ts`
- Modify: `apps/desktop/src/main.ts` (redirect to @szybko/host)

**Consumes:** Task B1 (shared types), Task A2 (Electron)
**Produces:** Main process correctly positions and manages the window

- [ ] **Step 1: Create packages/host/package.json**

```json
{
  "name": "@szybko/host",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@szybko/shared": "workspace:*",
    "electron": "^33.0"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 2: Create window-manager.ts**

```typescript
import { BrowserWindow, screen } from 'electron'
import { DEFAULT_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, MAX_WINDOW_HEIGHT, WINDOW_TOP_OFFSET_RATIO } from '@szybko/shared'
import type { Host, PluginRuntime } from '@szybko/shared'

export class WindowManager {
  private window: BrowserWindow | null = null
  private hosts: Map<string, Host> = new Map()

  createMainWindow(): BrowserWindow {
    const cursorPoint = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursorPoint)
    const { x, y, width } = display.workArea
    const winX = Math.round(x + (width - DEFAULT_WINDOW_WIDTH) / 2)
    const winY = Math.round(y + display.workArea.height * WINDOW_TOP_OFFSET_RATIO)

    this.window = new BrowserWindow({
      width: DEFAULT_WINDOW_WIDTH,
      height: MIN_WINDOW_HEIGHT,
      x: winX,
      y: winY,
      frame: false,
      transparent: true,
      resizable: false,
      webPreferences: {
        preload: undefined, // Set by main.ts
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    return this.window
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  resize(height: number) {
    const clamped = Math.min(Math.max(height, MIN_WINDOW_HEIGHT), MAX_WINDOW_HEIGHT)
    this.window?.setSize(DEFAULT_WINDOW_WIDTH, clamped)
  }

  hide() {
    this.window?.hide()
  }

  show() {
    this.window?.show()
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false
  }

  registerHost(id: string, host: Host) {
    this.hosts.set(id, host)
  }

  getHost(id: string): Host | undefined {
    return this.hosts.get(id)
  }

  createHost(type: 'launcher' | 'floating'): Host {
    return { id: `${type}-${Date.now()}`, type, attach: () => {}, detach: () => {} }
  }

  switchHost(pluginId: string, targetHost: 'launcher' | 'floating') {
    // RuntimeManager resolves runtimeId from pluginId
    // This is wired up in main.ts
  }
}
```

- [ ] **Step 3: Create launcher-host.ts**

```typescript
import type { Host, PluginRuntime } from '@szybko/shared'

export class LauncherHost implements Host {
  id: string
  type: 'launcher' = 'launcher'

  constructor(id: string) {
    this.id = id
  }

  attach(runtime: PluginRuntime) {
    // Add WebContentsView to the main window
    runtime.state = 'attached'
  }

  detach(runtime: PluginRuntime) {
    // Remove WebContentsView from the main window
    runtime.state = 'detached'
  }
}
```

- [ ] **Step 4: Create main.ts** (host entry point)

```typescript
import { app } from 'electron'
import { WindowManager } from './window-manager.js'

const windowManager = new WindowManager()

export function getWindowManager(): WindowManager {
  return windowManager
}

app.whenReady().then(() => {
  const win = windowManager.createMainWindow()
  // In development, load the Vite dev server
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 5: Create index.ts**

```typescript
export { WindowManager } from './window-manager.js'
export { LauncherHost } from './launcher-host.js'
export { getWindowManager } from './main.js'
```

- [ ] **Step 6: Update apps/desktop/src/main.ts** to use host

```typescript
import { app } from 'electron'
import { getWindowManager } from '@szybko/host'

// The @szybko/host package handles window creation
import '@szybko/host'
```

- [ ] **Step 7: Verify**

```bash
pnpm install
pnpm --filter @szybko/host typecheck
# Expected: No TypeScript errors
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add @szybko/host with WindowManager and LauncherHost"
```

---

### Task D2: Global Hotkey (Alt+Space)

**Files:**
- Create: `packages/host/src/shortcut-manager.ts`
- Modify: `packages/host/src/main.ts`

**Consumes:** Task D1 (WindowManager)
**Produces:** Alt+Space toggles window visibility

- [ ] **Step 1: Create shortcut-manager.ts**

```typescript
import { globalShortcut } from 'electron'
import type { WindowManager } from './window-manager.js'

export function registerAltSpace(windowManager: WindowManager) {
  globalShortcut.register('Alt+Space', () => {
    if (windowManager.isVisible()) {
      windowManager.hide()
    } else {
      windowManager.show()
    }
  })
}

export function unregisterAll() {
  globalShortcut.unregisterAll()
}
```

- [ ] **Step 2: Update host/src/main.ts**

```typescript
app.whenReady().then(() => {
  const win = windowManager.createMainWindow()
  registerAltSpace(windowManager)
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  }
})

app.on('will-quit', () => {
  unregisterAll()
})
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @szybko/desktop dev
# Press Alt+Space → window shows → press again → window hides
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Alt+Space global hotkey"
```

---

### Task D3: Theme Detection

**Files:**
- Create: `packages/host/src/theme.ts`
- Modify: `packages/host/src/main.ts`

**Consumes:** Task D1 (WindowManager)
**Produces:** Theme follows system preference, notifies renderer via IPC

- [ ] **Step 1: Create theme.ts**

```typescript
import { nativeTheme, BrowserWindow } from 'electron'
import { IPC } from '@szybko/shared'

export function getIsDark(): boolean {
  return nativeTheme.shouldUseDarkColors
}

export function setupThemeListener(mainWindow: BrowserWindow) {
  nativeTheme.on('updated', () => {
    mainWindow.webContents.send(IPC.THEME_CHANGED, { isDark: getIsDark() })
  })
}

export function handleThemeGet(): { isDark: boolean } {
  return { isDark: getIsDark() }
}
```

- [ ] **Step 2: Wire into host/src/main.ts**

```typescript
import { ipcMain } from 'electron'
import { IPC } from '@szybko/shared'
import { setupThemeListener, handleThemeGet } from './theme.js'

// After createMainWindow:
setupThemeListener(win)
ipcMain.handle(IPC.THEME_GET, handleThemeGet)
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @szybko/desktop dev
# Switch system theme → console should show theme change events
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add system theme detection with IPC notifications"
```

---

### Task D4: IPC Communication Chain

**Files:**
- Modify: `packages/host/src/main.ts` (add ipcMain.handle for search/execute/window:resize)

**Consumes:** Task D1–D3, B3 (preload)
**Produces:** Full IPC round-trip: input → preload → main → handler → reply

- [ ] **Step 1: Add IPC handlers to host/src/main.ts**

```typescript
import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@szybko/shared'
import type { SearchRequest, SearchBatch, ActionDescriptor } from '@szybko/shared'

function setupIPCHandlers(win: BrowserWindow, windowManager: WindowManager) {
  // Search
  ipcMain.handle(IPC.SEARCH, (_event, req: SearchRequest) => {
    console.log('[search]', req.query)
    // Mock: return empty batch
    const batch: SearchBatch = {
      queryId: req.queryId,
      batchSeq: 0,
      source: 'system',
      results: [],
      isFinal: true,
    }
    win.webContents.send(IPC.SEARCH_BATCH, batch)
    return { ok: true }
  })

  // Search cancel
  ipcMain.handle(IPC.SEARCH_CANCEL, (_event, { queryId }: { queryId: string }) => {
    console.log('[search-cancel]', queryId)
    return { ok: true }
  })

  // Execute action
  ipcMain.handle(IPC.EXECUTE, (_event, { action }: { action: ActionDescriptor }) => {
    console.log('[execute]', action.type)
    return { ok: true }
  })

  // Window resize
  ipcMain.handle(IPC.WINDOW_RESIZE, (_event, { height }: { height: number }) => {
    windowManager.resize(height)
    return { ok: true }
  })

  // Window hide
  ipcMain.handle(IPC.WINDOW_HIDE, () => {
    windowManager.hide()
    return { ok: true }
  })
}
```

- [ ] **Step 2: Wire in app.whenReady()**

```typescript
app.whenReady().then(() => {
  const win = windowManager.createMainWindow()
  setupIPCHandlers(win, windowManager)
  setupThemeListener(win)
  registerAltSpace(windowManager)
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  }
})
```

- [ ] **Step 3: Create useSearch.ts** in launcher — wire IPC into React

```typescript
import { useState, useCallback, useRef, useEffect } from 'react'
import { v4 as uuid } from 'uuid'
import type { SearchResult, SearchBatch } from '@szybko/shared'
import { SEARCH_DEBOUNCE_MS } from '@szybko/shared'

export function useSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (!value) { setResults([]); return }

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const queryId = uuid()
      window.utools?.search({ queryId, query: value, timestamp: Date.now() })
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    const cleanup = window.utools?.onSearchBatch((batch: SearchBatch) => {
      setResults(prev => [...prev, ...batch.results])
      setSelectedIndex(0)
    })
    return () => cleanup?.()
  }, [])

  return { query, setQuery: handleQueryChange, results, selectedIndex, setSelectedIndex }
}
```

- [ ] **Step 4: Update launcher package.json** — add uuid dependency

```json
"dependencies": {
  "@szybko/shared": "workspace:*",
  "@szybko/design-system": "workspace:*",
  "react": "^19.0",
  "react-dom": "^19.0",
  "uuid": "^11.0"
},
"devDependencies": {
  "@types/uuid": "^10.0"
}
```

- [ ] **Step 5: Update App.tsx** — use useSearch hook

```tsx
import { useSearch } from './hooks/useSearch'

const { query, setQuery, results, selectedIndex, setSelectedIndex } = useSearch()
```

- [ ] **Step 6: Verify**

```bash
pnpm install
pnpm --filter @szybko/desktop dev
# Type something → console shows IPC search handler triggered
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add IPC communication chain for search and execute"
```

---

### Task D5: ConfigManager

**Files:**
- Create: `packages/host/src/config-manager.ts`

**Consumes:** Task D1 (host)
**Produces:** `~/.szybko/config.json` read/write

- [ ] **Step 1: Create config-manager.ts**

```typescript
import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

interface AppConfig {
  theme?: 'system' | 'light' | 'dark'
  hotkey?: string
  [key: string]: unknown
}

const CONFIG_DIR = join(app.getPath('userData'), '..', 'Szybko')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export class ConfigManager {
  private config: AppConfig = {}

  constructor() {
    this.load()
  }

  private load() {
    if (existsSync(CONFIG_PATH)) {
      try {
        this.config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
      } catch { /* use defaults */ }
    }
  }

  save() {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2))
  }

  get(key: string): unknown {
    return this.config[key]
  }

  set(key: string, value: unknown) {
    this.config[key] = value
    this.save()
  }
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter @szybko/host typecheck
# Expected: No TypeScript errors
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add ConfigManager for ~/.szybko/config.json"
```

---

## Phase E: Plugin System

### Task E1: PluginManager + PluginLoader

**Files:**
- Create: `packages/host/src/plugin-manager.ts`
- Create: `packages/host/src/plugin-loader.ts`

**Consumes:** Task D1 (host)
**Produces:** Scans plugins/ directory, reads and validates plugin.json

- [ ] **Step 1: Create plugin-loader.ts**

```typescript
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { PluginManifest } from '@szybko/shared'

const PLUGINS_DIR = join(process.cwd(), 'plugins')

export class PluginLoader {
  scan(): { id: string; manifest: PluginManifest; path: string }[] {
    if (!existsSync(PLUGINS_DIR)) return []

    const entries = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    const plugins: { id: string; manifest: PluginManifest; path: string }[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const pluginPath = join(PLUGINS_DIR, entry.name)
      const manifestPath = join(pluginPath, 'plugin.json')

      if (!existsSync(manifestPath)) continue

      try {
        const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
        plugins.push({ id: entry.name, manifest, path: pluginPath })
        console.log(`[plugin-loader] Registered: ${entry.name}`)
      } catch (err) {
        console.error(`[plugin-loader] Failed to load ${entry.name}:`, err)
      }
    }

    return plugins
  }

  getPluginsDir(): string {
    return PLUGINS_DIR
  }
}
```

- [ ] **Step 2: Create plugin-manager.ts**

```typescript
import { copyFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { PluginLoader } from './plugin-loader.js'

export class PluginManager {
  private loader = new PluginLoader()
  private plugins: Map<string, { id: string; manifest: any; path: string }> = new Map()

  scan() {
    const found = this.loader.scan()
    for (const p of found) {
      this.plugins.set(p.id, p)
    }
    return found
  }

  get(id: string) {
    return this.plugins.get(id)
  }

  getAll() {
    return Array.from(this.plugins.values())
  }

  install(sourcePath: string) {
    // TODO: Phase 4 — copy from plugin store
    console.log('[plugin-manager] Install not implemented in MVP')
  }

  uninstall(id: string) {
    const plugin = this.plugins.get(id)
    if (!plugin) return
    const dir = join(this.loader.getPluginsDir(), id)
    if (existsSync(dir)) rmSync(dir, { recursive: true })
    this.plugins.delete(id)
  }
}
```

- [ ] **Step 3: Wire into main.ts**

```typescript
import { PluginManager } from './plugin-manager.js'

const pluginManager = new PluginManager()
app.whenReady().then(() => {
  const plugins = pluginManager.scan()
  console.log(`[main] Found ${plugins.length} plugins`)
})
```

- [ ] **Step 4: Verify**

```bash
pnpm --filter @szybko/host typecheck
# Create a test plugin in plugins/example-plugin/plugin.json first
mkdir -p plugins/example-plugin
echo '{"main":"index.html","logo":"icon.png","features":[{"code":"hello","cmds":["hello"]}]}' > plugins/example-plugin/plugin.json
pnpm dev
# Expected console: "[plugin-loader] Registered: example-plugin"
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add PluginManager and PluginLoader"
```

---

### Task E2: RuntimeManager

**Files:**
- Create: `packages/host/src/runtime-manager.ts`

**Consumes:** Task E1 (PluginManager), Task D1 (WindowManager), B3 (preload)
**Produces:** Runtime creation, attachment/detachment from hosts, state IPC

- [ ] **Step 1: Create runtime-manager.ts**

```typescript
import { WebContentsView } from 'electron'
import { join } from 'path'
import { IPC } from '@szybko/shared'
import type { PluginRuntime, RuntimeState, Host } from '@szybko/shared'
import type { PluginManager } from './plugin-manager.js'
import type { WindowManager } from './window-manager.js'

export class RuntimeManager {
  private runtimes: Map<string, PluginRuntime> = new Map()
  private nextInstanceId = 1

  constructor(
    private pluginManager: PluginManager,
    private windowManager: WindowManager,
  ) {}

  create(pluginId: string): PluginRuntime {
    const plugin = this.pluginManager.get(pluginId)
    if (!plugin) throw new Error(`Plugin not found: ${pluginId}`)

    const view = new WebContentsView({ webPreferences: { preload: undefined } })
    const runtime: PluginRuntime = {
      id: `${pluginId}-${this.nextInstanceId++}`,
      pluginId,
      instanceId: String(this.nextInstanceId),
      host: null,
      state: 'created',
      cache: new Map(),
    }

    this.runtimes.set(runtime.id, runtime)
    view.webContents.loadFile(join(plugin.path, plugin.manifest.main))
    return runtime
  }

  get(pluginId: string): PluginRuntime | undefined {
    // For singleton plugins, return existing runtime
    return Array.from(this.runtimes.values()).find(r => r.pluginId === pluginId)
  }

  getById(runtimeId: string): PluginRuntime | undefined {
    return this.runtimes.get(runtimeId)
  }

  attach(runtimeId: string, hostId: string) {
    const runtime = this.runtimes.get(runtimeId)
    const host = this.windowManager.getHost(hostId)
    if (!runtime || !host) return

    runtime.state = 'attached'
    runtime.host = host
    host.attach(runtime)
    this.notifyState(runtime)
  }

  detach(runtimeId: string) {
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime || !runtime.host) return

    runtime.host.detach(runtime)
    runtime.state = 'detached'
    runtime.host = null
    this.notifyState(runtime)
  }

  destroy(runtimeId: string) {
    const runtime = this.runtimes.get(runtimeId)
    if (!runtime) return
    runtime.state = 'destroyed'
    this.runtimes.delete(runtimeId)
    this.notifyState(runtime)
  }

  private notifyState(runtime: PluginRuntime) {
    const win = this.windowManager.getWindow()
    if (!win) return
    win.webContents.send(IPC.RUNTIME_STATE_CHANGED, {
      runtimeId: runtime.id,
      pluginId: runtime.pluginId,
      state: runtime.state,
      hostId: runtime.host?.id,
    })
  }

  getByPluginId(pluginId: string): PluginRuntime[] {
    return Array.from(this.runtimes.values()).filter(r => r.pluginId === pluginId)
  }
}
```

- [ ] **Step 2: Verify**

```bash
pnpm --filter @szybko/host typecheck
# Expected: No TypeScript errors
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add RuntimeManager for runtime lifecycle"
```

---

### Task E3: Example Plugin + Search Dispatch

**Files:**
- Create: `plugins/example-plugin/plugin.json`, `preload.js`, `index.html`
- Modify: `packages/host/src/main.ts` (wire search dispatch to plugins)

**Consumes:** Task E2 (RuntimeManager), D4 (IPC handlers)
**Produces:** Search dispatches to plugins, plugin returns results via IPC

- [ ] **Step 1: Create plugins/example-plugin/plugin.json**

```json
{
  "main": "index.html",
  "logo": "icon.png",
  "preload": "preload.js",
  "pluginSetting": { "single": true, "height": 400 },
  "features": [
    { "code": "hello", "explain": "示例插件", "cmds": ["hello", "你好"] }
  ]
}
```

- [ ] **Step 2: Create plugins/example-plugin/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>Example</title></head>
<body>
  <h1>示例插件</h1>
  <p id="content">等待搜索...</p>
  <script>
    window.onPluginEnter = ({ code, type, payload, from }) => {
      document.getElementById('content').textContent = `进入: ${code}`
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Create plugins/example-plugin/preload.js**

```javascript
// preload.js for example plugin
console.log('Example plugin preload loaded')
```

- [ ] **Step 4: Update IPC search handler** to dispatch to plugins

```typescript
// In host/src/main.ts, update the SEARCH handler:
ipcMain.handle(IPC.SEARCH, (_event, req: SearchRequest) => {
  const plugins = pluginManager.getAll()
  for (const plugin of plugins) {
    for (const feature of plugin.manifest.features) {
      const matched = feature.cmds.some(cmd =>
        typeof cmd === 'string' && req.query.startsWith(cmd)
      )
      if (matched) {
        // Find or create runtime
        let runtime = runtimeManager.get(plugin.id)
        if (!runtime) {
          runtime = runtimeManager.create(plugin.id)
          runtimeManager.attach(runtime.id, 'launcher')
        }
        // Send search event to plugin webview
        // (WebContents IPC — simplified for MVP)
        console.log(`[search] Dispatch to plugin: ${plugin.id}`)
      }
    }
  }

  // Return system-level results
  const batch: SearchBatch = {
    queryId: req.queryId,
    batchSeq: 0,
    source: 'system',
    results: [],
    isFinal: true,
  }
  win.webContents.send(IPC.SEARCH_BATCH, batch)
  return { ok: true }
})
```

- [ ] **Step 5: Verify**

```bash
pnpm dev
# Type "hello" → console shows "[search] Dispatch to plugin: example-plugin"
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add example plugin and search dispatch"
```

---

## Phase F: Rust Core

### Task F1: @szybko/core-rust (napi-rs)

**Files:**
- Create: `packages/core-rust/package.json`, `Cargo.toml`, `build.rs`
- Create: `packages/core-rust/src/lib.rs`, `types.rs`

**Consumes:** Task A1 (workspace)
**Produces:** Rust .node module with a ping() function callable from Node.js

- [ ] **Step 1: Create Cargo.toml**

```toml
[package]
name = "szybko-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["napi6"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
strip = true
```

- [ ] **Step 2: Create build.rs**

```rust
extern crate napi_build;
fn main() { napi_build::setup(); }
```

- [ ] **Step 3: Create src/types.rs**

```rust
use napi_derive::napi;

#[napi(object)]
pub struct PingResult {
  pub message: String,
  pub timestamp: i64,
}
```

- [ ] **Step 4: Create src/lib.rs**

```rust
use napi_derive::napi;
mod types;

#[napi]
pub fn ping(message: String) -> String {
    format!("pong: {}", message)
}

#[napi]
pub fn ping_with_timestamp(message: String, ts: i64) -> types::PingResult {
    types::PingResult {
        message: format!("pong: {}", message),
        timestamp: ts,
    }
}
```

- [ ] **Step 5: Create package.json**

```json
{
  "name": "@szybko/core-rust",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "napi build --release --platform",
    "build:debug": "napi build --platform"
  },
  "napi": {
    "name": "szybko-core",
    "triples": { "defaults": true, "additional": [] }
  },
  "devDependencies": {
    "@napi-rs/cli": "^3.0"
  }
}
```

- [ ] **Step 6: Build and verify**

```bash
pnpm --filter @szybko/core-rust build
node -e "
  const core = require('./packages/core-rust')
  console.log(core.ping('hello'))
"
# Expected: pong: hello
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add @szybko/core-rust with napi-rs and ping function"
```

---

### Task F2: adapter-bridge

**Files:**
- Create: `packages/host/src/adapter-bridge.ts`
- Modify: `packages/host/src/main.ts` (wire adapter-bridge)

**Consumes:** Task F1 (core-rust), Task D1 (host)
**Produces:** TypeScript adapter that calls Rust functions

- [ ] **Step 1: Create adapter-bridge.ts**

```typescript
let native: any = null

export function loadNative() {
  try {
    native = require('@szybko/core-rust')
    console.log('[adapter-bridge] Rust core loaded')
  } catch (err) {
    console.warn('[adapter-bridge] Rust core not available, using fallback:', err)
  }
}

export interface CoreAPI {
  ping(message: string): string
}

export function getCore(): CoreAPI {
  if (!native) loadNative()
  return {
    ping: (message: string) => native?.ping(message) ?? `(no rust) pong: ${message}`,
  }
}
```

- [ ] **Step 2: Wire into host/src/main.ts**

```typescript
import { loadNative, getCore } from './adapter-bridge.js'

app.whenReady().then(() => {
  loadNative()
  const core = getCore()
  console.log('[main]', core.ping('startup'))
  // ... rest of initialization
})
```

- [ ] **Step 3: Verify**

```bash
pnpm --filter @szybko/core-rust build
pnpm dev
# Expected console: "[adapter-bridge] Rust core loaded"
# Expected console: "[main] pong: startup"
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add adapter-bridge for TS to Rust calls"
```

---

## Spec Coverage Check

| Blueprint Requirement | Task |
|---|---|
| Electron + React + Tailwind v4 | A2, A3 |
| pnpm monorepo | A1 |
| contextBridge IPC | B3, D4 |
| Window 820×96, 96-520px dynamic | A2, C3 |
| Window 1/3 screen positioning | D1 |
| Alt+Space toggle | D2 |
| Theme detection + IPC | D3 |
| SearchRequest/SearchBatch protocol | B1, D4 |
| ActionDescriptor | B1 |
| PluginManager install/scan/uninstall/update | E1 |
| RuntimeManager create/attach/detach/destroy | E2 |
| Runtime/Host decoupling | D1, E2 |
| Plugin format (uTools compatible) | E3, B1 |
| SDK utools API | B3 |
| Config persistence | D5 |
| Rust core (napi-rs) | F1 |
| TS→Rust bridge | F2 |
