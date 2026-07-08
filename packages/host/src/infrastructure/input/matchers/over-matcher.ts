import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../sqlite/repositories/command-projection-repository';
import type { Matcher } from './matcher';

interface OverMatcherConfig {
    type: 'over';
    exclude?: { pattern: string; flags: string };
    minLength?: number;
    maxLength?: number;
}

export class OverMatcher implements Matcher {
    readonly type = 'over';

    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[] {
        const results: TriggerMatch[] = [];

        for (const trigger of triggers) {
            const config: OverMatcherConfig = JSON.parse(trigger.matcherJson);
            if (config.type !== 'over')
                continue;

            const excludeRegex = config.exclude
                ? new RegExp(config.exclude.pattern, config.exclude.flags)
                : null;

            for (const tc of snapshot.texts) {
                if (config.minLength !== undefined && tc.text.length < config.minLength)
                    continue;
                if (config.maxLength !== undefined && tc.text.length > config.maxLength)
                    continue;
                if (excludeRegex && excludeRegex.test(tc.text))
                    continue;

                results.push({
                    matchId: `over:${trigger.pluginId}:${trigger.featureCode}:${trigger.cmdKey}:${tc.source}`,
                    pluginId: trigger.pluginId,
                    featureCode: trigger.featureCode,
                    cmdKey: trigger.cmdKey,
                    triggerType: 'over',
                    enterType: 'over',
                    label: trigger.label,
                    matchedSource: tc.text,
                    payload: tc.text,
                    from: snapshot.from,
                    option: null,
                    score: trigger.scoreBase,
                });
            }
        }

        return results;
    }
}
