import type { LoadState, MountState } from '@szybko/shared';
import type { WindowManager } from '../../presentation/window/window-manager';
import type { PluginCatalog } from '../filesystem/plugin-catalog';
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
        const iconUrl = resolveIconUrl(plugin?.manifest, pluginId, feature?.code);

        win.webContents.send(IPC.PLUGIN_RUNTIME_STATE, {
            runtimeId,
            pluginId,
            featureExplain,
            cmdLabel,
            state: mountState,
            mountState,
            loadState,
            iconUrl,
        });
    }
}

/**
 * 根据 manifest 和 feature 构建插件图标的 asset:// URL。
 */
function resolveIconUrl(
    manifest: { logo: string; features: { code: string; icon?: string }[] } | undefined,
    pluginId: string,
    featureCode?: string,
): string | undefined {
    if (!manifest)
        return undefined;
    const feature = featureCode
        ? manifest.features.find(f => f.code === featureCode)
        : undefined;
    const iconPath = feature?.icon ?? manifest.logo;
    if (!iconPath)
        return undefined;
    const encoded = iconPath.split('/').map(encodeURIComponent).join('/');
    return `asset://plugin/${encodeURIComponent(pluginId)}/${encoded}`;
}
