import type { IpcInvokeContract } from '@szybko/shared';
import type { LauncherItemService } from '../../app/search/launcher-item-service';
import type { SearchApplicationService } from '../../app/search/search-application-service';
import { IPC } from '@szybko/shared';
import { BrowserWindow, ipcMain, Menu } from 'electron';

type IpcRequest<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type IpcResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];

export function registerItemIpcHandlers(deps: {
    launcherItemService: LauncherItemService;
    searchService: SearchApplicationService;
    triggerRefresh: () => void;
}): void {
    ipcMain.handle(
        IPC.ITEM_PIN,
        async (
            _event,
            { itemId, pin }: IpcRequest<typeof IPC.ITEM_PIN>,
        ): Promise<IpcResponse<typeof IPC.ITEM_PIN>> => {
            if (pin) {
                await deps.launcherItemService.pinItem(itemId);
            }
            else {
                await deps.launcherItemService.unpinItem(itemId);
            }
            deps.triggerRefresh();
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.ITEM_REORDER,
        async (
            _event,
            { itemId, toIndex }: IpcRequest<typeof IPC.ITEM_REORDER>,
        ): Promise<IpcResponse<typeof IPC.ITEM_REORDER>> => {
            await deps.launcherItemService.reorderItem(itemId, toIndex);
            deps.triggerRefresh();
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.ITEM_CONTEXT_MENU,
        async (
            _event,
            req: IpcRequest<typeof IPC.ITEM_CONTEXT_MENU>,
        ): Promise<IpcResponse<typeof IPC.ITEM_CONTEXT_MENU>> => {
            const { itemId, screenX, screenY, source } = req;
            const isPinned = deps.launcherItemService.isPinned(itemId);

            const win = BrowserWindow.getFocusedWindow();
            if (!win)
                return { ok: false };

            const menuBuilder: Electron.MenuItemConstructorOptions[] = [
                {
                    label: isPinned ? '取消固定"搜索框"' : '固定到"搜索框"',
                    click: async () => {
                        if (isPinned) {
                            await deps.launcherItemService.unpinItem(itemId);
                        }
                        else {
                            await deps.launcherItemService.pinItem(itemId);
                        }
                        deps.triggerRefresh();
                    },
                },
            ];

            if (source === 'recent') {
                menuBuilder.push({
                    label: '从"使用记录"中删除',
                    click: async () => {
                        await deps.launcherItemService.removeRecentItem(itemId);
                        deps.triggerRefresh();
                    },
                });
            }

            const menu = Menu.buildFromTemplate(menuBuilder);
            menu.popup({ window: win, x: screenX, y: screenY });
            return { ok: true };
        },
    );

    ipcMain.handle(
        IPC.ITEM_EXECUTE,
        async (
            _event,
            req: IpcRequest<typeof IPC.ITEM_EXECUTE>,
        ): Promise<IpcResponse<typeof IPC.ITEM_EXECUTE>> => {
            const { sessionId, queryId, itemId } = req;
            const result = await deps.searchService.executeItem(sessionId, queryId, itemId);
            return result;
        },
    );
}
