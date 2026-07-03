import type { LoadState, MountState, PluginRuntime, PluginSearchContext, SearchRequest } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { WindowManager } from '../window/window-manager';
import { join } from 'node:path';
import { IPC } from '@szybko/shared';
import { app, WebContentsView } from 'electron';
import { FloatingRuntimeHost } from '../window/hosts/floating-runtime-host';

interface RuntimeEntry {
    runtime: PluginRuntime;
    view: WebContentsView;
    loadState: LoadState;
    mountState: MountState;
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

        const runtime: PluginRuntime = {
            id: `${pluginId}-${this.nextInstanceId++}`,
            pluginId,
            instanceId: String(this.nextInstanceId),
            host: null,
            state: 'created',
            cache: new Map(),
        };

        this.entries.set(runtime.id, { runtime, view, loadState: 'loading', mountState: 'detached' });

        view.webContents.on('did-finish-load', () => {
            runtime.state = 'activated';
            this.transitionLoadState(runtime.id, 'loaded');
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
            if (entry.runtime.state === 'created' || entry.runtime.state === 'activated' || entry.runtime.state === 'attached') {
                const ctx: PluginSearchContext = {
                    queryId: req.queryId,
                    keyword: req.query.split(/\s+/)[0] || '',
                    query: req.query,
                    fullQuery: req.query,
                };
                entry.view.webContents.send(IPC.PLUGIN_SEARCH, ctx);
            }
        }
    }

    get runtimeCount(): number {
        return this.entries.size;
    }

    // ── State transitions ──────────────────────────────────────────

    private transitionLoadState(runtimeId: string, target: LoadState): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) return;
        entry.loadState = target;
    }

    private transitionMountState(runtimeId: string, target: MountState, reason?: 'hide' | 'destroy'): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) return;
        entry.mountState = target;

        // 查询插件显示信息
        let pluginName = entry.runtime.pluginId;
        let featureExplain = '';
        const plugin = this.pluginManager.get(entry.runtime.pluginId);
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
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
                pluginName,
                featureExplain,
                state: target,
                mountState: target,
                loadState: entry.loadState,
            });
        }

        // detach 带原因时，通知插件
        if (target === 'detached' && reason) {
            entry.view.webContents.send(IPC.PLUGIN_OUT, {
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
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

        // 单例模式：已在浮动窗口中 → 聚焦窗口，不操作主窗口
        if (entry.runtime.host?.type === 'floating') {
            const fHost = entry.runtime.host as FloatingRuntimeHost;
            fHost.focus();
            entry.view.webContents.send(IPC.PLUGIN_ENTER, {
                pluginId: entry.runtime.pluginId,
                featureCode,
            });
            return;
        }

        host.attach(entry.runtime, entry.view);
        this.transitionMountState(runtimeId, 'attached');

        // 通知插件进入，携带 featureCode
        entry.view.webContents.send(IPC.PLUGIN_ENTER, {
            pluginId: entry.runtime.pluginId,
            featureCode,
        });
    }

    /** @deprecated Use attachToHost(host) instead — kept for external callers */
    attachToWindow(runtimeId: string, featureCode?: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToWindow: runtime ${runtimeId} not found`);
            return;
        }

        // 已在浮动窗口中 → 委托给 attachToHost
        if (entry.runtime.host?.type === 'floating') {
            this.attachToHost(runtimeId, entry.runtime.host as RuntimeHost, featureCode);
            return;
        }

        const host = this.windowManager.getHostRegistry()?.getOrCreateLauncherHost();
        if (host) {
            this.attachToHost(runtimeId, host, featureCode);
        }
    }

    /** 从 Host 分离插件 */
    detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) return;

        const host = entry.runtime.host;
        if (host) {
            (host as RuntimeHost).detach(entry.runtime);
        }

        this.transitionMountState(runtimeId, 'detached', reason);
    }

    /** @deprecated Use detachFromHost(reason?) instead — kept for external callers */
    detachFromWindow(runtimeId: string): void {
        this.detachFromHost(runtimeId);
    }

    /** 销毁插件：销毁 Runtime 和 WebContentsView */
    destroyFromWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        // 如果已在浮动窗口，让 host 关闭窗口
        if (entry.runtime.host instanceof FloatingRuntimeHost) {
            entry.runtime.host.detach(entry.runtime);
            entry.view.webContents.close();
            this.entries.delete(runtimeId);
            return;
        }

        this.detachFromHost(runtimeId, 'destroy');
        entry.view.webContents.close();
        this.entries.delete(runtimeId);
    }

    /** 分离到独立窗口 */
    detachToFloatingWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        // 通知渲染进程（先于视图移动，让 UI 及时切换回搜索）
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
                state: 'detached',
            });
        }

        // 从主窗口移除
        const launcherHost = this.windowManager.getHostRegistry()?.getOrCreateLauncherHost();
        if (launcherHost) {
            launcherHost.detach(entry.runtime);
        }

        // 查询插件信息
        const pluginId = entry.runtime.pluginId;
        let pluginName = pluginId;
        let explain = '';
        const pluginInfo = this.pluginManager.get(pluginId);
        if (pluginInfo) {
            const feature = pluginInfo.manifest.features[0];
            if (feature) {
                pluginName = feature.explain || pluginInfo.id;
                explain = feature.explain || '';
            }
        }

        // 创建浮动窗口并迁移视图
        const host = new FloatingRuntimeHost(`floating-${Date.now()}`);
        host.createWindow(pluginName, entry.runtime.id, pluginId, explain);
        host.attach(entry.runtime, entry.view);
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
            .find(e => e.runtime.pluginId === pluginId);
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

    /** 销毁 Runtime（内部逻辑与 destroyFromWindow 一致，但不操作窗口） */
    destroy(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) return;
        entry.view.webContents.close();
        this.entries.delete(runtimeId);
        // Phase 2 Coordinator 会在 destroy 前先 detachFromHost
    }
}
