import { describe, expect, it } from 'vitest';
import { runPipeline } from './matcher-pipeline';
import type { InputContextSnapshot } from '@szybko/shared';
import type { CommandSearchRow } from '../persistence/sqlite/repositories/command-projection-repository';

describe('matcher pipeline', () => {
    it('runs text and regex matchers against query', () => {
        const snapshot: InputContextSnapshot = {
            query: 'https://example.com',
            texts: [{ text: 'https://example.com', source: 'query' }],
            channels: { query: true, text: true, files: false, image: false, window: false },
            from: 'main',
            meta: { platform: 'darwin', timestamp: 0, errors: [] },
        };

        const triggers: CommandSearchRow[] = [
            {
                pluginId: 'prefs', featureCode: 'settings', cmdKey: 'k1',
                triggerIndex: 0, source: 'feature_cmd', type: 'text',
                label: '设置', normalizedKey: '设置',
                targetCmdKey: null, scoreBase: 90, featureJson: '{}',
            },
            {
                pluginId: 'linker', featureCode: 'open-url', cmdKey: 'k2',
                triggerIndex: 0, source: 'feature_cmd', type: 'regex',
                label: '打开链接', normalizedKey: null,
                targetCmdKey: null, scoreBase: 85,
                featureJson: JSON.stringify({ matcher: { type: 'regex', match: { pattern: '^(https?):\\/\\/.+$', flags: 'i' } } }),
            },
        ];

        const matches = runPipeline(snapshot, triggers);
        expect(matches).toHaveLength(1); // only regex matches
        expect(matches[0]?.pluginId).toBe('linker');
    });
});
