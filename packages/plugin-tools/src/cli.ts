import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cac } from 'cac';
import { buildPlugin } from './commands/build';
import { createPlugin } from './commands/create';
import { devPlugin } from './commands/dev';
import { findProjectRoot } from './utils/find-root';
import { error } from './utils/log';

function getVersion(): string {
    const pkgPath = resolve(fileURLToPath(import.meta.url), '../../package.json');
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.version || '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}

/**
 * 创建 CLI 并注册命令
 */
function main(): void {
    const cli = cac('szybko-plugin');

    cli.version(getVersion());
    cli.help();

    // szybko-plugin build
    cli.command('build', '构建插件').action(async () => {
        const cwd = process.cwd();
        await buildPlugin({ cwd });
    });

    // szybko-plugin dev
    cli.command('dev', '启动开发模式').action(async () => {
        const cwd = process.cwd();
        await devPlugin({ cwd });
    });

    // szybko-plugin create <name>
    cli.command('create <name>', '创建新插件')
        .option('--renderer', '创建带 React UI 的插件')
        .action(async (name: string, options: { renderer?: boolean }) => {
            const root = findProjectRoot(process.cwd());
            if (!root) {
                error('未找到项目根目录（pnpm-workspace.yaml）');
                error('请在 szybko 项目目录下运行此命令');
                process.exit(1);
            }
            await createPlugin({
                name,
                renderer: options.renderer ?? false,
                root,
            });
        });

    // 解析参数并运行
    cli.parse();
}

main();
