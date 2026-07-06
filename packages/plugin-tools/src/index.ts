import type { UserConfig as ViteUserConfig } from 'vite';

const DEFAULT_PRELOAD = 'preload/index.ts';

export interface PluginConfig {
    /** preload 入口路径，默认 'preload/index.ts' */
    preload?: string;
    /** 设为 true 启用 React renderer（根目录为插件根目录） */
    renderer?: boolean;
    /** 扩展内置 vite 配置 */
    vite?: {
        preload?: ViteUserConfig;
        renderer?: ViteUserConfig;
    };
}

export function defineConfig(config: PluginConfig = {}): PluginConfig {
    return config;
}

export function resolvePreload(config: PluginConfig): string {
    return config.preload ?? DEFAULT_PRELOAD;
}

export function resolveRenderer(config: PluginConfig): string | undefined {
    if (!config.renderer)
        return undefined;
    // renderer: true → 以插件根目录为 vite root
    return '.';
}

export type { ViteUserConfig };
