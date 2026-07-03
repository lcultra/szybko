import { IPC } from '@szybko/shared';
import { on } from './ipc';

/**
 * 插件生命周期事件。
 * 宿主 → 插件 的通信协议：运行时状态变化、进入插件模式。
 * plugin preload 全量使用，host preload 只使用 onRuntimeStateChanged。
 */
export function createPluginLifecycleApi() {
    return {
        /** 插件运行时状态变更通知（created → attached → detached → destroyed） */
        onRuntimeStateChanged: on(IPC.PLUGIN_RUNTIME_STATE),

        /** 用户选中插件 feature，插件进入自身 UI 模式 */
        onPluginEnter: on(IPC.PLUGIN_ENTER),

        /** 宿主通知插件被隐藏或销毁 */
        onPluginOut: on(IPC.PLUGIN_OUT),
    };
}
