#!/usr/bin/env node
/* eslint-disable style/max-statements-per-line */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { cac } from 'cac';
import { createServer as createViteServer, mergeConfig, build as viteBuild } from 'vite';

// ── Logging ──────────────────────────────────────────────

const pc = { cyan: s => `\x1B[36m${s}\x1B[39m`, green: s => `\x1B[32m${s}\x1B[39m`, yellow: s => `\x1B[33m${s}\x1B[39m`, red: s => `\x1B[31m${s}\x1B[39m`, dim: s => `\x1B[2m${s}\x1B[22m`, blue: s => `\x1B[34m${s}\x1B[39m` };

function info(msg) { console.log(pc.cyan(`▸ ${msg}`)); }
function success(msg) { console.log(pc.green(`✔ ${msg}`)); }
function logError(msg) { console.error(pc.red(`✖ ${msg}`)); }
function dimmed(msg) { console.log(pc.dim(msg)); }

// ── Port detection ──────────────────────────────────────

function tryPort(port) {
    return new Promise((resolve) => {
        const server = createServer();
        server.unref();
        server.on('error', () => resolve(null));
        server.listen(port, () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                server.close(() => resolve(addr.port));
            }
            else {
                server.close(() => resolve(null));
            }
        });
    });
}

async function findFreePort(preferred = 5173) {
    let port = await tryPort(preferred);
    if (port)
        return port;
    for (let i = preferred + 1; i < preferred + 100; i++) {
        port = await tryPort(i);
        if (port)
            return port;
    }
    return tryPort(0);
}

// ── Find project root ───────────────────────────────────

