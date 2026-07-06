import { IPC } from '@szybko/shared';
import { invoke, on } from './ipc';

/**
 * 搜索 API。
 * 新命名规约：
 * - search / searchCancel → IPC invoke
 * - onSearchResponse → IPC on（main → renderer 推送 SearchResponse）
 */
export function createSearchApi() {
    return {
        /** 发起搜索请求，返回 sessionId。结果通过 onSearchResponse 异步推送。 */
        search: invoke(IPC.SEARCH_QUERY),

        /** 取消正在进行的搜索 */
        searchCancel: invoke(IPC.SEARCH_CANCEL),

        /** 接收搜索结果快照（main → renderer），每次搜索产生多次（loading → partial → final） */
        onSearchResponse: on(IPC.SEARCH_RESPONSE),
    };
}
