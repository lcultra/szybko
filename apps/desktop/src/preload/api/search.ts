import { IPC } from '@szybko/shared';
import { invoke, on } from './ipc';

/**
 * 搜索 API。
 * 供 launcher 搜索栏使用：发起查询、取消查询、接收结果流。
 */
export function createSearchApi() {
    return {
        /** 发起搜索请求，结果通过 onSearchBatch 异步返回 */
        search: invoke(IPC.SEARCH_QUERY),

        /** 取消正在进行的搜索 */
        searchCancel: invoke(IPC.SEARCH_CANCEL),

        /** 接收搜索结果的批量推送（main → renderer），每次输入可能产生多批结果 */
        onSearchBatch: on(IPC.SEARCH_BATCH),
    };
}
