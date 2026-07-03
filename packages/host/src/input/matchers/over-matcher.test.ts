import { describe, expect, it } from 'vitest';
import { OverMatcher } from './over-matcher';
import type { InputContextSnapshot } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';

function mockRow(overrides: Partial<CommandSearchRow> = {}): CommandSearchRow {
    return {
        pluginId: 'catcher',
        featureCode: 'catch-all',
        cmdKey: 'o1',
        triggerIndex: 0,
        source: 'feature_cmd',
        type: 'over',
        label: '捕获',
        normalizedKey: null,
        targetCmdKey: null,
        scoreBase: 50,
        featureJson: JSON.stringify({ matcher: { type: 'over' } }),
        ...overrides,
    };
}

describe('OverMatcher', () => {
    it('matches any text when no constraints', () => {
        const matcher = new OverMatcher();
        const snapshot: InputContextSnapshot = { query: '任意文本', texts: [{ text: '任意文本', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(1);
    });

    it('respects exclude pattern', () => {
        const matcher = new OverMatcher();
        const row = mockRow({ featureJson: JSON.stringify({ matcher: { type: 'over', exclude: { pattern: '^\\d+$', flags: '' } } }) });
        const excluded = matcher.match({ query: '123', texts: [{ text: '123', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        const included = matcher.match({ query: 'abc', texts: [{ text: 'abc', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } }, [row]);
        expect(excluded).toHaveLength(0);
        expect(included).toHaveLength(1);
    });
});
