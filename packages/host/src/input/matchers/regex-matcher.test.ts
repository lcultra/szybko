import { describe, expect, it } from 'vitest';
import { RegexMatcher } from './regex-matcher';
import type { InputContextSnapshot } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';

function mockRow(overrides: Partial<CommandSearchRow> = {}): CommandSearchRow {
    return {
        pluginId: 'linker',
        featureCode: 'open-url',
        cmdKey: 'r1',
        triggerIndex: 0,
        source: 'feature_cmd',
        type: 'regex',
        label: '打开链接',
        normalizedKey: null,
        targetCmdKey: null,
        scoreBase: 90,
        featureJson: JSON.stringify({ matcher: { type: 'regex', match: { pattern: '^(https?):\\/\\/.+$', flags: 'i' } } }),
        ...overrides,
    };
}

describe('RegexMatcher', () => {
    it('matches text against regex pattern', () => {
        const matcher = new RegexMatcher();
        const snapshot: InputContextSnapshot = { query: 'https://example.com', texts: [{ text: 'https://example.com', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(1);
        expect(results[0]?.pluginId).toBe('linker');
    });

    it('does not match non-matching text', () => {
        const matcher = new RegexMatcher();
        const snapshot: InputContextSnapshot = { query: '普通文本', texts: [{ text: '普通文本', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(0);
    });

    it('respects minLength and maxLength', () => {
        const matcher = new RegexMatcher();
        const row = mockRow({ featureJson: JSON.stringify({ matcher: { type: 'regex', match: { pattern: '^\\d+$', flags: '' }, minLength: 5, maxLength: 10 } }) });
        const short = matcher.match({ query: '12', texts: [{ text: '12', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        const match = matcher.match({ query: '12345', texts: [{ text: '12345', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        const long = matcher.match({ query: '12345678901', texts: [{ text: '12345678901', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        expect(short).toHaveLength(0);
        expect(match).toHaveLength(1);
        expect(long).toHaveLength(0);
    });
});
