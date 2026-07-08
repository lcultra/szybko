import type { SzybkoPluginApi } from '@szybko/shared';

export interface SzybkoPluginSDK extends SzybkoPluginApi {}

declare global {
    interface Window {
        szybko: SzybkoPluginSDK;
    }
}
