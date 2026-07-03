import type { PluginRuntime, PluginSearchContext, SearchRequest, SearchResult } from '@szybko/shared';
import type { PluginManager } from '../plugins/plugin-manager';
import type { WindowManager } from '../window/window-manager';
import { join } from 'node:path';
import { IPC } from '@szybko/shared';
import { app, WebContentsView } from 'electron';
import { FloatingHost } from '../window/hosts/floating-host';

interface RuntimeEntry {
    runtime: PluginRuntime;
    view: WebContentsView;
}

export class RuntimeManager {
    private entries: Map<string, RuntimeEntry> = new Map();
    private nextInstanceId = 1;

    constructor(
        private pluginManager: PluginManager,
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

        this.entries.set(runtime.id, { runtime, view });

        view.webContents.on('did-finish-load', () => {
            runtime.state = 'activated';
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

    /** 匹配插件 features[].cmds，如果用户输入匹配某条命令就返回"打开插件"结果 */
    matchPluginFeatures(query: string): SearchResult[] {
        const results: SearchResult[] = [];
        const lower = query.trim().toLowerCase();
        if (!lower)
            return results;

        for (const plugin of this.pluginManager.getEnabled()) {
            for (const feature of plugin.manifest.features) {
                const match = (feature.cmds || []).some((cmd) => {
                    if (typeof cmd === 'string')
                        return cmd.toLowerCase() === lower;
                    return false;
                    // TODO: 后续支持 MatchCommand 类型（regex / over / files 等）
                });
                if (match) {
                    results.push({
                        id: `plugin-activate-${plugin.id}-${feature.code}`,
                        title: feature.explain || feature.code,
                        subtitle: `打开 ${plugin.id}`,
                        icon: feature.icon || '🧩',
                        group: '插件',
                        score: 90,
                        action: { type: 'plugin.open', payload: { pluginId: plugin.id, featureCode: feature.code } },
                    });
                }
            }
        }
        return results;
    }

    // ── Activation / Deactivation ───────────────────────────

    /** 激活插件：挂载 view 到窗口，通知 Launcher 和插件自身 */
    attachToWindow(runtimeId: string, featureCode?: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToWindow: runtime ${runtimeId} not found`);
            return;
        }

        // 单例模式：已在浮动窗口中 → 聚焦窗口，不操作主窗口
        if (entry.runtime.host?.type === 'floating') {
            const host = entry.runtime.host as FloatingHost;
            host.focus();
            entry.view.webContents.send(IPC.PLUGIN_ENTER, {
                pluginId: entry.runtime.pluginId,
                featureCode,
            });
            return;
        }

        this.windowManager.attachPluginView(entry.view);
        entry.runtime.state = 'attached';

        // 查询插件展示信息
        let pluginName = entry.runtime.pluginId;
        let featureExplain = '';
        const plugin = this.pluginManager.get(entry.runtime.pluginId);
        if (plugin) {
            const feature = plugin.manifest.features.find(f => f.code === featureCode);
            if (feature) {
                pluginName = feature.explain || plugin.id;
                featureExplain = feature.explain || '';
            }
        }

        // 通知渲染进程状态变更
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
                pluginName,
                featureExplain,
                state: 'attached',
            });
        }

        // 通知插件进入，携带 featureCode
        entry.view.webContents.send(IPC.PLUGIN_ENTER, {
            pluginId: entry.runtime.pluginId,
            featureCode,
        });
    }

    /** 隐藏插件：从窗口移除 view，保留 Runtime 状态 */
    detachFromWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        this.windowManager.detachPluginView();
        entry.runtime.state = 'detached';
        entry.runtime.host = null;

        // 通知渲染进程
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
                state: 'detached',
            });
        }
    }

    /** 销毁插件：销毁 Runtime 和 WebContentsView */
    destroyFromWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        // 如果已在浮动窗口，让 host 关闭窗口
        if (entry.runtime.host instanceof FloatingHost) {
            entry.runtime.host.detach(entry.runtime);
            entry.view.webContents.close();
            this.entries.delete(runtimeId);
            return;
        }

        this.detachFromWindow(runtimeId);
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
        this.windowManager.detachPluginView();
        entry.runtime.state = 'detached';
        entry.runtime.host = null;

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
        const host = new FloatingHost(`floating-${Date.now()}`);
        host.createWindow(pluginName, entry.runtime.id, pluginId, explain);
        host.attach(entry.runtime, entry.view);
    }

    /** 切换浮动窗口置顶 */
    pinPluginWindow(runtimeId: string, pin: boolean): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        if (entry.runtime.host instanceof FloatingHost) {
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
