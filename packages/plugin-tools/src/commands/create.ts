import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { info, error as logError, success } from '../utils/log.ts';

export interface CreateOptions {
    name: string;
    renderer: boolean;
    cwd: string;
}

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const TEMPLATES_DIR = resolve(__dirname, '../templates');

function readTemplate(type: 'simple' | 'react', file: string): string {
    return readFileSync(resolve(TEMPLATES_DIR, type, file), 'utf-8');
}

function render(template: string, vars: Record<string, string>): string {
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

function randomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const sat = 55 + Math.floor(Math.random() * 20); // 55-75
    const lig = 55 + Math.floor(Math.random() * 15); // 55-70
    return `hsl(${hue}, ${sat}%, ${lig}%)`;
}

export async function createPlugin(options: CreateOptions): Promise<void> {
    const { name, renderer, cwd } = options;
    const pluginDir = resolve(cwd, name);
    const type = renderer ? 'react' : 'simple';

    try {
        mkdirSync(pluginDir, { recursive: true });
    }
    catch (err) {
        logError(`创建目录失败: ${err}`);
        process.exit(1);
    }

    const files: Record<string, string> = {
        'tsconfig.json': readTemplate(type, 'tsconfig.json'),
        'plugin.config.js': readTemplate(type, 'plugin.config.js'),
        'package.json': render(readTemplate(type, 'package.json'), { name }),
        'plugin.json': render(readTemplate(type, 'plugin.json'), { name }),
        'preload/index.ts': render(readTemplate(type, 'preload/index.ts'), { name }),
    };

    if (renderer) {
        files['index.html'] = readTemplate(type, 'index.html');
        files['src/main.tsx'] = readTemplate(type, 'src/main.tsx');
        files['src/App.tsx'] = readTemplate(type, 'src/App.tsx');
        files['src/style.css'] = readTemplate(type, 'src/style.css');
        files['src/vite-env.d.ts'] = readTemplate(type, 'src/vite-env.d.ts');
    }
    else {
        files['index.html'] = readTemplate(type, 'index.html');
    }

    // logo 随机颜色
    files['public/icon.svg'] = render(readTemplate(type, 'public/icon.svg'), { color: randomColor() });

    for (const [filePath, content] of Object.entries(files)) {
        const fullPath = resolve(pluginDir, filePath);
        mkdirSync(resolve(fullPath, '..'), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
    }

    success(`插件 "${name}" 已创建: ${pluginDir}`);
    info(`运行 cd ${name} && pnpm install 安装依赖后即可使用`);
}
