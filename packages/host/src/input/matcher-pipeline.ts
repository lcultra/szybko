import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { CommandSearchRow } from '../persistence/sqlite/repositories/command-projection-repository';
import { TextMatcher } from './matchers/text-matcher';
import { RegexMatcher } from './matchers/regex-matcher';
import { OverMatcher } from './matchers/over-matcher';
import type { Matcher } from './matchers/matcher';

const matchers: Matcher[] = [
    new TextMatcher(),
    new RegexMatcher(),
    new OverMatcher(),
];

/** 根据当前上下文中启用的通道，筛选需要运行的 matcher 类型 */
function selectCandidateTypes(snapshot: InputContextSnapshot): Set<string> {
    const types = new Set<string>();
    if (snapshot.channels.query) {
        types.add('text');
        types.add('regex');
        types.add('over');
    }
    if (snapshot.channels.text) {
        types.add('regex');
        types.add('over');
    }
    return types;
}

/** 从触发器数组中筛选指定类型的行 */
function filterTriggersByType(triggers: CommandSearchRow[], types: Set<string>): Map<string, CommandSearchRow[]> {
    const map = new Map<string, CommandSearchRow[]>();
    for (const t of triggers) {
        if (types.has(t.type)) {
            const arr = map.get(t.type) ?? [];
            arr.push(t);
            map.set(t.type, arr);
        }
    }
    return map;
}

/** 排序和去重（相同 pluginId+featureCode+cmdKey+payload 只保留最高分） */
function dedupAndSort(matches: TriggerMatch[]): TriggerMatch[] {
    const seen = new Map<string, TriggerMatch>();
    for (const m of matches) {
        const key = `${m.pluginId}:${m.featureCode}:${m.cmdKey}:${m.matchedSource}`;
        const existing = seen.get(key);
        if (!existing || m.score > existing.score) {
            seen.set(key, m);
        }
    }
    return [...seen.values()].sort((a, b) => b.score - a.score);
}

export function runPipeline(
    snapshot: InputContextSnapshot,
    triggers: CommandSearchRow[],
): TriggerMatch[] {
    const candidateTypes = selectCandidateTypes(snapshot);
    const byType = filterTriggersByType(triggers, candidateTypes);
    const allMatches: TriggerMatch[] = [];

    for (const matcher of matchers) {
        const typeTriggers = byType.get(matcher.type);
        if (!typeTriggers || typeTriggers.length === 0)
            continue;
        const matches = matcher.match(snapshot, typeTriggers);
        allMatches.push(...matches);
    }

    return dedupAndSort(allMatches);
}
