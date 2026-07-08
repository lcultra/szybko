import type { PluginInfo } from '../plugin-catalog';
import { PluginInstallationRepository } from '../../sqlite/repositories/plugin-installation-repository';

/**
 * InstallationSynchronizer — 同步磁盘发现的插件与 DB 安装记录。
 * 遵循用户偏好：不自动启用已禁用插件，不因磁盘缺失自动禁用。
 */
export class InstallationSynchronizer {
    constructor(private repos: PluginInstallationRepository) {}

    /**
     * 同步磁盘发现结果到 DB。
     * - 新插件（DB 无记录）→ register
     * - 已有（不论 enabled/disabled）→ 不动，尊重用户状态
     */
    sync(discovered: PluginInfo[]): void {
        const now = Date.now();
        for (const plugin of discovered) {
            if (!this.repos.has(plugin.id)) {
                this.repos.register(plugin.id, 'built-in', plugin.path, now);
            }
        }
    }
}
