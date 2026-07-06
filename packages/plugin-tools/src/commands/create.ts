import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { info, error as logError, success } from '../utils/log';

export interface CreateOptions {
    name: string;
    renderer: boolean;
    root: string;
}

interface TemplateFiles {
    [filePath: string]: string;
}

const PLUGIN_CONFIG_TEMPLATE_SIMPLE = `import { defineConfig } from '@szybko/plugin-tools';

export default defineConfig({
    preload: 'src/preload/index.ts',
});
`;

const PLUGIN_CONFIG_TEMPLATE_RENDERER = `import { defineConfig } from '@szybko/plugin-tools';

export default defineConfig({
    preload: 'src/preload/index.ts',
    renderer: 'src/renderer',
});
`;

function PACKAGE_JSON_TEMPLATE(name: string, hasRenderer: boolean) {
    const deps: Record<string, string> = {};
    if (hasRenderer) {
        deps['@szybko/sdk'] = 'workspace:*';
        deps.react = '^19.2.7';
        deps['react-dom'] = '^19.2.7';
    }
    const allDeps = {
        ...deps,
        '@szybko/plugin-tools': 'workspace:*',
    };
    return `${JSON.stringify({
        name: `@szybko/plugin-${name}`,
        version: '0.1.0',
        private: true,
        scripts: {
            build: 'szybko-plugin build',
            dev: 'szybko-plugin dev',
        },
        dependencies: allDeps,
    }, null, 4)}\n`;
}

function PLUGIN_JSON_TEMPLATE(id: string) {
    return `${JSON.stringify({
        id,
        main: 'index.html',
        preload: 'preload.js',
        pluginSetting: { single: true },
        features: [],
    }, null, 4)}\n`;
}

const PRELOAD_TEMPLATE = `// @szybko/plugin-{{name}} — preload
// 插件 preload 脚本，运行在沙盒环境中
`;

const INDEX_HTML_TEMPLATE_SIMPLE = `<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>插件</title>
    </head>
    <body>
        <p>插件加载中...</p>
    </body>
</html>
`;

const INDEX_HTML_TEMPLATE_REACT = `<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>插件</title>
    </head>
    <body class="">
        <div id="root"></div>
        <script type="module" src="./main.tsx"></script>
    </body>
</html>
`;

const MAIN_TSX_TEMPLATE = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

import './style.css';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}
`;

const APP_TSX_TEMPLATE = `export function App() {
    return (
        <div>
            <h1>插件</h1>
        </div>
    );
}
`;

const STYLE_CSS_TEMPLATE = `/* 插件样式 */
`;

/**
 * 创建新插件
 */
export async function createPlugin(options: CreateOptions): Promise<void> {
    const { name, renderer, root } = options;
    const pluginDir = resolve(root, 'plugins', 'built-in', name);

    // 检查目录是否已存在
    try {
        mkdirSync(pluginDir, { recursive: true });
    }
    catch (err) {
        logError(`创建目录失败: ${err}`);
        process.exit(1);
    }

    const files: TemplateFiles = {
        'plugin.config.js': renderer ? PLUGIN_CONFIG_TEMPLATE_RENDERER : PLUGIN_CONFIG_TEMPLATE_SIMPLE,
        'package.json': PACKAGE_JSON_TEMPLATE(name, renderer),
        'plugin.json': PLUGIN_JSON_TEMPLATE(name),
        'src/preload/index.ts': PRELOAD_TEMPLATE.replaceAll('{{name}}', name),
    };

    if (renderer) {
        files['src/renderer/index.html'] = INDEX_HTML_TEMPLATE_REACT;
        files['src/renderer/main.tsx'] = MAIN_TSX_TEMPLATE;
        files['src/renderer/App.tsx'] = APP_TSX_TEMPLATE;
        files['src/renderer/style.css'] = STYLE_CSS_TEMPLATE;
    }
    else {
        files['index.html'] = INDEX_HTML_TEMPLATE_SIMPLE;
    }

    // 写入所有文件
    for (const [filePath, content] of Object.entries(files)) {
        const fullPath = resolve(pluginDir, filePath);
        mkdirSync(resolve(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
    }

    success(`插件 "${name}" 已创建: ${pluginDir}`);
    info('运行 pnpm install 安装依赖后即可使用');
}
