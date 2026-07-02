import { useAppStore } from '../stores/app-store.js';

export function PluginHeader() {
    const pluginName = useAppStore(s => s.activePluginName);
    const featureExplain = useAppStore(s => s.activeFeatureExplain);
    const clearActivePlugin = useAppStore(s => s.setActivePlugin);

    return (
        <div
            className="flex h-[68px] cursor-default items-center px-4"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            {/* 左侧：返回按钮 */}
            <button
                className="text-text/60 hover:bg-surface-hover hover:text-text mr-3 flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                onClick={() => clearActivePlugin(null)}
                title="返回 (Esc)"
            >
                ←
            </button>

            {/* 中间：插件信息 */}
            <div className="flex flex-1 items-center gap-2 overflow-hidden">
                <span className="text-text truncate text-sm font-medium">
                    {pluginName}
                </span>
                {featureExplain && (
                    <>
                        <span className="text-text/30">·</span>
                        <span className="text-text/60 truncate text-sm">
                            {featureExplain}
                        </span>
                    </>
                )}
            </div>

            {/* 右侧：操作按钮 */}
            <div className="flex items-center gap-1">
                <button
                    className="text-text/40 hover:bg-surface-hover hover:text-text flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    title="分离到独立窗口"
                >
                    ⊞
                </button>
                <button
                    className="text-text/40 hover:bg-surface-hover hover:text-text flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                    onClick={() => clearActivePlugin(null)}
                    title="关闭 (Esc)"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
