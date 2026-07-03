import type { RuntimeHost } from './hosts/runtime-host';
import type { WindowManager } from './window-manager';
import { FloatingRuntimeHost } from './hosts/floating-runtime-host';
import { LauncherRuntimeHost } from './hosts/launcher-runtime-host';

export class RuntimeHostRegistry {
    private hosts: Map<string, RuntimeHost> = new Map();
    private launcherHost: LauncherRuntimeHost | null = null;

    constructor(
        private windowManager: WindowManager,
        private pluginPreloadPath: string,
    ) {}

    getOrCreateLauncherHost(): LauncherRuntimeHost {
        if (!this.launcherHost) {
            this.launcherHost = new LauncherRuntimeHost(`launcher-host`, this.windowManager);
            this.hosts.set(this.launcherHost.id, this.launcherHost);
        }
        return this.launcherHost;
    }

    createFloatingHost(): FloatingRuntimeHost {
        const host = new FloatingRuntimeHost(`floating-${Date.now()}`, this.pluginPreloadPath);
        this.hosts.set(host.id, host);
        return host;
    }

    registerHost(host: RuntimeHost): void {
        this.hosts.set(host.id, host);
    }

    unregisterHost(hostId: string): void {
        this.hosts.delete(hostId);
    }

    getHost(hostId: string): RuntimeHost | undefined {
        return this.hosts.get(hostId);
    }

    getAllHosts(): RuntimeHost[] {
        return Array.from(this.hosts.values());
    }
}
