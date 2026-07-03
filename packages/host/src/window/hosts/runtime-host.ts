import type { PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';

/**
 * Runtime 的显示挂载点接口。
 * @param view — 过渡参数，Phase 2 末改从 runtime.webContentsView 获取
 */
export interface RuntimeHost {
    readonly id: string;
    readonly type: 'launcher' | 'floating';
    attach(runtime: PluginRuntime, view?: WebContentsView): void;
    detach(runtime: PluginRuntime): void;
}
