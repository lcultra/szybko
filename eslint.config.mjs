import antfu from '@antfu/eslint-config';

export default antfu(
    {
        formatters: true,
        react: true,
        markdown: true,
        typescript: true,
        stylistic: {
            indent: 4,
            semi: true,
        },
        yaml: {
            overrides: {
                'yaml/indent': ['error', 2],
            },
        },
        ignores: [
            '**/dist/**',
            '**/lib/**',
            '**/out/**',
            '**/node_modules/**',
            '.claude',
            '.superpowers',
            '**/docs/**',
            'packages/plugin-tools/src/templates',
        ],
        rules: {
            // no-unsafe-as
            'ts/no-unsafe-assignment': 'off',
            // 不强制 .js 扩展名
            'import-x/extensions': 'off',
            'ts/consistent-type-imports': 'off',
        },
    },
    // ── Architecture Boundary Rules ──
    // domain/ 必须不引入基础设施模块
    {
        files: ['packages/host/src/domain/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['electron', 'drizzle-orm', 'node:fs', 'node:path', 'ipcMain'], message: 'domain/ 禁止引入 Electron、Drizzle、Node 内置模块' },
                    { group: ['../infrastructure/**'], message: 'domain/ 禁止引入 infrastructure/' },
                ],
            }],
        },
    },
    // ipc/ 必须不直接引入 schema 或 repositories
    {
        files: ['packages/host/src/ipc/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['../infrastructure/sqlite/schema'], message: 'ipc/ 禁止直接引入 schema' },
                    { group: ['../infrastructure/sqlite/repositories/**'], message: 'ipc/ 禁止直接引入 repositories' },
                ],
            }],
        },
    },
    // app/ 必须不引入 Electron、Drizzle、schema
    {
        files: ['packages/host/src/app/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['electron', 'drizzle-orm'], message: 'app/ 禁止直接引入 Electron 或 Drizzle' },
                    { group: ['../infrastructure/sqlite/schema'], message: 'app/ 禁止引入 schema' },
                ],
            }],
        },
    },
    // 只有 infrastructure/sqlite/ 允许引入 schema（按目录逐个排除）
    {
        files: [
            'packages/host/src/domain/**/*.ts',
            'packages/host/src/ipc/**/*.ts',
            'packages/host/src/app/**/*.ts',
            'packages/host/src/bootstrap/**/*.ts',
            'packages/host/src/presentation/**/*.ts',
            'packages/host/src/infrastructure/commands/**/*.ts',
            'packages/host/src/infrastructure/electron/**/*.ts',
            'packages/host/src/infrastructure/filesystem/**/*.ts',
            'packages/host/src/infrastructure/input/**/*.ts',
            'packages/host/src/infrastructure/native/**/*.ts',
            'packages/host/src/infrastructure/protocol/**/*.ts',
            'packages/host/src/infrastructure/search/**/*.ts',
        ],
        rules: {
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['../schema', './schema', '../../schema', '../../../schema'], message: '只有 infrastructure/sqlite/ 可以引入 schema.ts' },
                ],
            }],
        },
    },
    // desktop main 禁止直接创建领域管理器
    {
        files: ['apps/desktop/src/main/**/*.ts'],
        rules: {
            'no-restricted-imports': ['error', {
                paths: [
                    { name: '@szybko/host', importNames: ['CommandCatalog', 'PluginCatalog', 'RuntimeManager', 'RuntimeCoordinator', 'RuntimeHostRegistry'], message: '请使用 createHostPlatform() 替代直接创建管理器' },
                ],
            }],
        },
    },
);
