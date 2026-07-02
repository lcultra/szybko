import type { Host, PluginRuntime } from '@szybko/shared';
import type { PluginManager } from './plugin-manager.js';
import type { WindowManager } from './window-manager.js';
import { join } from 'node:path';
import { IPC } from '@szybko/shared';
import { WebContentsView } from 'electron';

export class RuntimeManager {
    private runtimes: Map<string, PluginRuntime> = new Map();
    private nextInstanceId = 1;

    constructor(
        private pluginManager: PluginManager,
        private windowManager: WindowManager,
        private pluginPreloadPath: string,
    ) {}

    create(pluginId: string): PluginRuntime {
        const plugin = this.pluginManager.get(pluginId);
        if (!plugin)
            throw new Error(`Plugin not found: ${pluginId}`);

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

        this.runtimes.set(runtime.id, runtime);
        const indexPath = join(plugin.path, plugin.manifest.main);
        view.webContents.loadFile(indexPath);
        return runtime;
    }

    get(pluginId: string): PluginRuntime | undefined {
        return Array.from(this.runtimes.values()).find(r => r.pluginId === pluginId);
    }

    getById(runtimeId: string): PluginRuntime | undefined {
        return this.runtimes.get(runtimeId);
    }

    attach(runtimeId: string, host: Host) {
        const runtime = this.runtimes.get(runtimeId);
        if (!runtime)
            return;
        runtime.state = 'attached';
        runtime.host = host;
        host.attach(runtime);
        this.notifyState(runtime);
    }

    detach(runtimeId: string) {
        const runtime = this.runtimes.get(runtimeId);
        if (!runtime?.host)
            return;
        runtime.host.detach(runtime);
        runtime.state = 'detached';
        runtime.host = null;
        this.notifyState(runtime);
    }

    destroy(runtimeId: string) {
        const runtime = this.runtimes.get(runtimeId);
        if (!runtime)
            return;
        runtime.state = 'destroyed';
        this.runtimes.delete(runtimeId);
        this.notifyState(runtime);
    }

    getByPluginId(pluginId: string): PluginRuntime[] {
        return Array.from(this.runtimes.values()).filter(r => r.pluginId === pluginId);
    }

    private notifyState(runtime: PluginRuntime) {
        const win = this.windowManager.getWindow();
        if (!win)
            return;
        win.webContents.send(IPC.RUNTIME_STATE_CHANGED, {
            runtimeId: runtime.id,
            pluginId: runtime.pluginId,
            state: runtime.state,
            hostId: runtime.host?.id,
        });
    }
}
