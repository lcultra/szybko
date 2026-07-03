import type { InputContextSnapshot, TriggerMatch } from '@szybko/shared';
import type { PlatformDrizzleDatabase } from '../persistence/sqlite/platform-database';
import { CommandProjectionRepository } from '../persistence/sqlite/repositories/command-projection-repository';
import { normalizeTextKey } from '../commands/feature-normalizer';
import { dedupAndSort, runPipeline } from './matcher-pipeline';

/**
 * SearchService — 搜索编排。
 * 负责 text 匹配、非 text 匹配、合并、去重、排序。
 * 不处理 IPC 消息格式或 session 管理。
 */
export class SearchService {
    constructor(private db: PlatformDrizzleDatabase) {}

    /**
     * 执行一次完整搜索，返回去重排序后的匹配结果。
     * @param snapshot 当前输入上下文（query、channels 等）
     * @param query 用户输入的原始字符串
     */
    search(snapshot: InputContextSnapshot, query: string): TriggerMatch[] {
        const allMatches: TriggerMatch[] = [];

        // 1. Text matching via SQL searchByText (with pinyin/alias)
        if (snapshot.channels.query && query) {
            const normalized = normalizeTextKey(query);
            if (normalized) {
                const repo = new CommandProjectionRepository(this.db);
                const textMatches = repo.searchByText(normalized);
                for (const m of textMatches) {
                    const score = m.scoreBase + (m.matchLevel === 3 ? 10 : m.matchLevel === 2 ? 5 : 2);
                    allMatches.push({
                        matchId: `${m.source}:${m.pluginId}:${m.featureCode}:${m.cmdKey}`,
                        pluginId: m.pluginId,
                        featureCode: m.featureCode,
                        cmdKey: m.cmdKey,
                        triggerType: 'text',
                        enterType: 'text',
                        label: m.label,
                        matchedSource: query,
                        payload: query,
                        from: snapshot.from,
                        option: null,
                        score,
                    });
                }
            }
        }

        // 2. Non-text matching via pipeline (regex/over)
        const repo = new CommandProjectionRepository(this.db);
        const nonTextTypes: Array<'regex' | 'over'> = ['regex', 'over'];
        const triggers = repo.listTriggersByType(nonTextTypes);
        const nonTextMatches = runPipeline(snapshot, triggers);
        allMatches.push(...nonTextMatches);

        // 3. Dedup + Sort
        return dedupAndSort(allMatches);
    }
}
