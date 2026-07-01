# 配置模板

> 本文提供所有配置文件的精确内容。AI 在创建项目文件时直接复制使用，避免自行猜测工具配置。

## 1. 根目录

### package.json

```json
{
  "name": "szybko",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @szybko/desktop dev",
    "build": "pnpm -r build",
    "build:rust": "pnpm --filter @szybko/core-rust build",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write .",
    "typecheck": "pnpm -r exec tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "prettier": "^3.4",
    "@typescript-eslint/eslint-plugin": "^8.0",
    "@typescript-eslint/parser": "^8.0",
    "eslint": "^9.0"
  },
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.15.0"
}
```

### pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'plugins/*'
```

### tsconfig.base.json

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
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@szybko/shared": ["./packages/shared/src"],
      "@szybko/design-system": ["./packages/design-system/src"],
      "@szybko/launcher": ["./packages/launcher/src"],
      "@szybko/host": ["./packages/host/src"],
      "@szybko/core-rust": ["./packages/core-rust"],
      "@szybko/plugin-sdk": ["./packages/plugin-sdk/src"]
    }
  },
  "exclude": ["node_modules", "dist"]
}
```

### .prettierrc

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

### .gitignore

```
node_modules/
dist/
target/
*.node
*.dmg
*.exe
*.AppImage
.DS_Store
```

---

## 2. apps/desktop

### package.json

```json
{
  "name": "@szybko/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:electron": "electron-builder",
    "dev:electron": "NODE_ENV=development electron ."
  },
  "dependencies": {
    "@szybko/host": "workspace:*",
    "@szybko/launcher": "workspace:*",
    "@szybko/shared": "workspace:*",
    "@szybko/design-system": "workspace:*",
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
  "main": "dist-electron/main.js",
  "build": {
    "extends": null,
    "files": [
      "dist-electron/**/*",
      "dist/**/*"
    ],
    "directories": {
      "output": "release"
    },
    "mac": {
      "target": "dmg",
      "icon": "resources/icon.icns"
    },
    "win": {
      "target": "nsis",
      "icon": "resources/icon.ico"
    }
  }
}
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@szybko/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@szybko/design-system': path.resolve(__dirname, '../../packages/design-system/src'),
      '@szybko/launcher': path.resolve(__dirname, '../../packages/launcher/src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
})
```

### apps/desktop/src/main.ts (Electron 入口)

```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 96,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

### apps/desktop/src/preload.ts

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('utools', {
  search: (req: any) => ipcRenderer.invoke('search', req),
  searchCancel: (queryId: string) => ipcRenderer.invoke('search-cancel', { queryId }),
  execute: (action: any) => ipcRenderer.invoke('execute', { action, source: 'system' }),
  resizeWindow: (height: number) => ipcRenderer.invoke('window:resize', { height }),
  hideWindow: () => ipcRenderer.invoke('window:hide', {}),
  detachPlugin: (pluginId: string) => ipcRenderer.invoke('plugin:detach', { pluginId }),
  backToSearch: () => ipcRenderer.invoke('plugin:back-to-search', {}),
  onSearchBatch: (cb: any) => {
    const fn = (_: any, batch: any) => cb(batch)
    ipcRenderer.on('search-batch', fn)
    return () => ipcRenderer.removeListener('search-batch', fn)
  },
  onPluginTabOpened: (cb: any) => {
    const fn = (_: any, data: any) => cb(data)
    ipcRenderer.on('plugin:tab-opened', fn)
    return () => ipcRenderer.removeListener('plugin:tab-opened', fn)
  },
  onPluginTabClosed: (cb: any) => {
    const fn = (_: any, data: any) => cb(data)
    ipcRenderer.on('plugin:tab-closed', fn)
    return () => ipcRenderer.removeListener('plugin:tab-closed', fn)
  },
})
```

---

## 3. packages/shared

### package.json

```json
{
  "name": "@szybko/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

### tsconfig.json

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

---

## 4. packages/design-system

### package.json

```json
{
  "name": "@szybko/design-system",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "lucide-react": "^0.468",
    "@radix-ui/react-dialog": "^1.1",
    "@radix-ui/react-tabs": "^1.1",
    "@radix-ui/react-switch": "^1.1"
  },
  "peerDependencies": {
    "react": "^19.0",
    "react-dom": "^19.0",
    "tailwindcss": "^4.0"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/react": "^19.0"
  }
}
```

---

## 5. packages/launcher

### package.json

```json
{
  "name": "@szybko/launcher",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/main.tsx",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@szybko/shared": "workspace:*",
    "@szybko/design-system": "workspace:*",
    "react": "^19.0",
    "react-dom": "^19.0",
    "zustand": "^5.0",
    "dayjs": "^1.11",
    "uuid": "^11.0"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "@types/react": "^19.0",
    "@types/react-dom": "^19.0",
    "@types/uuid": "^10.0",
    "tailwindcss": "^4.0"
  }
}
```

---

## 6. packages/host

### package.json

```json
{
  "name": "@szybko/host",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@szybko/shared": "workspace:*",
    "@szybko/core-rust": "workspace:*",
    "electron": "^33.0"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

---

## 7. packages/core-rust

### Cargo.toml

```toml
[package]
name = "szybko-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["napi6", "async"] }
napi-derive = "2"

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
strip = true
```

### build.rs

```rust
extern crate napi_build;
fn main() {
  napi_build::setup();
}
```

### package.json (napi-rs Node 侧)

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
    "triples": {
      "defaults": true,
      "additional": []
    }
  },
  "devDependencies": {
    "@napi-rs/cli": "^3.0"
  }
}
```

---

## 8. plugins/example-plugin

### plugin.json

```json
{
  "main": "index.html",
  "logo": "icon.png",
  "preload": "preload.js",
  "pluginSetting": {
    "single": true,
    "height": 400
  },
  "features": [
    {
      "code": "hello",
      "explain": "示例插件，返回问候语",
      "cmds": ["hello", "你好"]
    }
  ],
  "permissions": [
    "shell:openPath"
  ]
}
```

### index.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Example Plugin</title>
</head>
<body>
  <h1>Example Plugin</h1>
  <p id="content">Waiting...</p>
  <script src="preload.js"></script>
</body>
</html>
```

### preload.js

```javascript
// preload.js — 可访问 Node.js API
// utools 全局由宿主注入
console.log('Example plugin preload loaded')
```
