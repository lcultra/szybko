import type { UserConfig as ViteUserConfig } from 'vite';

export interface PluginConfig {
    /** preload 入口文件路径（相对插件根目录） */
    preload: string;
    /** renderer 根目录路径（相对插件根目录，有则构建 React SPA） */
    renderer?: string;
    /** 扩展内置 vite 配置 */
    vite?: {
        preload?: ViteUserConfig;
        renderer?: ViteUserConfig;
    };
}

export function defineConfig(config: PluginConfig): PluginConfig {
    return config;
}

export type { ViteUserConfig };
