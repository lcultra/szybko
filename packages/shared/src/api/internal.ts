import type { RuntimeStatePayload } from '../ipc/contract';
import type { RuntimeSlot } from '../runtime/types';
import type {
    LauncherItemId,
    SearchRequest,
    SearchResponse,
} from '../search/types';
import type { ShortcutActionDef, ShortcutScope } from '../shortcut/types';

/**
 * SzybkoInternalApi — renderer 通过 window.szybkoInternal 调用的主机侧 API。
 *
 * 命名规约：
 * - 方法 = 主动操作（search / pin / execute / resize）
 * - on* = 事件订阅（main → renderer 推送）
 */
export interface SzybkoInternalApi {
    // ── 搜索（新） ──
    search: (req: SearchRequest) => Promise<{ ok: boolean; sessionId?: string }>;
    searchCancel: (queryId: string) => Promise<{ ok: boolean }>;
    onSearchResponse: (cb: (res: SearchResponse) => void) => () => void;

    // ── Item 交互（参数为 IPC contract 的 request payload） ──
    pinItem: (req: { itemId: LauncherItemId; pin: boolean }) => Promise<{ ok: boolean }>;
    reorderItem: (req: { itemId: LauncherItemId; toIndex: number }) => Promise<{ ok: boolean }>;
    openContextMenu: (req: { itemId: LauncherItemId; screenX: number; screenY: number; source?: 'pinned' | 'recent' | 'search' }) => Promise<{ ok: boolean }>;
    execute: (req: { sessionId: string; queryId: string; itemId: LauncherItemId }) => Promise<{ ok: boolean; error?: string }>;

    // ── 窗口 ──
    resizeWindow: (height: number) => Promise<{ ok: boolean }>;
    hideWindow: () => Promise<{ ok: boolean }>;

    // ── 插件运行时 ──
    hidePlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    destroyPlugin: (runtimeId: string) => Promise<{ ok: boolean }>;
    showPluginMenu: (runtimeId: string, hostType?: 'launcher' | 'floating') => Promise<{ ok: boolean }>;
    pinPlugin: (runtimeId: string, pin: boolean) => Promise<{ ok: boolean }>;
    onRuntimeStateChanged: (cb: (state: RuntimeStatePayload) => void) => () => void;

    /**
     * 浮动窗口 slot 更新推送（pool 复用窗口时切换插件信息）
     */
    onFloatingSlotUpdate: (cb: (slot: RuntimeSlot) => void) => () => void;

    // ── 系统事件 ──
    onShowMainWindow: (cb: () => void) => () => void;
    onThemeChanged: (cb: (theme: { isDark: boolean }) => void) => () => void;

    // ── 布局常量（后端驱动，renderer 通过此方法获取 CSS 变量和数值） ──
    getLayoutConstants: () => {
        css: Record<string, string>;
        raw: Record<string, number>;
    };

    // ── 插件安装管理 ──
    setPluginEnabled: (req: { pluginId: string; enabled: boolean }) => Promise<{ ok: boolean; error?: string }>;
    uninstallPlugin: (req: { pluginId: string }) => Promise<{ ok: boolean; error?: string }>;

    // ── 快捷键 ──
    getShortcutDefs: (scope: ShortcutScope) => Promise<ShortcutActionDef[]>;

}
