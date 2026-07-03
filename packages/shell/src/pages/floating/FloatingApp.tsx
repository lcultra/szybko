import { PluginScene } from '../../plugin/PluginScene.js';

const params = new URLSearchParams(window.location.search);
const pluginName = params.get('name') || '插件';
const runtimeId = params.get('runtimeId') || '';
const pluginId = params.get('pluginId') || '';

export function FloatingApp() {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-surface">
            {/* 浮动窗口头部 */}
            <header className="flex h-12 shrink-0 items-center border-b border-border px-3">
                <button
                    className="grid size-7 cursor-pointer place-items-center rounded-md text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    onClick={() => {
                        if (runtimeId) window.szybkoInternal?.destroyPlugin(runtimeId);
                        window.close();
                    }}
                    title="关闭"
                    type="button"
                >
                    ✕
                </button>
                <div
                    className="min-w-0 flex-1 self-stretch"
                    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                />
                <span className="pr-1 text-sm font-semibold text-text">{pluginName}</span>
            </header>
            {/* 插件视图占位 */}
            <div className="flex-1">
                <PluginScene />
            </div>
        </div>
    );
}
