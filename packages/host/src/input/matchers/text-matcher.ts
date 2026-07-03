import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../persistence/sqlite/repositories/command-projection-repository';
import { normalizeTextKey } from '../../commands/feature-normalizer';
import type { Matcher } from './matcher';

export class TextMatcher implements Matcher {
    readonly type = 'text';

    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[] {
        const normalizedQuery = normalizeTextKey(snapshot.query);
        if (!normalizedQuery)
            return [];

        return triggers
            .filter(t => t.normalizedKey && normalizeTextKey(t.normalizedKey) === normalizedQuery)
            .map(t => ({
                matchId: `text:${t.pluginId}:${t.featureCode}:${t.cmdKey}`,
                pluginId: t.pluginId,
                featureCode: t.featureCode,
                cmdKey: t.cmdKey,
                triggerType: 'text' as const,
                enterType: 'text' as const,
                label: t.label,
                matchedSource: snapshot.query,
                payload: snapshot.query,
                from: snapshot.from,
                option: null,
                score: t.scoreBase,
            }));
    }
}
