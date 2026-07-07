import type { RuntimeHost } from './hosts/runtime-host';
import type { WindowManager } from './window-manager';
import { FloatingRuntimeHost } from './hosts/floating-runtime-host';
import { LauncherRuntimeHost } from './hosts/launcher-runtime-host';

export class RuntimeHostRegistry {
    private hosts: Map<string, RuntimeHost> = new Map();
    private launcherHost: LauncherRuntimeHost | null = null;
    private floatingPool: FloatingRuntimeHost[] = [];
    private static nextId = 0;
    private replenishing = false;

    constructor(
        private windowManager: WindowManager,
        private hostPreloadPath: string,
    ) {}

    getOrCreateLauncherHost(): LauncherRuntimeHost {
        if (!this.launcherHost) {
            this.launcherHost = new LauncherRuntimeHost(`launcher-host`, this.windowManager);
            this.hosts.set(this.launcherHost.id, this.launcherHost);
        }
        return this.launcherHost;
    }

    createFloatingHost(): FloatingRuntimeHost {
        const id = `floating-pool-${RuntimeHostRegistry.nextId++}`;
        const host = new FloatingRuntimeHost(id, this.hostPreloadPath);
        this.hosts.set(host.id, host);
        return host;
    }

    /** 从池中获取或新建一个浮动 host */
    acquireFloatingHost(): FloatingRuntimeHost {
        const host = this.floatingPool.pop() ?? this.createFloatingHost();
        this.scheduleReplenish();
        return host;
    }

    /** 归还浮动 host 到池（或池满时静默销毁） */
    releaseFloatingHost(host: FloatingRuntimeHost): void {
        if (this.floatingPool.length >= 2) {
            host.dispose();
            this.hosts.delete(host.id);
        } else {
            host.detach();
            this.floatingPool.push(host);
        }
    }

    /** 异步补充池到目标大小 2 */
    private scheduleReplenish(): void {
        if (this.replenishing) return;
        this.replenishing = true;
        setImmediate(() => {
            this.replenishing = false;
            while (this.floatingPool.length < 2) {
                const host = this.createFloatingHost();
                host.preloadWindow();
                this.floatingPool.push(host);
            }
        });
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