function findProjectRoot(cwd) {
    let dir = cwd;
    for (let i = 0; i < 10; i++) {
        if (existsSync(resolve(dir, 'pnpm-workspace.yaml')))
            return dir;
        const parent = resolve(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
}

// ── Load plugin.config.js ───────────────────────────────

async function loadConfig(cwd) {
    const configPath = resolve(cwd, 'plugin.config.js');
    if (!existsSync(configPath)) {
        logError('未找到 plugin.config.js');
        logError('请在插件根目录创建 plugin.config.js');
        process.exit(1);
    }
    try {
        const mod = await import(configPath);
        const config = mod.default || mod;
        if (!config.preload) {
            logError('plugin.config.js 缺少必填字段: preload');
            process.exit(1);
        }
        return config;
    }
    catch (err) {
        logError(`加载 plugin.config.js 失败: ${err}`);
        process.exit(1);
    }
}

// ── Vite config presets ─────────────────────────────────

function createPreloadViteConfig(cwd, config) {
    const base = {
        configFile: false,
        build: {
            outDir: resolve(cwd, 'dist'),
            lib: { entry: resolve(cwd, config.preload), formats: ['cjs'], fileName: () => 'preload.js' },
            minify: false,
            emptyOutDir: false,
            copyPublicDir: false,
        },
    };
    return config.vite?.preload ? mergeConfig(base, config.vite.preload) : base;
}

function createRendererViteConfig(cwd, config) {
    if (!config.renderer) {
        logError('插件未配置 renderer');
        process.exit(1);
    }
    const rendererRoot = resolve(cwd, config.renderer);
    const htmlEntry = resolve(rendererRoot, 'index.html');
    if (!existsSync(htmlEntry)) {
        logError(`renderer 入口文件不存在: ${htmlEntry}`);
        process.exit(1);
    }
    const base = {
        configFile: false,
        root: rendererRoot,
        plugins: [react(), tailwindcss()],
        build: {
            outDir: resolve(cwd, 'dist'),
            emptyOutDir: false,
            minify: false,
        },
    };
    return config.vite?.renderer ? mergeConfig(base, config.vite.renderer) : base;
}

// ── Plugin manifest helpers ─────────────────────────────

function readManifest(cwd) {
    return JSON.parse(readFileSync(resolve(cwd, 'plugin.json'), 'utf-8'));
}

function writeManifest(cwd, devUrl) {
    const manifest = readManifest(cwd);
    if (devUrl) {
        manifest.development = { main: devUrl };
    }
    else {
        delete manifest.development;
    }
    writeFileSync(resolve(cwd, 'dist', 'plugin.json'), `${JSON.stringify(manifest, null, 4)}\n`);
}

// ── Build command ────────────────────────────────────────

async function buildPlugin(cwd, devPort) {
    const config = await loadConfig(cwd);
    info('开始构建插件...');

    info('构建 preload...');
    try {
        await viteBuild(createPreloadViteConfig(cwd, config));
        success('preload 构建完成');
    }
    catch (err) {
        logError(`preload 构建失败: ${err}`);
        process.exit(1);
    }

    if (config.renderer) {
        info('构建 renderer...');
        try {
            await viteBuild(createRendererViteConfig(cwd, config));
            success('renderer 构建完成');
        }
        catch (err) {
            logError(`renderer 构建失败: ${err}`);
            process.exit(1);
        }
    }
    else {
        const htmlPath = resolve(cwd, 'index.html');
        if (existsSync(htmlPath)) {
            copyFileSync(htmlPath, resolve(cwd, 'dist', 'index.html'));
            info('已拷贝 index.html → dist/');
        }
    }

    const publicDir = resolve(cwd, 'public');
    if (existsSync(publicDir)) {
        cpSync(publicDir, resolve(cwd, 'dist'), { recursive: true });
        info('已拷贝 public/ → dist/');
    }

    const devUrl = devPort ? `http://localhost:${devPort}/` : undefined;
    writeManifest(cwd, devUrl);
    success('插件构建完成');
}

// ── Dev command ──────────────────────────────────────────

async function devPlugin(cwd) {
    const config = await loadConfig(cwd);

    if (config.renderer) {
        const port = await findFreePort(5173);
        info(`启动 renderer dev server (端口: ${port})...`);
        writeManifest(cwd, `http://localhost:${port}/`);

        const rendererConfig = createRendererViteConfig(cwd, config);
        const server = await createViteServer({
            ...rendererConfig,
            server: { port, strictPort: false },
        });
        await server.listen();
        success(`renderer dev server 已启动: http://localhost:${port}/`);
        dimmed('按 Ctrl+C 停止');

        info('启动 preload watch 构建...');
        await viteBuild({
            ...createPreloadViteConfig(cwd, config),
            build: { ...createPreloadViteConfig(cwd, config).build, watch: {} },
        });
    }
    else {
        info('启动 preload watch 构建...');
        writeManifest(cwd);
        await viteBuild({
            ...createPreloadViteConfig(cwd, config),
            build: { ...createPreloadViteConfig(cwd, config).build, watch: {} },
        });
    }
}

// ── Create command ───────────────────────────────────────

function createPlugin(name, renderer, root) {
    const pluginDir = resolve(root, 'plugins', 'built-in', name);
    mkdirSync(pluginDir, { recursive: true });

    const simplePluginConfig = `import { defineConfig } from '@szybko/plugin-tools';\n\nexport default defineConfig({\n    preload: 'src/preload/index.ts',\n});\n`;

    const reactPluginConfig = `import { defineConfig } from '@szybko/plugin-tools';\n\nexport default defineConfig({\n    preload: 'src/preload/index.ts',\n    renderer: 'src/renderer',\n});\n`;

    function packageJson(name, hasRenderer) {
        const deps = { '@szybko/plugin-tools': 'workspace:*' };
        if (hasRenderer) {
            deps['@szybko/sdk'] = 'workspace:*';
            deps.react = '^19.2.7';
            deps['react-dom'] = '^19.2.7';
        }
        return `${JSON.stringify({ name: `@szybko/plugin-${name}`, type: 'module', version: '0.1.0', private: true, scripts: { build: 'szybko-plugin build', dev: 'szybko-plugin dev' }, dependencies: deps }, null, 4)}\n`;
    }

    function pluginJson(id) {
        return `${JSON.stringify({ id, main: 'index.html', preload: 'preload.js', pluginSetting: { single: true }, features: [] }, null, 4)}\n`;
    }

    const files = {
        'plugin.config.js': renderer ? reactPluginConfig : simplePluginConfig,
        'package.json': packageJson(name, renderer),
        'plugin.json': pluginJson(name),
        'src/preload/index.ts': `// @szybko/plugin-${name} — preload\n`,
    };

    if (renderer) {
        files['src/renderer/index.html'] = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>插件</title>\n</head>\n<body class="">\n<div id="root"></div>\n<script type="module" src="./main.tsx"></script>\n</body>\n</html>\n';
        files['src/renderer/main.tsx'] = `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { App } from './App';\nimport './style.css';\n\nconst root = document.getElementById('root');\nif (root) {\n    createRoot(root).render(<StrictMode><App /></StrictMode>);\n}\n`;
        files['src/renderer/App.tsx'] = `export function App() {\n    return <div><h1>插件</h1></div>;\n}\n`;
        files['src/renderer/style.css'] = '/* 插件样式 */\n';
    }
    else {
        files['index.html'] = '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>插件</title>\n</head>\n<body>\n<p>插件加载中...</p>\n</body>\n</html>\n';
    }

    for (const [filePath, content] of Object.entries(files)) {
        const fullPath = resolve(pluginDir, filePath);
        mkdirSync(resolve(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
    }

    success(`插件 "${name}" 已创建: ${pluginDir}`);
    info('运行 pnpm install 安装依赖后即可使用');
}

// ── CLI main ─────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let version = '0.0.0';
try {
    version = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8')).version;
}
catch { /* ignore */ }

const cli = cac('szybko-plugin');
cli.version(version);
cli.help();

cli.command('build', '构建插件').action(async () => {
    await buildPlugin(process.cwd());
});

cli.command('dev', '启动开发模式').action(async () => {
    await devPlugin(process.cwd());
});

cli.command('create <name>', '创建新插件')
    .option('--renderer', '创建带 React UI 的插件')
    .action(async (name, options) => {
        const root = findProjectRoot(process.cwd());
        if (!root) {
            logError('未找到项目根目录（pnpm-workspace.yaml）');
            logError('请在 szybko 项目目录下运行此命令');
            process.exit(1);
        }
        createPlugin(name, options.renderer || false, root);
    });

cli.parse();
