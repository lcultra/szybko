import type { RuntimeInfo } from '@szybko/shared';
import type { WebContents, WebContentsView } from 'electron';

/** 插件激活上下文——每次进入时的动态参数 */
export interface ActivationContext {
    featureCode: string;
    featureExplain?: string;
    keyword?: string;
    query?: string;
}

/** 主进程内部的完整 Runtime 表示 */
export interface PluginRuntime {
    info: RuntimeInfo;
    webContentsView: WebContentsView;
    webContents: WebContents;
    cache: Map<string, any>;
    cmdLabel: string;
    currentActivation?: ActivationContext;
}
