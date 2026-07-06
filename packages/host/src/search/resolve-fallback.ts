import type { LauncherItem, LauncherItemId } from '@szybko/shared';

/**
 * 当 session 中没有 item 时，从 LauncherItemId 推断基本信息。
 * 这保证了 pinned/recent section 在空查询时也能展示。
 */
export function fallbackItemFromId(itemId: LauncherItemId): LauncherItem | null {
    if (itemId.startsWith('plugin://')) {
        const parts = itemId.replace('plugin://', '').split('/');
        const cmdKey = parts[parts.length - 1] ?? '未知命令';
        const pluginId = parts[0] ?? '未知插件';
        return {
            id: itemId,
            ownerProvider: 'plugin',
            title: cmdKey,
            subtitle: pluginId,
            score: 0,
            capabilities: { pin: true, reveal: false, dragSort: true, contextMenu: true },
            state: { pinned: true },
        };
    }

    if (itemId.startsWith('app://')) {
        const bundleId = itemId.replace('app://', '');
        return {
            id: itemId,
            ownerProvider: 'app',
            title: bundleId,
            score: 0,
            capabilities: { pin: true, reveal: true, dragSort: false, contextMenu: true },
            state: { pinned: true },
        };
    }

    if (itemId.startsWith('file://')) {
        const path = itemId.replace('file://', '');
        const name = path.split('/').pop() ?? path;
        return {
            id: itemId,
            ownerProvider: 'file',
            title: name,
            subtitle: path,
            score: 0,
            capabilities: { pin: true, reveal: true, dragSort: false, contextMenu: true },
            state: { pinned: true },
        };
    }

    if (itemId.startsWith('url://')) {
        return {
            id: itemId,
            ownerProvider: 'url',
            title: itemId.replace('url://', ''),
            score: 0,
            capabilities: { pin: true, reveal: false, dragSort: false, contextMenu: true },
            state: { pinned: true },
        };
    }

    return null;
}
