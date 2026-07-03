import { describe, expect, it } from 'vitest';
import { normalizeCommand, normalizeFeature, normalizeTextKey } from './feature-normalizer';

describe('feature normalizer', () => {
    it('normalizes text commands and generates stable cmd_key independent of label/order', () => {
        const first = normalizeCommand(' 功能指令 ');
        const second = normalizeCommand('功能指令');

        expect(first?.type).toBe('text');
        expect(first?.normalizedKey).toBe('功能指令');
        expect(first?.cmdKey).toBe(second?.cmdKey);
    });

    it('parses uTools regex literal strings with flags', () => {
        const command = normalizeCommand({
            type: 'regex',
            label: '打开链接',
            match: '/^(https?):\\/\\/.+$/i',
            minLength: 7,
            maxLength: 2000,
        });

        expect(command?.type).toBe('regex');
        expect(command?.matcher).toEqual({
            type: 'regex',
            match: { pattern: '^(https?):\\/\\/.+$', flags: 'i' },
            minLength: 7,
            maxLength: 2000,
        });
        expect(command?.label).toBe('打开链接');
    });

    it('does not include label in cmd_key', () => {
        const first = normalizeCommand({
            type: 'regex',
            label: '手机号查询',
            match: '/^1[3456789]\\d{9}$/',
            minLength: 11,
            maxLength: 11,
        });
        const second = normalizeCommand({
            type: 'regex',
            label: '手机号码',
            match: '/^1[3456789]\\d{9}$/',
            minLength: 11,
            maxLength: 11,
        });

        expect(first?.cmdKey).toBe(second?.cmdKey);
    });

    it('deduplicates duplicate commands in a feature', () => {
        const feature = normalizeFeature({
            code: 'test-regex',
            explain: 'regex',
            cmds: [
                { type: 'regex', label: '手机号查询', match: '/^1[3456789]\\d{9}$/', minLength: 11, maxLength: 11 },
                { type: 'regex', label: '手机号查询', match: '/^1[3456789]\\d{9}$/', minLength: 11, maxLength: 11 },
            ],
        });

        expect(feature.commands).toHaveLength(1);
    });

    it('normalizes text with NFKC and lowercase folding', () => {
        expect(normalizeTextKey(' ＡBc ')).toBe('abc');
    });
});
