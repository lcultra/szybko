import type { PluginSearchContext, SearchResult } from '@szybko/shared';
import { IPC } from '@szybko/shared';
import { on, send } from './ipc';

/**
 * 插件生命周期事件。
 * 宿主 → 插件 的通信协议：运行时状态变化、搜索请求、进入插件模式。
 * plugin preload 全量使用，host preload 只使用 onRuntimeStateChanged。
 */
export function createPluginLifecycleApi() {
    return {
        /** 插件运行时状态变更通知（created → attached → detached → destroyed） */
        onRuntimeStateChanged: on(IPC.PLUGIN_RUNTIME_STATE),

        /**
         * 宿主向插件发起搜索请求。
         * 插件注册回调，在收到搜索查询时返回匹配的结果列表。
         * 结果通过 IPC.PLUGIN_SEARCH_RESULT 发送回宿主。
         *
         * 这个回调需要同步返回 SearchResult[]，因为 IPC send
         * 是异步非阻塞的，但 Electron 的 IPC 通道保证顺序。
         */
        onSearch: (cb: (ctx: PluginSearchContext) => SearchResult[]) => {
            const sendSearchResult = send(IPC.PLUGIN_SEARCH_RESULT);

            return on(IPC.PLUGIN_SEARCH)((ctx) => {
                const results = cb(ctx);
                sendSearchResult({
                    queryId: ctx.queryId,
                    batchSeq: 0,
                    source: 'plugin',
                    results,
                    isFinal: true,
                });
            });
        },

        /** 用户选中插件 feature，插件进入自身 UI 模式 */
        onPluginEnter: on(IPC.PLUGIN_ENTER),
    };
}
