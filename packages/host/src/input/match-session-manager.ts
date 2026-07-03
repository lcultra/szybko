import type { InputContextSnapshot, MatchSession, TriggerMatch } from '@szybko/shared';
import { randomUUID } from 'node:crypto';

const SESSION_TTL_MS = 60_000;

export class MatchSessionManager {
    private sessions = new Map<string, MatchSession>();

    create(snapshot: InputContextSnapshot): MatchSession {
        const sessionId = randomUUID();
        const session: MatchSession = {
            sessionId,
            inputContextSnapshot: snapshot,
            triggerMatches: [],
            expiresAt: Date.now() + SESSION_TTL_MS,
        };
        this.sessions.set(sessionId, session);
        this.evictExpired();
        return session;
    }

    addMatches(sessionId: string, matches: TriggerMatch[]): void {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.triggerMatches = matches;
    }

    resolve(matchId: string): { match: TriggerMatch; session: MatchSession } | null {
        this.evictExpired();
        for (const session of this.sessions.values()) {
            for (const match of session.triggerMatches) {
                if (match.matchId === matchId) {
                    return { match, session };
                }
            }
        }
        return null;
    }

    private evictExpired(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (session.expiresAt <= now) {
                this.sessions.delete(id);
            }
        }
    }

    /** For testing: clear all sessions */
    clear(): void {
        this.sessions.clear();
    }
}
