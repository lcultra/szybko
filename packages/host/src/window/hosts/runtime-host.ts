import type { WebContentsView } from 'electron';
import type { PluginRuntime } from '../../runtime/types';

/**
 * Runtime 的显示挂载点接口。
 * @param view — 可选，调用方传入 view 引用；host 也可通过 runtime.webContentsView 获取
 */
export interface RuntimeHost {
    readonly id: string;
    readonly type: 'launcher' | 'floating';
    attach: (runtime: PluginRuntime, view?: WebContentsView) => void;
    detach: (runtime: PluginRuntime) => void;
}
