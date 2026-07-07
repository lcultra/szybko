import type { LoadState, MountState } from '@szybko/shared';
import type { PluginCatalog } from '../plugins/plugin-catalog';
import type { WindowManager } from '../window/window-manager';
import { IPC } from '@szybko/shared';

/**
 * RuntimeStatePublisher — 向渲染进程发布插件 runtime 状态变更。
 */
export class RuntimeStatePublisher {
    constructor(
        private windowManager: WindowManager,
        private pluginManager: PluginCatalog,
    ) {}

    publish(runtimeId: string, pluginId: string, mountState: MountState, loadState: LoadState, cmdLabel?: string): void {
        const win = this.windowManager.getWindow();
        if (!win || win.isDestroyed())
            return;

        const plugin = this.pluginManager.get(pluginId);
        const feature = plugin?.manifest.features[0];
        const featureExplain = feature?.explain || pluginId;

        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId,
            pluginId,
            featureExplain,
            cmdLabel,
            state: mountState,
            mountState,
            loadState,
        });
    }
}
