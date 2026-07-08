import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { RuntimeApplicationService } from '../../app/runtime/ports';
import type { PluginId, RuntimeId } from '../../shared/ids';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerPluginRuntimeIpcHandlers(deps: {
  runtimeService: RuntimeApplicationService;
}): void {
  ipcMain.handle(
    IPC.PLUGIN_HIDE,
    (_event, { runtimeId }: IpcRequest<typeof IPC.PLUGIN_HIDE>): IpcResponse<typeof IPC.PLUGIN_HIDE> => {
      deps.runtimeService.hideRuntime(runtimeId as RuntimeId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_DESTROY,
    (_event, { runtimeId }: IpcRequest<typeof IPC.PLUGIN_DESTROY>): IpcResponse<typeof IPC.PLUGIN_DESTROY> => {
      deps.runtimeService.destroyRuntime(runtimeId as RuntimeId);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_PIN,
    (_event, { runtimeId, pin }: IpcRequest<typeof IPC.PLUGIN_PIN>): IpcResponse<typeof IPC.PLUGIN_PIN> => {
      deps.runtimeService.pinRuntime(runtimeId as RuntimeId, pin);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.HOST_SWITCH,
    (_event, { runtimeId, targetHost }: IpcRequest<typeof IPC.HOST_SWITCH>): IpcResponse<typeof IPC.HOST_SWITCH> => {
      try {
        deps.runtimeService.moveToHost(runtimeId as RuntimeId, targetHost);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );

  ipcMain.handle(
    IPC.SHOW_PLUGIN_MENU,
    (_event, { runtimeId, variant }: IpcRequest<typeof IPC.SHOW_PLUGIN_MENU>): IpcResponse<typeof IPC.SHOW_PLUGIN_MENU> => {
      deps.runtimeService.showPluginMenu(runtimeId as RuntimeId, variant);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.PLUGIN_EXEC,
    async (_event, { action }: IpcRequest<typeof IPC.PLUGIN_EXEC>): Promise<IpcResponse<typeof IPC.PLUGIN_EXEC>> => {
      if (action.type === 'plugin.open') {
        deps.runtimeService.activatePlugin(action.payload.pluginId as PluginId, action.payload.featureCode);
        return { ok: true };
      }
      return { ok: false, error: 'Unknown action type' };
    },
  );
}
