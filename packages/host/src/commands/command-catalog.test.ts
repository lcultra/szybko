import { describe, expect, it } from 'vitest';
import { createInMemoryPlatformDatabase } from '../persistence/sqlite/platform-database';
import { CommandCatalog } from './command-catalog';

describe('commandCatalog', () => {
    it('matches static manifest text commands', () => {
        const platformDb = createInMemoryPlatformDatabase();
        const catalog = CommandCatalog.createForDatabase(platformDb);

        catalog.indexPlugin('preferences', {
            main: 'index.html',
            logo: 'logo.png',
            features: [{ code: 'prefs', explain: '首选项', cmds: ['设置'] }],
        }, '/plugins/preferences/dist');

        const results = catalog.match('设置');
        expect(results).toHaveLength(1);
        expect(results[0]?.action).toEqual({
            type: 'plugin.open',
            payload: { pluginId: 'preferences', featureCode: 'prefs' },
        });
    });

    it('uses dynamic override instead of manifest command', () => {
        const platformDb = createInMemoryPlatformDatabase();
        const catalog = CommandCatalog.createForDatabase(platformDb);

        catalog.indexPlugin('preferences', {
            main: 'index.html',
            logo: 'logo.png',
            features: [{ code: 'prefs', explain: '首选项', cmds: ['设置'] }],
        }, '/plugins/preferences/dist');
        catalog.setFeature('preferences', { code: 'prefs', explain: '配置', cmds: ['config'] });

        expect(catalog.match('设置')).toHaveLength(0);
        expect(catalog.match('config')).toHaveLength(1);
    });

    it('normalizes dynamic feature code before applying an override', () => {
        const platformDb = createInMemoryPlatformDatabase();
        const catalog = CommandCatalog.createForDatabase(platformDb);

        catalog.indexPlugin('preferences', {
            main: 'index.html',
            logo: 'logo.png',
            features: [{ code: 'prefs', explain: '首选项', cmds: ['设置'] }],
        }, '/plugins/preferences/dist');
        catalog.setFeature('preferences', { code: ' prefs ', explain: '配置', cmds: ['config'] });

        expect(catalog.match('设置')).toHaveLength(0);
        expect(catalog.match('config')).toHaveLength(1);
    });
});
