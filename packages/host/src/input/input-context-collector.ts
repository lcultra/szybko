import type { InputContextSnapshot, SearchRequest } from '@szybko/shared';

export function collectFromSearch(req: SearchRequest): InputContextSnapshot {
    const query = req.query;
    const hasQuery = query.length > 0;

    return {
        query,
        texts: hasQuery ? [{ text: query, source: 'query' as const }] : [],
        channels: {
            query: hasQuery,
            text: hasQuery,
            files: false,
            image: false,
            window: false,
        },
        from: 'main',
        meta: {
            platform: process.platform,
            timestamp: req.timestamp,
            errors: [],
        },
    };
}
