export interface HostPlatform {
    start: () => Promise<void>;
    show: () => void;
    dispose: () => void;
}
