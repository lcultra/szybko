import { IPC } from '@szybko/shared';
import { on } from './ipc';

/**
 * 插件生命周期事件（插件侧）。
 * 宿主 → 插件 的通信协议：进入插件模式、退出插件模式。
 * 运行时状态变更（onRuntimeStateChanged）是宿主管道的关注点，不在插件侧暴露。
 */
export function createPluginLifecycleApi() {
    return {
        /** 用户选中插件 feature，插件进入自身 UI 模式 */
        onPluginEnter: on(IPC.PLUGIN_ENTER),

        /** 宿主通知插件被隐藏或销毁 */
        onPluginOut: on(IPC.PLUGIN_OUT),
    };
}
