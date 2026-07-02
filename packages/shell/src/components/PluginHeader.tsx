import { EllipsisVertical, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../stores/app-store.js';

export function PluginHeader() {
    const pluginName = useAppStore(s => s.activePluginName);
    const featureExplain = useAppStore(s => s.activeFeatureExplain);
    const activeRuntimeId = useAppStore(s => s.activeRuntimeId);
    const clearActivePlugin = useAppStore(s => s.setActivePlugin);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const handleClose = useCallback(() => {
        if (activeRuntimeId) {
            window.szybkoInternal?.hidePlugin(activeRuntimeId);
        }
        clearActivePlugin(null);
    }, [activeRuntimeId, clearActivePlugin]);

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

            {/* 右侧：菜单按钮 */}
            <div className="relative">
                <button
                    className="grid size-8 cursor-pointer place-items-center rounded-full border border-border text-text-muted outline-none transition-colors hover:bg-surface-card/80 hover:text-text"
                    onClick={() => setShowMenu(v => !v)}
                    title="更多操作"
                    type="button"
                >
                    <EllipsisVertical size={16} strokeWidth={2} />
                </button>

                {/* 菜单下拉 */}
                {showMenu && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                        <div
                            ref={menuRef}
                            className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl border border-border bg-surface-card p-1 shadow-lg"
                        >
                            <button
                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
                                type="button"
                            >
                                ⊞ 分离为独立窗口
                            </button>
                            <div className="mx-2 border-t border-border" />
                            <button
                                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                                type="button"
                                onClick={handleClose}
                            >
                                结束运行
                            </button>
                        </div>
                    </>
                )}
            </div>
        </header>
    );
}
