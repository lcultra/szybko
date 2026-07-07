import clsx from 'clsx';
import { EllipsisVertical, MapPinCheckInside, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useRuntimeStore } from '../../stores/runtime-store';

interface PluginHeaderProps {
    hostType?: 'launcher' | 'floating';
}

export function PluginHeader({ hostType = 'launcher' }: PluginHeaderProps) {
    const featureExplain = useRuntimeStore(s => s.slot.featureExplain);
    const cmdLabel = useRuntimeStore(s => s.slot.cmdLabel);
    const activeRuntimeId = useRuntimeStore(s => s.slot.runtimeId);
    const clearSlot = useRuntimeStore(s => s.clearSlot);
    const isFloating = hostType === 'floating';

    const handleClose = useCallback(() => {
        if (!activeRuntimeId) {
            clearSlot();
            return;
        }
        if (isFloating) {
            PluginRuntimeService.destroy(activeRuntimeId);
            window.close();
        }
        else {
            PluginRuntimeService.hide(activeRuntimeId);
            clearSlot();
        }
    }, [activeRuntimeId, clearSlot, isFloating]);

    const handleMenu = useCallback(() => {
        if (activeRuntimeId)
            PluginRuntimeService.showMenu(activeRuntimeId, hostType);
    }, [activeRuntimeId, hostType]);

    const [pinned, setPinned] = useState(false);
    // runtimeId 变化时重置 pin 状态（pool 复用切换插件）
    useEffect(() => {
        setPinned(false);
    }, [activeRuntimeId]);
    const handlePin = useCallback(() => {
        if (!activeRuntimeId)
            return;
        const next = !pinned;
        setPinned(next);
        PluginRuntimeService.pin(activeRuntimeId, next);
    }, [activeRuntimeId, pinned]);

    return (
        <header
            className={clsx(
                'flex h-header shrink-0 items-center gap-2',
                isFloating ? 'pr-3 pl-19.5' : 'px-3',
            )}
        >
            {/* 左侧：插件信息徽章 */}
            <div className="flex items-center overflow-hidden rounded-full border border-border bg-surface-hover text-sm">
                <div className="flex items-center gap-2 py-1.5 pr-2 pl-3 select-none">
                    <span className="font-semibold text-text">{featureExplain}</span>
                    {cmdLabel && (
                        <>
                            <span className="text-text-muted">/</span>
                            <span className="text-text-muted">{cmdLabel}</span>
                        </>
                    )}
                </div>
                <button
                    className="grid size-8 cursor-pointer place-items-center border-l border-border text-text-muted transition-colors outline-none hover:bg-danger/10 hover:text-danger"
                    onClick={handleClose}
                    title="关闭"
                    type="button"
                >
                    <X size={16} strokeWidth={2} />
                </button>
            </div>

            {/* 中间：拖拽区 */}
            <div
                className="min-w-0 flex-1 cursor-grab self-stretch active:cursor-grabbing"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            />

            {/* 右侧 */}
            {isFloating && (
                <button
                    className={`grid size-8 cursor-pointer place-items-center rounded-full border transition-colors outline-none hover:bg-surface-card/80 ${pinned ? 'border-primary text-primary' : 'border-border text-text-muted hover:text-text'}`}
                    onClick={handlePin}
                    title={pinned ? '取消置顶' : '置顶窗口'}
                    type="button"
                >
                    <MapPinCheckInside size={16} strokeWidth={2} />
                </button>
            )}
            <button
                className="grid size-8 cursor-pointer place-items-center rounded-full border border-border text-text-muted transition-colors outline-none hover:bg-surface-card/80 hover:text-text"
                onClick={handleMenu}
                title="更多操作"
                type="button"
            >
                <EllipsisVertical size={16} strokeWidth={2} />
            </button>
        </header>
    );
}
