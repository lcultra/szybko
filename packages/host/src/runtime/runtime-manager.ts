import type { LoadState, MountState, PluginSearchContext, SearchRequest } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { PluginRuntime } from '../runtime/types';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { WindowManager } from '../window/window-manager';
import { join } from 'node:path';
import { IPC } from '@szybko/shared';
import { app, WebContentsView } from 'electron';
import { FloatingRuntimeHost } from '../window/hosts/floating-runtime-host';

interface RuntimeEntry {
    runtime: PluginRuntime;
}

export class RuntimeManager {
    private entries: Map<string, RuntimeEntry> = new Map();
    private nextInstanceId = 1;

    constructor(
        private pluginManager: PluginCatalog,
        private windowManager: WindowManager,
        private pluginPreloadPath: string,
    ) {}

    async startAll(): Promise<void> {
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
        // view.setBorderRadius(11);

        const id = `${pluginId}-${this.nextInstanceId++}`;
        const runtime: PluginRuntime = {
            info: {
                id,
                pluginId,
                instanceId: String(this.nextInstanceId),
                loadState: 'loading',
                mountState: 'detached',
                hostInfo: null,
            },
            webContentsView: view,
            webContents: view.webContents,
            host: null,
            cache: new Map(),
            pluginName: pluginId,
        };

        this.entries.set(id, { runtime });

        view.webContents.on('did-finish-load', () => {
            this.transitionLoadState(id, 'loaded');
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

    sendPluginSearch(req: SearchRequest): void {
        for (const [, entry] of this.entries) {
            const { mountState, loadState } = entry.runtime.info;
            // 只要不是在 detached 且不是 error 的，都发搜索
            if (mountState !== 'detached' && loadState !== 'error') {
                const ctx: PluginSearchContext = {
                    queryId: req.queryId,
                    keyword: req.query.split(/\s+/)[0] || '',
                    query: req.query,
                    fullQuery: req.query,
                };
                entry.runtime.webContents.send(IPC.PLUGIN_SEARCH, ctx);
            }
        }
    }

    get runtimeCount(): number {
        return this.entries.size;
    }

    // ── State transitions ──────────────────────────────────────────

    private transitionLoadState(runtimeId: string, target: LoadState): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        entry.runtime.info.loadState = target;
    }

    private transitionMountState(runtimeId: string, target: MountState, reason?: 'hide' | 'destroy'): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        entry.runtime.info.mountState = target;

        // 查询插件显示信息
        let pluginName = entry.runtime.pluginName;
        let featureExplain = '';
        const plugin = this.pluginManager.get(entry.runtime.info.pluginId);
        if (plugin) {
            const feature = plugin.manifest.features[0];
            if (feature) {
                pluginName = feature.explain || plugin.id;
                featureExplain = feature.explain || '';
            }
        }

        // 通知渲染进程状态变更（包含新旧两个字段）
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.info.id,
                pluginId: entry.runtime.info.pluginId,
                pluginName,
                featureExplain,
                state: target,
                mountState: target,
                loadState: entry.runtime.info.loadState,
            });
        }

        // detach 带原因时，通知插件
        if (target === 'detached' && reason) {
            entry.runtime.webContents.send(IPC.PLUGIN_OUT, {
                runtimeId: entry.runtime.info.id,
                pluginId: entry.runtime.info.pluginId,
                reason,
            });
        }
    }

    // ── Activation / Deactivation ─────────────────────────────────

    /** 将插件 view 挂载到指定 Host */
    attachToHost(runtimeId: string, host: RuntimeHost, featureCode?: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToHost: runtime ${runtimeId} not found`);
            return;
        }

        // 已在浮动窗口中 → 聚焦窗口，不操作主窗口
        if (entry.runtime.host?.type === 'floating') {
            const fHost = entry.runtime.host as FloatingRuntimeHost;
            fHost.focus();
            entry.runtime.webContents.send(IPC.PLUGIN_ENTER, {
                pluginId: entry.runtime.info.pluginId,
                featureCode,
            });
            return;
        }

        entry.runtime.host = host;
        host.attach(entry.runtime, entry.runtime.webContentsView);
        entry.runtime.info.mountState = 'attached';

        // 只有挂载到主窗口时才通知主窗口 UI 切换状态
        // 挂载到浮动窗口时，主窗口保持搜索态
        if (host.type === 'launcher') {
            const win = this.windowManager.getWindow();
            if (win && !win.isDestroyed()) {
                let pluginName = entry.runtime.pluginName;
                let featureExplain = '';
                const plugin = this.pluginManager.get(entry.runtime.info.pluginId);
                if (plugin) {
                    const feature = plugin.manifest.features[0];
                    if (feature) {
                        pluginName = feature.explain || plugin.id;
                        featureExplain = feature.explain || '';
                    }
                }
                win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                    runtimeId: entry.runtime.info.id,
                    pluginId: entry.runtime.info.pluginId,
                    pluginName,
                    featureExplain,
                    state: 'attached',
                    mountState: 'attached',
                    loadState: entry.runtime.info.loadState,
                });
            }
        }

        // 通知插件进入，携带 featureCode
        entry.runtime.webContents.send(IPC.PLUGIN_ENTER, {
            pluginId: entry.runtime.info.pluginId,
            featureCode,
        });
    }

    /** 从 Host 分离插件 */
    detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        const host = entry.runtime.host;
        if (host) {
            host.detach(entry.runtime);
        }
        entry.runtime.host = null;

        this.transitionMountState(runtimeId, 'detached', reason);
    }

    /** 切换浮动窗口置顶 */
    pinPluginWindow(runtimeId: string, pin: boolean): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        if (entry.runtime.host instanceof FloatingRuntimeHost) {
            entry.runtime.host.setAlwaysOnTop(pin);
        }
    }

    /** 获取或创建 Runtime — 先查找已有实例，没有再创建 */
    getOrCreate(pluginId: string): PluginRuntime | null {
        const existing = Array.from(this.entries.values())
            .find(e => e.runtime.info.pluginId === pluginId);
        if (existing)
            return existing.runtime;
        return this.create(pluginId);
    }

    /** 获取单个 Runtime */
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
        entry.runtime.webContents.close();
        this.entries.delete(runtimeId);
    }
}
