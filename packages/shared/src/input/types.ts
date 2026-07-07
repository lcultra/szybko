/** 文本候选来源 */
export type TextSource
    = | 'query'
        | 'selectedText'
        | 'clipboardText'
        | 'draggedText'
        | 'redirectPayload';

/** 入口意图 */
export type EntryIntent = 'main' | 'panel' | 'hotkey' | 'redirect';

/** 一次入口会话的上下文快照。值对象，不进数据库，不直接发给插件。 */
export interface InputContextSnapshot {
    /** 主搜索框输入文本 */
    query: string;
    /** 可被文本类 matcher 消费的候选文本集合，带来源标记 */
    texts: { text: string; source: TextSource }[];
    /** 各通道可用性状态 */
    channels: {
        query: boolean;
        text: boolean;
        files: boolean;
        image: boolean;
        window: boolean;
    };
    /** 入口来源 */
    from: EntryIntent;
    /** 元信息 */
    meta: {
        platform: string;
        timestamp: number;
        errors: { channel: string; error: string }[];
    };
}

/** Matcher Pipeline 的标准输出。用户选择候选后通过此 matchId 找回完整信息。 */
export interface TriggerMatch {
    matchId: string;
    pluginId: string;
    featureCode: string;
    cmdKey: string;
    triggerType: 'text' | 'regex' | 'over' | 'files' | 'img' | 'window';
    enterType: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    label: string | null;
    matchedSource: string;
    payload: unknown;
    from: EntryIntent;
    option: string | null;
    score: number;
    matchLevel?: number;
}

/** 搜索结果展示投影，同一次会话中与 InputContextSnapshot 绑定。 */
export interface MatchSession {
    sessionId: string;
    inputContextSnapshot: InputContextSnapshot;
    triggerMatches: TriggerMatch[];
    expiresAt: number;
}

/** 插件开发者看到的公开生命周期事件参数。 */
export interface PluginEnterAction {
    code: string;
    type: 'text' | 'regex' | 'over' | 'file' | 'img' | 'window';
    payload: unknown;
    option?: string;
    from: EntryIntent;
}
