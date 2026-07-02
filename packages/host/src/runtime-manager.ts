import type { PluginRuntime } from '@szybko/shared';
import type { PluginManager } from './plugin-manager.js';
import type { WindowManager } from './window-manager.js';
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
        view.webContents.loadFile(indexPath);
        return runtime;
    }

    sendPluginSearch(req: { queryId: string; query: string; timestamp: number }): void {
        for (const [, entry] of this.entries) {
            if (entry.runtime.state === 'created' || entry.runtime.state === 'attached') {
                entry.view.webContents.send(IPC.PLUGIN_SEARCH, {
                    queryId: req.queryId,
                    keyword: req.query.split(/\s+/)[0] || '',
                    query: req.query,
                    fullQuery: req.query,
                });
            }
        }
    }

    get runtimeCount(): number {
        return this.entries.size;
    }
}
