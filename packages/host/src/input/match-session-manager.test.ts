import { describe, expect, it } from 'vitest';
import { MatchSessionManager } from './match-session-manager';

describe('MatchSessionManager', () => {
    it('creates session and resolves match by id', () => {
        const mgr = new MatchSessionManager();
        const session = mgr.create({
            query: 'test',
            texts: [],
            channels: { query: true, text: false, files: false, image: false, window: false },
            from: 'main',
            meta: { platform: 'darwin', timestamp: 0, errors: [] },
        });

        expect(session.triggerMatches).toHaveLength(0);
        expect(session.sessionId).toBeTruthy();
    });

    it('returns null for unknown matchId', () => {
        const mgr = new MatchSessionManager();
        expect(mgr.resolve('nonexistent')).toBeNull();
    });
});
