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
);
