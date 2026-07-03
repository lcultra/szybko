import { EllipsisVertical, X } from 'lucide-react';
import { useCallback } from 'react';
import { useAppStore } from '../stores/app-store.js';

export function PluginHeader() {
    const pluginName = useAppStore(s => s.activePluginName);
    const featureExplain = useAppStore(s => s.activeFeatureExplain);
    const activeRuntimeId = useAppStore(s => s.activeRuntimeId);
    const clearActivePlugin = useAppStore(s => s.setActivePlugin);

    const handleClose = useCallback(() => {
        if (activeRuntimeId)
            window.szybkoInternal?.hidePlugin(activeRuntimeId);
        clearActivePlugin(null);
    }, [activeRuntimeId, clearActivePlugin]);

    const handleMenu = useCallback(() => {
        if (activeRuntimeId)
            window.szybkoInternal?.showPluginMenu(activeRuntimeId);
    }, [activeRuntimeId]);

    return (
        <header className="flex h-[68px] shrink-0 items-center gap-2 border-b border-border px-3">
            {/* 左侧：插件信息徽章 */}
            <div className="flex items-center overflow-hidden rounded-full border border-border bg-surface-hover text-sm">
                <div className="flex items-center gap-2 py-1.5 pl-3 pr-2 select-none">
                    <span className="font-semibold text-text">{pluginName}</span>
                    {featureExplain && (
                        <>
                            <span className="text-text-muted">/</span>
                            <span className="text-text-muted">{featureExplain}</span>
                        </>
                    )}
                </div>
                <button
                    className="grid size-8 cursor-pointer place-items-center border-l border-border text-text-muted outline-none transition-colors hover:bg-danger/10 hover:text-danger"
                    onClick={handleClose}
                    title="关闭 (Esc)"
                    type="button"
                >
                    <X size={16} strokeWidth={2} />
                </button>
            </div>

            {/* 中间：拖拽区 */}
            <div
                className="min-w-0 flex-1 self-stretch cursor-grab active:cursor-grabbing"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />

            {/* 右侧：原生菜单按钮 */}
            <button
                className="grid size-8 cursor-pointer place-items-center rounded-full border border-border text-text-muted outline-none transition-colors hover:bg-surface-card/80 hover:text-text"
                onClick={handleMenu}
                title="更多操作"
                type="button"
            >
                <EllipsisVertical size={16} strokeWidth={2} />
            </button>
        </header>
    );
}
