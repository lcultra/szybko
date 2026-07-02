import type { PluginRuntime, PluginSearchContext, SearchRequest } from '@szybko/shared';
import type { PluginManager } from '../plugins/plugin-manager.js';
import type { WindowManager } from '../window/window-manager.js';
import { join } from 'node:path';
import { IPC } from '@szybko/shared';
import { WebContentsView } from 'electron';

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

        const runtime: PluginRuntime = {
            id: `${pluginId}-${this.nextInstanceId++}`,
            pluginId,
            instanceId: String(this.nextInstanceId),
            host: null,
            state: 'created',
            cache: new Map(),
        };

        this.entries.set(runtime.id, { runtime, view });

        const indexPath = join(plugin.path, plugin.manifest.main);

        view.webContents.on('did-finish-load', () => {
            runtime.state = 'activated';
        });

        view.webContents.loadFile(indexPath);
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

    // ── Activation / Deactivation ───────────────────────────

    /** 激活插件：挂载 view 到窗口，通知 Launcher 和插件自身 */
    attachToWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToWindow: runtime ${runtimeId} not found`);
            return;
        }

        this.windowManager.attachPluginView(entry.view);
        entry.runtime.state = 'attached';

        // 通知渲染进程状态变更
        const win = this.windowManager.getWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
                runtimeId: entry.runtime.id,
                pluginId: entry.runtime.pluginId,
                state: 'attached',
            });
        }

        // 通知插件进入
        entry.view.webContents.send(IPC.PLUGIN_ENTER, { pluginId: entry.runtime.pluginId });
    }

    /** 分离插件：从窗口移除 view，保留 Runtime 状态 */
    detachFromWindow(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) return;

        this.windowManager.detachPluginView();
        entry.runtime.state = 'detached';
        entry.runtime.host = null;
    }

    /** 获取或创建 Runtime — 先查找已有实例，没有再创建 */
    getOrCreate(pluginId: string): PluginRuntime | null {
        const existing = Array.from(this.entries.values())
            .find(e => e.runtime.pluginId === pluginId);
        if (existing) return existing.runtime;
        return this.create(pluginId);
    }
}
