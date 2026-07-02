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
            '**/out/**',
            '**/node_modules**/',
            '.claude',
            '**/docs/**',
        ],
    },
    {
        extends: [tailwindcss.configs.recommended],
        settings: {
            tailwindcss: {
                cssConfigPath: '/Users/pengcheng17/Documents/workspace/ai/szybko/packages/design-system/src/index.css',
            },
        },
    },
);
