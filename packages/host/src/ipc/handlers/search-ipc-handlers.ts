import type { IpcInvokeContract } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { ipcMain } from 'electron';
import type { SearchApplicationService } from '../../app/search/search-application-service';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerSearchIpcHandlers(deps: {
  searchService: SearchApplicationService;
}): void {
  ipcMain.handle(
    IPC.SEARCH_QUERY,
    async (_event, req: IpcRequest<typeof IPC.SEARCH_QUERY>): Promise<IpcResponse<typeof IPC.SEARCH_QUERY>> => {
      const result = await deps.searchService.query(req);
      return result;
    },
  );

  ipcMain.handle(
    IPC.SEARCH_CANCEL,
    (): IpcResponse<typeof IPC.SEARCH_CANCEL> => {
      deps.searchService.cancel();
      return { ok: true };
    },
  );
}
