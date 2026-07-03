import type { Host } from '@szybko/shared';
import { LauncherRuntimeHost } from './hosts/launcher-runtime-host';
import { FloatingRuntimeHost } from './hosts/floating-runtime-host';

export class RuntimeHostRegistry {
    private hosts: Map<string, Host> = new Map();
    private launcherHost: LauncherRuntimeHost | null = null;

    getOrCreateLauncherHost(): LauncherRuntimeHost {
        if (!this.launcherHost) {
            this.launcherHost = new LauncherRuntimeHost(`launcher-host`);
            this.hosts.set(this.launcherHost.id, this.launcherHost);
        }
        return this.launcherHost;
    }

    createFloatingHost(): FloatingRuntimeHost {
        const host = new FloatingRuntimeHost(`floating-${Date.now()}`);
        this.hosts.set(host.id, host);
        return host;
    }

    registerHost(host: Host): void {
        this.hosts.set(host.id, host);
    }

    unregisterHost(hostId: string): void {
        this.hosts.delete(hostId);
    }

    getHost(hostId: string): Host | undefined {
        return this.hosts.get(hostId);
    }

    getAllHosts(): Host[] {
        return Array.from(this.hosts.values());
    }
}
