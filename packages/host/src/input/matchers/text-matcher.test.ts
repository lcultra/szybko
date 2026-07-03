import { describe, expect, it } from 'vitest';
import { TextMatcher } from './text-matcher';
import type { InputContextSnapshot } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';

function mockRow(overrides: Partial<CommandSearchRow> = {}): CommandSearchRow {
    return {
        pluginId: 'demo',
        featureCode: 'prefs',
        cmdKey: 'key',
        triggerIndex: 0,
        source: 'feature_cmd',
        type: 'text',
        label: '设置',
        normalizedKey: '设置',
        targetCmdKey: null,
        scoreBase: 90,
        featureJson: '{}',
        ...overrides,
    };
}

describe('TextMatcher', () => {
    it('matches exact normalized text', () => {
        const matcher = new TextMatcher();
        const snapshot: InputContextSnapshot = { query: '设置', texts: [{ text: '设置', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(1);
        expect(results[0]?.pluginId).toBe('demo');
    });

    it('does not match different text', () => {
        const matcher = new TextMatcher();
        const snapshot: InputContextSnapshot = { query: '其他', texts: [{ text: '其他', source: 'query' }], channels: { query: true, text: true, files: false, image: false, window: false }, from: 'main', meta: { platform: 'darwin', timestamp: 0, errors: [] } };
        const results = matcher.match(snapshot, [mockRow()]);
        expect(results).toHaveLength(0);
    });
});
