import { describe, expect, it } from 'vitest';
import { collectFromSearch } from './input-context-collector';

describe('input context collector', () => {
    it('builds snapshot from search query with texts array', () => {
        const snapshot = collectFromSearch({
            queryId: 'q1',
            query: '测试输入',
            timestamp: 1000,
        });

        expect(snapshot.query).toBe('测试输入');
        expect(snapshot.texts).toHaveLength(1);
        expect(snapshot.texts[0]).toEqual({ text: '测试输入', source: 'query' });
        expect(snapshot.from).toBe('main');
        expect(snapshot.channels.query).toBe(true);
        expect(snapshot.channels.text).toBe(true);
        expect(snapshot.channels.files).toBe(false);
        expect(snapshot.channels.image).toBe(false);
        expect(snapshot.channels.window).toBe(false);
    });

    it('handles empty query', () => {
        const snapshot = collectFromSearch({
            queryId: 'q2',
            query: '',
            timestamp: 1000,
        });

        expect(snapshot.query).toBe('');
        expect(snapshot.texts).toHaveLength(0);
        expect(snapshot.channels.query).toBe(false);
        expect(snapshot.channels.text).toBe(false);
    });
});
