import antfu from '@antfu/eslint-config';
import tailwindcss from 'eslint-plugin-tailwindcss';

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
        ],
        rules: {
            // no-unsafe-as
            'ts/no-unsafe-assignment': 'off',
            // 不强制 .js 扩展名
            'import-x/extensions': 'off',
            'ts/consistent-type-imports': 'off',
        },
    },
    {
        extends: [tailwindcss.configs.recommended],
        settings: {
            tailwindcss: {
                cssConfigPath: '/Users/pengcheng17/Documents/workspace/ai/szybko/packages/ui-kit/src/index.css',
            },
        },
    },
);
