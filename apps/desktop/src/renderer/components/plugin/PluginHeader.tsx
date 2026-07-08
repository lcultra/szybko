import clsx from 'clsx';
import { MapPin, MapPinCheckInside, Menu, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { PluginRuntimeService } from '../../services/plugin-runtime';
import { useRuntimeStore } from '../../stores/runtime-store';

interface PluginHeaderProps {
    hostType?: 'launcher' | 'floating';
}

export function PluginHeader({ hostType = 'launcher' }: PluginHeaderProps) {
    const pluginName = useRuntimeStore(s => s.slot.pluginName);
    const cmdLabel = useRuntimeStore(s => s.slot.cmdLabel);
    const iconUrl = useRuntimeStore(s => s.slot.iconUrl);
    const activeRuntimeId = useRuntimeStore(s => s.slot.runtimeId);
    const clearSlot = useRuntimeStore(s => s.clearSlot);
    const isFloating = hostType === 'floating';
    const [iconFailed, setIconFailed] = useState(false);
    const runtimeIdRef = useRef(activeRuntimeId);
    const [pinned, setPinned] = useState(false);
    // runtimeId 变化时重置 icon 与 pin 状态（pool 复用切换插件）
    if (runtimeIdRef.current !== activeRuntimeId) {
        runtimeIdRef.current = activeRuntimeId;
        setIconFailed(false);
        setPinned(false);
    }

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
                isFloating ? 'pr-3 pl-traffic-left' : 'px-3',
            )}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            {/* 左侧：插件信息徽章 */}
            <div className="flex min-w-0 max-w-[55%] items-center overflow-hidden rounded-full border border-border bg-surface-hover text-sm">
                <div className="flex min-w-0 items-center gap-1.5 py-1.5 pr-2 pl-3 select-none">
                    {iconUrl && !iconFailed && (
                        <img
                            alt=""
                            className="size-4 shrink-0 object-contain rounded-sm"
                            draggable={false}
                            onError={() => setIconFailed(true)}
                            src={iconUrl}
                        />
                    )}
                    <span className="truncate font-semibold text-text">{pluginName}</span>
                    {cmdLabel && (
                        <>
                            <span className="shrink-0 text-text-muted">/</span>
                            <span className="truncate font-semibold text-text">{cmdLabel}</span>
                        </>
                    )}
                </div>
                <button
                    className="grid size-8 cursor-pointer place-items-center border-l border-border text-text-muted transition-colors outline-none hover:bg-text/10 hover:text-text"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
            />

            {/* 右侧工具栏 — flat icons, hover 出圆形背景，置顶在最右 */}
            <div
                className="flex items-center"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <button
                    className="icon-btn"
                    onClick={handleMenu}
                    title="更多操作"
                    type="button"
                >
                    <Menu size={16} strokeWidth={2} />
                </button>
                {isFloating && (
                    <button
                        className={clsx('icon-btn', pinned && 'text-primary hover:bg-primary/10')}
                        onClick={handlePin}
                        title={pinned ? '取消置顶' : '置顶窗口'}
                        type="button"
                    >
                        {pinned
                            ? <MapPinCheckInside size={16} strokeWidth={2} />
                            : <MapPin size={16} strokeWidth={2} />}
                    </button>
                )}
            </div>
        </header>
    );
}
