import { describe, expect, it } from 'vitest';
import { buildCommandProjection } from './command-projection-builder';

describe('command projection builder', () => {
    it('uses manifest feature when no override exists', () => {
        const projection = buildCommandProjection({
            pluginId: 'demo',
            manifestHash: 'm1',
            indexVersion: 1,
            now: 100,
            manifestFeatures: [{
                code: 'prefs',
                featureOrder: 0,
                feature: { code: 'prefs', explain: '设置', cmds: ['设置'] },
            }],
            overrides: [],
        });

        expect(projection.effectiveFeatures).toHaveLength(1);
        expect(projection.effectiveFeatures[0]?.source).toBe('manifest');
        expect(projection.commandTriggers[0]?.normalizedKey).toBe('设置');
    });

    it('active override replaces manifest feature with same code', () => {
        const projection = buildCommandProjection({
            pluginId: 'demo',
            manifestHash: 'm1',
            indexVersion: 1,
            now: 100,
            manifestFeatures: [{
                code: 'prefs',
                featureOrder: 0,
                feature: { code: 'prefs', explain: '设置', cmds: ['设置'] },
            }],
            overrides: [{
                code: 'prefs',
                state: 'active',
                feature: { code: 'prefs', explain: '配置', cmds: ['config'] },
            }],
        });

        expect(projection.effectiveFeatures).toHaveLength(1);
        expect(projection.effectiveFeatures[0]?.source).toBe('dynamic');
        expect(projection.commandTriggers[0]?.normalizedKey).toBe('config');
    });

    it('removed override deletes manifest feature and does not restore it', () => {
        const projection = buildCommandProjection({
            pluginId: 'demo',
            manifestHash: 'm1',
            indexVersion: 1,
            now: 100,
            manifestFeatures: [{
                code: 'prefs',
                featureOrder: 0,
                feature: { code: 'prefs', explain: '设置', cmds: ['设置'] },
            }],
            overrides: [{ code: 'prefs', state: 'removed' }],
        });

        expect(projection.effectiveFeatures).toHaveLength(0);
        expect(projection.commandTriggers).toHaveLength(0);
    });
});
