import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../../sqlite/repositories/command-projection-repository';
import type { Matcher } from './matcher';

interface RegexMatcherConfig {
    type: 'regex';
    match: { pattern: string; flags: string };
    minLength?: number;
    maxLength?: number;
}

export class RegexMatcher implements Matcher {
    readonly type = 'regex';

    match(snapshot: InputContextSnapshot, triggers: CommandSearchRow[]): TriggerMatch[] {
        const results: TriggerMatch[] = [];

        for (const trigger of triggers) {
            const config: RegexMatcherConfig = JSON.parse(trigger.matcherJson);
            if (config.type !== 'regex')
                continue;

            const regex = new RegExp(config.match.pattern, config.match.flags);

            for (const tc of snapshot.texts) {
                if (config.minLength !== undefined && tc.text.length < config.minLength)
                    continue;
                if (config.maxLength !== undefined && tc.text.length > config.maxLength)
                    continue;

                const match = regex.exec(tc.text);
                if (match) {
                    results.push({
                        matchId: `regex:${trigger.pluginId}:${trigger.featureCode}:${trigger.cmdKey}:${tc.source}`,
                        pluginId: trigger.pluginId,
                        featureCode: trigger.featureCode,
                        cmdKey: trigger.cmdKey,
                        triggerType: 'regex',
                        enterType: 'regex',
                        label: trigger.label,
                        matchedSource: tc.text,
                        payload: tc.text,
                        from: snapshot.from,
                        option: null,
                        score: trigger.scoreBase,
                    });
                }
            }
        }

        return results;
    }
}
