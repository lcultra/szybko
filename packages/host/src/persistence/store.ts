import type { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';

export class Store<T extends object> {
    private low!: Low<T>;

    constructor(
        private filePath: string,
        private defaults: T,
    ) {}

    async init(): Promise<void> {
        this.low = await JSONFilePreset<T>(this.filePath, this.defaults);
    }

    get<K extends keyof T>(key: K): T[K] {
        return this.low.data[key];
    }

    set<K extends keyof T>(key: K, value: T[K]): void {
        this.low.data[key] = value;
        this.low.write().catch(() => {});
    }

    update<K extends keyof T>(key: K, fn: (val: T[K]) => T[K]): void {
        this.low.data[key] = fn(this.low.data[key]);
        this.low.write().catch(() => {});
    }

    delete<K extends keyof T>(key: K): void {
        delete this.low.data[key];
        this.low.write().catch(() => {});
    }

    all(): T {
        return this.low.data;
    }

    keys(): (keyof T)[] {
        return Object.keys(this.low.data) as (keyof T)[];
    }
}
