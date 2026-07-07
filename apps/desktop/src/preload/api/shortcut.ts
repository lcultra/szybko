import { IPC } from '@szybko/shared';
import { invoke } from './ipc';

export function createShortcutApi() {
    return {
        /** 获取指定作用域的快捷键定义列表 */
        getShortcutDefs: invoke(IPC.SHORTCUT_GET_DEFS),
    };
}
