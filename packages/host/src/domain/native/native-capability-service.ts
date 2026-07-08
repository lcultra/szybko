/**
 * 原生能力端口 — domain 层定义的操作系统能力契约。
 * 具体实现（Electron、Tauri 等）在 infrastructure/ 层完成。
 */
export interface NativeCapabilityService {
    openPath: (path: string) => Promise<void>;
    openUrl: (url: string) => Promise<void>;
    writeClipboard: (text: string) => Promise<void>;
    launchApp: (bundleId: string) => Promise<void>;
}
