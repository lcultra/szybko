// ── LauncherItemId ────────────────────────────────────────────────

/** 所有搜索结果的统一标识。pin/recent/execute 都基于此，不绑定任何 provider 内部结构。 */
export type LauncherItemId
    = | `plugin://${string}/${string}/${string}` // pluginId / featureCode / cmdKey
        | `app://${string}` // bundleId
        | `file://${string}` // absolute path
        | `url://${string}`; // url hash

// ── IconDescriptor ────────────────────────────────────────────────

export type IconDescriptor
    = | { type: 'url'; value: string }
        | { type: 'asset'; value: string };

// ── TextMatch（高亮） ─────────────────────────────────────────────

export interface TextMatches {
    title?: MatchRange[];
    subtitle?: MatchRange[];
}

export interface MatchRange {
    start: number;
    end: number;
}

// ── LauncherItem 能力与状态 ───────────────────────────────────────

/** 能力声明——UI 根据这个渲染交互，不判断 ownerProvider。 */
export interface LauncherItemCapabilities {
    pin?: boolean; // 用户可固定
    reveal?: boolean; // 可在系统文件管理器中显示
    dragSort?: boolean; // 可在固定区拖拽排序
    contextMenu?: boolean; // 有右键菜单
    preview?: boolean; // 可预览（未来）
}

/** 运行时状态——由 session / 数据库驱动，provider 不控制。 */
export interface LauncherItemState {
    pinned: boolean; // 当前是否已被用户固定
}

// ── LauncherItem ──────────────────────────────────────────────────

export interface LauncherItem {
    id: LauncherItemId;
    ownerProvider: string; // "plugin" | "app" | "file" | "url"
    title: string;
    subtitle?: string;
    icon?: IconDescriptor;
    score: number;

    capabilities: LauncherItemCapabilities;
    state: LauncherItemState;

    matches?: TextMatches;
    matchLevel?: number;
}

// ── ResultSection ─────────────────────────────────────────────────

export type SectionSource = 'pinned' | 'recent' | 'search';
export type SectionLayout = 'grid' | 'list' | 'compact';

export interface ResultSection {
    id: string; // "apps" | "plugins" | ...
    title: string; // 显示名 "应用" | "插件" | ...
    source: SectionSource;
    layout: SectionLayout;
    itemIds: LauncherItemId[]; // 只引用 id，数据在 SearchResponse.itemsById
    totalCount: number; // 该 section 结果总数（可能 > itemIds.length）
    hasMore?: boolean; // 是否有更多可加载（用于分页/展开）
    priority: number; // 排序权重，越小越靠前
}

// ── SearchResponse ────────────────────────────────────────────────

export type SearchResponseStatus = 'loading' | 'partial' | 'final';

export interface SearchResponse {
    queryId: string;
    sessionId: string;
    status: SearchResponseStatus;
    sections: ResultSection[];
    itemsById: Record<LauncherItemId, LauncherItem>;
}

// ── 搜索请求（保持，仍用于 IPC 入参） ─────────────────────────────

export interface SearchRequest {
    queryId: string;
    query: string;
    timestamp: number;
}

// ── ActionDescriptor（保持，仍用于 main 侧执行） ──────────────────

export type ActionDescriptor
    = | { type: 'shell.openPath'; payload: { path: string } }
        | { type: 'shell.openUrl'; payload: { url: string } }
        | { type: 'clipboard.writeText'; payload: { text: string } }
        | { type: 'process.launchApp'; payload: { bundleId: string } }
        | { type: 'plugin.open'; payload: { pluginId: string; featureCode?: string; matchId?: string } }
        | { type: 'plugin.runCommand'; payload: { pluginId: string; command: string; args?: any[] } }
        | { type: 'text.paste'; payload: { text: string } }
        | { type: 'redirect'; payload: { label: string; payload?: any } };
