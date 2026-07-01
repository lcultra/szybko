import antfu from '@antfu/eslint-config';

export default antfu({
    formatters: true,
    react: true,
    markdown: true,
    stylistic: {
        indent: 4,
        semi: true,
    },
    yaml: {
        overrides: {
            stylistic: {
                indent: 2,
            },
        },
    },
    ignores: [
        'node_modules',
        '.comate',
        '.claude',
        '.agents',
    ],
});
