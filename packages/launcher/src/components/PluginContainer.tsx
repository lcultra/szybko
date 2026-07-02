/**
 * 插件视图占位容器。
 *
 * 不渲染可见内容，仅预留空间以保持布局稳定。
 * WebContentsView 实际由主进程 WindowManager.updatePluginBounds() 定位，
 * 渲染进程不需要知道 View 的精确位置。
 */
export function PluginContainer() {
    return (
        <div className="w-full" style={{ height: '400px' }} />
    );
}
