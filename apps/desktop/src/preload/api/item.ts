import { IPC } from '@szybko/shared';
import { invoke } from './ipc';

/**
 * Item 交互 API。
 * pin / reorder / contextmenu / execute 都基于 LauncherItemId，不碰 provider 内部细节。
 * 所有方法参数均为 IPC contract request payload 结构。
 */
export function createItemApi() {
    return {
        /** 固定/取消固定一个 item */
        pinItem: invoke(IPC.ITEM_PIN),
        /** 拖拽排序（固定区） */
        reorderItem: invoke(IPC.ITEM_REORDER),
        /** 触发右键菜单 */
        openContextMenu: invoke(IPC.ITEM_CONTEXT_MENU),
        /** 执行 item（main 侧从 session 解析 action） */
        execute: invoke(IPC.ITEM_EXECUTE),
    };
}
