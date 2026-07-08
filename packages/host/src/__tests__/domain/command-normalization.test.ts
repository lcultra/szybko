import { describe, expect, it } from 'vitest';
import { dedupSearchEntries, stableJson } from '../../domain';

describe('dedupSearchEntries', () => {
    it('should prefer cmd source over alias', () => {
        const entries = [
            { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'hello', source: 'alias', matchLevel: 1, aliasId: 1 },
            { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'hello', source: 'cmd', matchLevel: 1, aliasId: null },
        ];
        const result = dedupSearchEntries(entries);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('cmd');
    });

    it('should prefer higher match level', () => {
        const entries = [
            { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'test', source: 'cmd', matchLevel: 1, aliasId: null },
            { pluginId: 'p1', featureCode: 'f1', cmdKey: 'k1', searchText: 'test', source: 'cmd', matchLevel: 3, aliasId: null },
        ];
        const result = dedupSearchEntries(entries);
        expect(result).toHaveLength(1);
        expect(result[0].matchLevel).toBe(3);
    });
});

describe('stableJson', () => {
    it('should produce deterministic JSON', () => {
        expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    });
});
