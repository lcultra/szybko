import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { cac } from 'cac';
import { buildPlugin } from './commands/build.ts';
import { createPlugin } from './commands/create.ts';
import { devPlugin } from './commands/dev.ts';

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
        await createPlugin({
            name,
            renderer: options.renderer ?? false,
            cwd: process.cwd(),
        });
    });

export function run(): void {
    cli.parse();
}
