/**
 * Host 挂载时需要的元信息 — 替代完整的 PluginRuntime。
 */
export interface HostMeta {
    runtimeId: string;
    pluginId: string;
    pluginName?: string;
    featureExplain: string;
    cmdLabel?: string;
    iconUrl?: string;
}

/**
 * Runtime 的显示挂载点接口。
 * Host 只处理 view 挂载和能力发布，不引用 PluginRuntime。
 * view 参数用 unknown 保持 domain 层无 Electron 依赖，具体实现层做类型断言。
 */
export interface RuntimeHost {
    readonly id: string;
    readonly type: 'launcher' | 'floating';
    attach: (view: unknown, meta: HostMeta) => void;
    detach: () => void;
}
