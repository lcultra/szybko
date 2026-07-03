export interface NativeCapabilityService {
    openPath(path: string): Promise<void>;
    openUrl(url: string): Promise<void>;
    writeClipboard(text: string): Promise<void>;
    launchApp(bundleId: string): Promise<void>;
}
