import type { PluginEnterPayload } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { PluginRuntime } from '../runtime/types';
import type { RuntimeHost } from '../window/hosts/runtime-host';
import type { FloatingRuntimeHost } from '../window/hosts/floating-runtime-host';
import type { RuntimeHostRegistry } from '../window/runtime-host-registry';
import type { RuntimeManager } from './runtime-manager';
import { Menu } from 'electron';
import { isClosable, isPinnable } from '../window/hosts/capabilities';

/**
 * RuntimeCoordinator — 所有业务流的统一入口。
 * IPC handlers 必须调用 coordinator 方法，不直接操作 RuntimeManager。
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
    activatePlugin(pluginId: string, featureCode?: string, enterPayload?: Partial<PluginEnterPayload>): void {
        const runtime = this.runtimeManager.getOrCreate(pluginId);
        if (!runtime)
            return;

        // Detach any runtime currently on the launcher host
        for (const r of this.runtimeManager.getAll()) {
            const host = this.runtimeManager.getHostFor(r.info.id);
            if (host?.type === 'launcher') {
                this.runtimeManager.detachFromHost(r.info.id);
            }
        }

        const host = this.hostRegistry.getOrCreateLauncherHost();
        this.runtimeManager.attachToHost(runtime.info.id, host, featureCode, enterPayload);
    }

    /**
     * Move a runtime from its current host to a target host type.
     */
    moveToHost(runtimeId: string, targetType: 'launcher' | 'floating'): void {
        const runtime = this.runtimeManager.get(runtimeId);
        if (!runtime)
            return;

        const currentHost = this.runtimeManager.getHostFor(runtimeId);
        if (currentHost) {
            this.runtimeManager.detachFromHost(runtimeId);

            // 从浮动移走 → 归还到池（不销毁）
            if (currentHost.type === 'floating') {
                this.hostRegistry.releaseFloatingHost(currentHost as FloatingRuntimeHost);
            }
        }

        const host = targetType === 'launcher'
            ? this.hostRegistry.getOrCreateLauncherHost()
            : this.hostRegistry.acquireFloatingHost();

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

        const host = this.runtimeManager.getHostFor(runtimeId);
        if (host && isClosable(host)) {
            // FloatingRuntimeHost — 先发插件销毁通知，再关窗
            this.runtimeManager.detachFromHost(runtimeId, 'destroy');
            host.close();
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
        const host = this.runtimeManager.getHostFor(runtimeId);
        if (host && host.type === 'floating' && isPinnable(host)) {
            host.setAlwaysOnTop(pin);
        }
    }

    /**
     * Show a native context menu for a plugin runtime.
     */
    showPluginMenu(runtimeId: string, variant?: 'launcher' | 'floating'): void {
        const isFloating = variant === 'floating';
        const items: Electron.MenuItemConstructorOptions[] = isFloating
            ? [
                    { label: '结束运行', click: () => { this.destroyRuntime(runtimeId); } },
                ]
            : [
                    { label: '分离为独立窗口', accelerator: 'CmdOrCtrl+D', click: () => { this.moveToHost(runtimeId, 'floating'); } },
                    { type: 'separator' },
                    { label: '结束运行', click: () => { this.destroyRuntime(runtimeId); } },
                ];

        const menu = Menu.buildFromTemplate(items);
        menu.popup();
    }

    // ── Utilities for IPC handlers ───────────────────────────────────

    /**
     * Get or create a runtime by plugin ID.
     */
    getOrCreateRuntime(pluginId: string): PluginRuntime | null {
        return this.runtimeManager.getOrCreate(pluginId);
    }

    /**
     * Get a runtime by runtime ID.
     */
    getRuntime(runtimeId: string): PluginRuntime | undefined {
        return this.runtimeManager.get(runtimeId);
    }

    /**
     * Look up a plugin ID by webContents ID.
     */
    pluginIdForWebContents(webContentsId: number): string | null {
        return this.runtimeManager.pluginIdForWebContents(webContentsId);
    }

    /**
     * Get the host a runtime is attached to, if any.
     */
    getHostFor(runtimeId: string): RuntimeHost | null {
        return this.runtimeManager.getHostFor(runtimeId);
    }
}
