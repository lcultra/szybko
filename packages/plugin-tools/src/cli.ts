import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cac } from 'cac';
import { buildPlugin } from './commands/build.ts';
import { createPlugin } from './commands/create.ts';
import { devPlugin } from './commands/dev.ts';
import { findProjectRoot } from './utils/find-root.ts';
import { error } from './utils/log.ts';

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

const cli = cac('szybko-plugin');

cli.version(getVersion());
cli.help();

cli.command('build', '构建插件').action(async () => {
    await buildPlugin({ cwd: process.cwd() });
});

cli.command('dev', '启动开发模式').action(async () => {
    await devPlugin({ cwd: process.cwd() });
});

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

export function run(): void {
    cli.parse();
}
