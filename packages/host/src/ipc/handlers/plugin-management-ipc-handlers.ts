import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { PluginLifecycleService } from '../../app/plugins/plugin-lifecycle-service';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerPluginManagementIpcHandlers(deps: {
  pluginLifecycle: PluginLifecycleService;
}): void {
  ipcMain.handle(
    IPC.PLUGIN_SET_ENABLED,
    async (_event, { pluginId, enabled }: IpcRequest<typeof IPC.PLUGIN_SET_ENABLED>): Promise<IpcResponse<typeof IPC.PLUGIN_SET_ENABLED>> => {
      try {
        if (enabled) {
          await deps.pluginLifecycle.enablePlugin(pluginId);
        } else {
          await deps.pluginLifecycle.disablePlugin(pluginId);
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_UNINSTALL,
    async (_event, { pluginId }: IpcRequest<typeof IPC.PLUGIN_UNINSTALL>): Promise<IpcResponse<typeof IPC.PLUGIN_UNINSTALL>> => {
      try {
        await deps.pluginLifecycle.uninstallUserPlugin(pluginId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );
}
