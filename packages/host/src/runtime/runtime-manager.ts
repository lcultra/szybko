import type { LoadState, MountState, PluginEnterPayload } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { WindowManager } from '../window/window-manager';
import type { PluginRuntime } from './types';
import { isFocusable } from '../window/hosts/capabilities';
import { join } from 'node:path';
import { IPC } from '@szybko/shared';
import { app, WebContentsView } from 'electron';

interface RuntimeEntry {
    runtime: PluginRuntime;
}

/** Cmd/Ctrl+D 分离请求回调 */
type DetachCallback = (runtimeId: string) => void;

export class RuntimeManager {
    private entries: Map<string, RuntimeEntry> = new Map();
    /** 内部跟踪每个 runtime 挂载到哪个 host */
    private hostMap: Map<string, RuntimeHost> = new Map();
    private nextInstanceId = 1;

    detachRequested: DetachCallback | null = null;

    constructor(
        private pluginManager: PluginCatalog,
        private windowManager: WindowManager,
        private pluginPreloadPath: string,
    ) {}

    // ── Lifecycle ────────────────────────────────────────────────────

    startAll(): void {
        for (const plugin of this.pluginManager.getEnabled()) {
            this.create(plugin.id);
        }
    }

    create(pluginId: string): PluginRuntime | null {
        const plugin = this.pluginManager.get(pluginId);
        if (!plugin)
            return null;

        const view = new WebContentsView({
            webPreferences: {
                preload: this.pluginPreloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        const runtimeId = `${pluginId}-${this.nextInstanceId++}`;
        const runtime: PluginRuntime = {
            info: {
                id: runtimeId,
                pluginId,
                instanceId: String(this.nextInstanceId),
                loadState: 'loading',
                mountState: 'detached',
                hostInfo: null,
            },
            webContentsView: view,
            webContents: view.webContents,
            cache: new Map(),
            pluginName: pluginId,
        };

        this.entries.set(runtimeId, { runtime });

        view.webContents.on('did-finish-load', () => {
            this.transitionLoadState(runtimeId, 'loaded');
        });

        // Cmd/Ctrl + D → 分离到浮动窗口（插件视图有焦点时）
        view.webContents.on('before-input-event', (_event, input) => {
            if ((input.control || input.meta) && input.key.toLowerCase() === 'd' && !input.alt && !input.shift) {
                this.detachRequested?.(runtimeId);
            }
        });

        const devUrl = !app.isPackaged && plugin.manifest.development?.main;
        if (devUrl) {
            view.webContents.loadURL(devUrl);
        }
        else {
            const indexPath = join(plugin.path, plugin.manifest.main);
            view.webContents.loadFile(indexPath);
        }

        return runtime;
    }

    // ── Host tracking ────────────────────────────────────────────────

    /** 获取指定 runtime 当前挂载的 host */
    getHostFor(runtimeId: string): RuntimeHost | null {
        return this.hostMap.get(runtimeId) ?? null;
    }

    /** 获取某个插件（首个匹配的 runtime）挂载的 host */
    getHostByPluginId(pluginId: string): RuntimeHost | null {
        for (const [id] of this.entries) {
            const host = this.hostMap.get(id);
            if (host && this.get(id)?.info.pluginId === pluginId)
                return host;
        }
        return null;
    }

    /** 将插件 view 挂载到指定 Host */
    attachToHost(runtimeId: string, host: RuntimeHost, featureCode?: string, enterPayload?: Partial<PluginEnterPayload>): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToHost: runtime ${runtimeId} not found`);
            return;
        }

        // 已在浮动窗口中 → 聚焦窗口，不挂载到新 host
        const existingHost = this.hostMap.get(runtimeId);
        if (existingHost?.type === 'floating' && isFocusable(existingHost)) {
            existingHost.focus();
            entry.runtime.webContents.send(IPC.PLUGIN_ENTER, enterPayload ?? {
                pluginId: entry.runtime.info.pluginId,
                code: featureCode ?? entry.runtime.info.pluginId,
                type: 'text',
                payload: null,
                from: 'main',
            });
            return;
        }

        // 从旧 host 分离（如果有）
        if (existingHost) {
            existingHost.detach();
        }

        const plugin = this.pluginManager.get(entry.runtime.info.pluginId);
        host.attach(entry.runtime.webContentsView, {
            runtimeId: entry.runtime.info.id,
            pluginId: entry.runtime.info.pluginId,
            pluginName: this.getPluginDisplayName(entry.runtime.info.pluginId),
            featureExplain: plugin?.manifest.features[0]?.explain,
        });

        this.hostMap.set(runtimeId, host);
        entry.runtime.info.mountState = 'attached';
        entry.runtime.info.hostInfo = { id: host.id, type: host.type };

        // 只有挂载到主窗口时才通知主窗口 UI 切换状态
        if (host.type === 'launcher') {
            this.publishState(runtimeId, 'attached', entry.runtime.info.loadState);
        }

        // 通知插件进入
        entry.runtime.webContents.send(IPC.PLUGIN_ENTER, enterPayload ?? {
            pluginId: entry.runtime.info.pluginId,
            code: featureCode ?? entry.runtime.info.pluginId,
            type: 'text',
            payload: null,
            from: 'main',
        });
    }

    /** 从 Host 分离插件 */
    detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        const host = this.hostMap.get(runtimeId);
        if (host) {
            host.detach();
            this.hostMap.delete(runtimeId);
        }

        entry.runtime.info.mountState = 'detached';
        entry.runtime.info.hostInfo = null;

        this.publishState(runtimeId, 'detached', entry.runtime.info.loadState);

        // detach 带原因时，通知插件
        if (reason) {
            entry.runtime.webContents.send(IPC.PLUGIN_OUT, {
                runtimeId: entry.runtime.info.id,
                pluginId: entry.runtime.info.pluginId,
                reason,
            });
        }
    }

    // ── Query ────────────────────────────────────────────────────────

    pluginIdForWebContents(webContentsId: number): string | null {
        for (const [, entry] of this.entries) {
            if (entry.runtime.webContents.id === webContentsId)
                return entry.runtime.info.pluginId;
        }
        return null;
    }

    get runtimeCount(): number {
        return this.entries.size;
    }

    /** 获取或创建 Runtime — 先查找已有实例，没有再创建 */
    getOrCreate(pluginId: string): PluginRuntime | null {
        const existing = this.getByPluginId(pluginId);
        if (existing)
            return existing;
        return this.create(pluginId);
    }

    /** 按 pluginId 查找已有 runtime（首个匹配） */
    getByPluginId(pluginId: string): PluginRuntime | undefined {
        for (const [, entry] of this.entries) {
            if (entry.runtime.info.pluginId === pluginId)
                return entry.runtime;
        }
        return undefined;
    }

    /** 按 runtimeId 获取 */
    get(runtimeId: string): PluginRuntime | undefined {
        return this.entries.get(runtimeId)?.runtime;
    }

    /** 获取所有 Runtime */
    getAll(): PluginRuntime[] {
        return Array.from(this.entries.values()).map(e => e.runtime);
    }

    /** 销毁 Runtime */
    destroy(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        this.hostMap.delete(runtimeId);
        entry.runtime.webContents.close();
        this.entries.delete(runtimeId);
    }

    // ── Internals ────────────────────────────────────────────────────

    private transitionLoadState(runtimeId: string, target: LoadState): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        entry.runtime.info.loadState = target;
    }

    private getPluginDisplayName(pluginId: string): string {
        const plugin = this.pluginManager.get(pluginId);
        if (plugin) {
            const feature = plugin.manifest.features[0];
            if (feature?.explain)
                return feature.explain;
        }
        return pluginId;
    }

    private publishState(runtimeId: string, mountState: MountState, loadState: LoadState): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        const pluginName = this.getPluginDisplayName(entry.runtime.info.pluginId);
        let featureExplain = '';
        const plugin = this.pluginManager.get(entry.runtime.info.pluginId);
        if (plugin) {
            const feature = plugin.manifest.features[0];
            if (feature)
                featureExplain = feature.explain || '';
        }

        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.info.id,
                pluginId: entry.runtime.info.pluginId,
                pluginName,
                featureExplain,
                state: mountState,
                mountState,
                loadState,
            });
        }
    }
}
