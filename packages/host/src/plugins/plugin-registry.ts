import type { Store } from './store';

export type PluginSource = 'built-in' | 'user-installed';

export interface RegistryEntry {
    source: PluginSource;
    enabled: boolean;
    installedAt: string;
    path: string;
}

export interface RegistryData {
    plugins: Record<string, RegistryEntry>;
}

export class PluginRegistry {
    private cached: RegistryData | null = null;

    constructor(private store: Store<RegistryData>) {}

    async init(): Promise<void> {
        await this.store.init();
        this.cached = this.store.all();
    }

    get(): RegistryData {
        if (!this.cached) {
            this.cached = this.store.all();
        }
        return this.cached;
    }

    register(id: string, entry: RegistryEntry): void {
        const data = this.get();
        data.plugins[id] = entry;
        this.save(data);
    }

    unregister(id: string): boolean {
        const data = this.get();
        if (data.plugins[id]?.source === 'built-in')
            return false;
        delete data.plugins[id];
        this.save(data);
        return true;
    }

    has(id: string): boolean {
        return id in this.get().plugins;
    }

    isBuiltIn(id: string): boolean {
        return this.get().plugins[id]?.source === 'built-in';
    }

    isEnabled(id: string): boolean {
        return this.get().plugins[id]?.enabled ?? false;
    }

    setEnabled(id: string, enabled: boolean): void {
        const data = this.get();
        if (data.plugins[id]) {
            data.plugins[id].enabled = enabled;
            this.save(data);
        }
    }

    listEnabled(): string[] {
        return Object.entries(this.get().plugins)
            .filter(([, e]) => e.enabled)
            .map(([id]) => id);
    }

    pluginPath(id: string): string | undefined {
        return this.get().plugins[id]?.path;
    }

    private save(data: RegistryData): void {
        this.store.set('plugins', data.plugins);
        this.cached = data;
    }
}
