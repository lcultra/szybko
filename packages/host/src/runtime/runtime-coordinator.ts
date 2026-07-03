import type { SearchRequest } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { PluginRuntime } from '../runtime/types';
import type { Closable } from '../window/hosts/capabilities';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { RuntimeHostRegistry } from '../window/runtime-host-registry';
import type { RuntimeManager } from './runtime-manager';
import { Menu } from 'electron';

/**
 * RuntimeCoordinator — the mandatory entry point for all business flows.
 * IPC handlers MUST call coordinator methods instead of RuntimeManager directly.
 */
export class RuntimeCoordinator {
    constructor(
        private runtimeManager: RuntimeManager,
        private hostRegistry: RuntimeHostRegistry,
        private pluginCatalog: PluginCatalog,
    ) {}

    // ── Business flow methods ────────────────────────────────────────

    /**
     * Activate a plugin: get or create its runtime, detach any active
     * runtime from the launcher host, then attach to the launcher.
     */
    activatePlugin(pluginId: string, featureCode?: string): void {
        const runtime = this.runtimeManager.getOrCreate(pluginId);
        if (!runtime)
            return;

        // Detach any runtime currently on the launcher host
        for (const r of this.runtimeManager.getAll()) {
            if (r.host?.type === 'launcher') {
                this.runtimeManager.detachFromHost(r.info.id);
            }
        }

        const host = this.hostRegistry.getOrCreateLauncherHost();
        this.runtimeManager.attachToHost(runtime.info.id, host, featureCode);
    }

    /**
     * Move a runtime from its current host to a target host type.
     * Verifies the runtime exists and has a host before detaching.
     */
    moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime)
            return;

        if (runtime.host) {
            this.runtimeManager.detachFromHost(runtimeId);
        }

        const host = targetType === 'launcher'
            ? this.hostRegistry.getOrCreateLauncherHost()
            : this.hostRegistry.createFloatingHost();

        this.runtimeManager.attachToHost(runtimeId, host);
    }

    /**
     * Hide a runtime by detaching it from its host with 'hide' reason.
     */
    hideRuntime(runtimeId: string): void {
        this.runtimeManager.detachFromHost(runtimeId, 'hide');
    }

    /**
     * Destroy a runtime: first detach from host (closing Closable hosts
     * like floating windows), then destroy the runtime itself.
     */
    destroyRuntime(runtimeId: string): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime)
            return;

        const host = runtime.host;
        if (host && 'close' in host) {
            // FloatingRuntimeHost — close window then destroy
            (host as RuntimeHost & Closable).close();
        }
        else if (host) {
            // LauncherRuntimeHost — detach with destroy reason (sends plugin:out)
            this.runtimeManager.detachFromHost(runtimeId, 'destroy');
        }

        this.runtimeManager.destroy(runtimeId);
    }

    /**
     * Pin or unpin a floating runtime window.
     */
    pinRuntime(runtimeId: string, pin: boolean): void {
        this.runtimeManager.pinPluginWindow(runtimeId, pin);
    }

    /**
     * Show a native context menu for a plugin runtime.
     * Uses Electron Menu and dispatches coordinator methods on click.
     */
    showPluginMenu(runtimeId: string, variant?: 'launcher' | 'floating'): void {
        const isFloating = variant === 'floating';
        const items: Electron.MenuItemConstructorOptions[] = isFloating
            ? [
                    {
                        label: '结束运行',
                        click: () => { this.destroyRuntime(runtimeId); },
                    },
                ]
            : [
                    {
                        label: '分离为独立窗口',
                        accelerator: 'CmdOrCtrl+D',
                        click: () => { this.moveToHost(runtimeId, 'floating'); },
                    },
                    { type: 'separator' },
                    {
                        label: '结束运行',
                        click: () => { this.destroyRuntime(runtimeId); },
                    },
                ];

        const menu = Menu.buildFromTemplate(items);
        menu.popup();
    }

    // ── Utilities for IPC handlers ───────────────────────────────────

    /**
     * Get or create a runtime by plugin ID. Used by handlers that
     * receive a pluginId rather than a runtimeId.
     */
    getOrCreateRuntime(pluginId: string): PluginRuntime | null {
        return this.runtimeManager.getOrCreate(pluginId);
    }

    /**
     * Forward a search query to all active plugin runtimes.
     */
    sendPluginSearch(req: SearchRequest): void {
        this.runtimeManager.sendPluginSearch(req);
    }
}
