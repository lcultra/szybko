import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { DynamicFeatureService } from '../../app/commands/dynamic-feature-service';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerDynamicFeatureIpcHandlers(deps: {
    dynamicFeature: DynamicFeatureService;
    resolvePluginId: (webContentsId: number) => string | null;
}): void {
    ipcMain.handle(
        IPC.FEATURE_SET,
        async (event, { feature }: IpcRequest<typeof IPC.FEATURE_SET>): Promise<IpcResponse<typeof IPC.FEATURE_SET>> => {
            const result = await deps.dynamicFeature.setFeature(event.sender.id, feature);
            return result;
        },
    );

    ipcMain.handle(
        IPC.FEATURE_GET,
        (event, { codes }: IpcRequest<typeof IPC.FEATURE_GET>): IpcResponse<typeof IPC.FEATURE_GET> => {
            const pluginId = deps.resolvePluginId(event.sender.id);
            if (!pluginId) return { ok: false, features: [], error: 'Plugin runtime not found' };
            const features = deps.dynamicFeature.getFeatures(pluginId, codes);
            return { ok: true, features };
        },
    );

    ipcMain.handle(
        IPC.FEATURE_REMOVE,
        (event, { code }: IpcRequest<typeof IPC.FEATURE_REMOVE>): IpcResponse<typeof IPC.FEATURE_REMOVE> => {
            const pluginId = deps.resolvePluginId(event.sender.id);
            if (!pluginId) return { ok: false, error: 'Plugin runtime not found' };
            return deps.dynamicFeature.removeFeature(pluginId, code);
        },
    );
}
