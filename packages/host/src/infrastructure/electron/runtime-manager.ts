import type { LoadState, MountState, PluginEnterPayload } from '@szybko/shared';
import type { WebContents } from 'electron';
import type { PluginQuery } from '../../domain/plugins/plugin-query';
import type { RuntimeHost } from '../../domain/runtime/runtime-host';
import type { WindowManager } from '../../presentation/window/window-manager';
import type { PluginRuntime } from './types';
import { IPC } from '@szybko/shared';
import { isFocusable } from '../../presentation/runtime-hosts/capabilities';
import { RuntimeHostAttacher } from './runtime-host-attacher';
import { RuntimeStatePublisher } from './runtime-state-publisher';
import { RuntimeViewFactory } from './runtime-view-factory';

interface RuntimeEntry {
    runtime: PluginRuntime;
    /** dispose plugin-view keyboard shortcuts when runtime is destroyed */
    pluginViewShortcutDisposer?: () => void;
}

export class RuntimeManager {
    private entries: Map<string, RuntimeEntry> = new Map();
    private viewFactory: RuntimeViewFactory;
    private hostAttacher: RuntimeHostAttacher;
    private statePublisher: RuntimeStatePublisher;

    private pluginViewShortcutHandler:
        ((runtimeId: string, webContents: WebContents) => () => void) | null = null;

    /** 注入 PluginView 快捷键注册回调（在 coordinator 创建后调用） */
    setPluginViewShortcutHandler(
        fn: (runtimeId: string, webContents: WebContents) => () => void,
    ): void {
        this.pluginViewShortcutHandler = fn;
    }

    constructor(
        private pluginManager: PluginQuery,
        private windowManager: WindowManager,
        private pluginPreloadPath: string,
    ) {
        this.viewFactory = new RuntimeViewFactory(this.pluginPreloadPath);
        this.hostAttacher = new RuntimeHostAttacher();
        this.statePublisher = new RuntimeStatePublisher(this.windowManager, this.pluginManager);
    }

    // ── Lifecycle ────────────────────────────────────────────────────

    startAll(): void {
        for (const plugin of this.pluginManager.getEnabled()) {
            this.create(plugin.id);
        }
    }

    create(pluginId: string): PluginRuntime | null {
        const plugin = this.pluginManager.get(pluginId);
        if (!plugin)
            return null;

        const { view, runtimeId } = this.viewFactory.create(plugin);

        const runtime: PluginRuntime = {
            info: {
                id: runtimeId,
                pluginId,
                instanceId: runtimeId.split('-').pop() ?? '0',
                loadState: 'loading',
                mountState: 'detached',
                hostInfo: null,
            },
            webContentsView: view,
            webContents: view.webContents,
            cache: new Map(),
            cmdLabel: '',
        };

        // 通过 ShortcutRegistry 注册 PluginView 快捷键
        const entry: RuntimeEntry = { runtime };
        const disposer = this.pluginViewShortcutHandler?.(runtimeId, view.webContents);
        if (disposer) {
            entry.pluginViewShortcutDisposer = disposer;
        }
        this.entries.set(runtimeId, entry);

        view.webContents.on('did-finish-load', () => {
            this.transitionLoadState(runtimeId, 'loaded');
        });

        return runtime;
    }

    // ── Host tracking ────────────────────────────────────────────────

    /** 获取指定 runtime 当前挂载的 host */
    getHostFor(runtimeId: string): RuntimeHost | null {
        return this.hostAttacher.getHostFor(runtimeId);
    }

    /** 获取某个插件（首个匹配的 runtime）挂载的 host */
    getHostByPluginId(pluginId: string): RuntimeHost | null {
        for (const [id] of this.entries) {
            const host = this.hostAttacher.getHostFor(id);
            if (host && this.get(id)?.info.pluginId === pluginId)
                return host;
        }
        return null;
    }

    /** 将插件 view 挂载到指定 Host */
    attachToHost(runtimeId: string, host: RuntimeHost, featureCode?: string, enterPayload?: Partial<PluginEnterPayload>): void {
        const entry = this.entries.get(runtimeId);
        if (!entry) {
            console.warn(`[RuntimeManager] attachToHost: runtime ${runtimeId} not found`);
            return;
        }

        // 已在浮动窗口中 → 聚焦窗口，不挂载到新 host
        const existingHost = this.hostAttacher.getHostFor(runtimeId);
        if (existingHost?.type === 'floating' && isFocusable(existingHost)) {
            existingHost.focus();
            entry.runtime.webContents.send(IPC.PLUGIN_ENTER, enterPayload ?? {
                code: featureCode ?? entry.runtime.currentActivation?.featureCode ?? '',
                type: 'text',
                payload: null,
                from: 'main',
            });
            return;
        }

        const plugin = this.pluginManager.get(entry.runtime.info.pluginId);
        const featureExplain = plugin?.manifest.features[0]?.explain ?? '';
        // 只有在 execute 传入了 cmd label 时才更新 runtime 上的值
        // 避免 execute→setQuery('') 的竞态导致 match 没找到、cmdLabel 回退到 pluginId
        if (enterPayload?.option) {
            entry.runtime.cmdLabel = enterPayload.option;
        }
        const cmdLabel = entry.runtime.cmdLabel;

        // 构建图标 URL
        const feature = plugin?.manifest.features[0];
        const iconPath = feature?.icon ?? plugin?.manifest.logo;
        const iconUrl = plugin && iconPath
            ? `asset://plugin/${encodeURIComponent(plugin.id)}/${iconPath.split('/').map(encodeURIComponent).join('/')}`
            : undefined;

        this.hostAttacher.attach(runtimeId, host, entry.runtime.webContentsView, {
            runtimeId: entry.runtime.info.id,
            pluginId: entry.runtime.info.pluginId,
            pluginName: plugin?.manifest.name,
            featureExplain,
            cmdLabel,
            iconUrl,
        });

        entry.runtime.info.mountState = 'attached';
        entry.runtime.info.hostInfo = { id: host.id, type: host.type };

        // 只有挂载到主窗口时才通知主窗口 UI 切换状态
        if (host.type === 'launcher') {
            this.publishState(runtimeId, 'attached', entry.runtime.info.loadState, cmdLabel);
        }

        // 通知插件进入
        entry.runtime.webContents.send(IPC.PLUGIN_ENTER, enterPayload ?? {
            code: featureCode ?? entry.runtime.currentActivation?.featureCode ?? '',
            type: 'text',
            payload: null,
            from: 'main',
        });
    }

    /** 从 Host 分离插件 */
    detachFromHost(runtimeId: string, reason?: 'hide' | 'destroy'): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;

        this.hostAttacher.detach(runtimeId);

        entry.runtime.info.mountState = 'detached';
        entry.runtime.info.hostInfo = null;

        this.publishState(runtimeId, 'detached', entry.runtime.info.loadState);

        // detach 带原因时，通知插件
        if (reason) {
            entry.runtime.webContents.send(IPC.PLUGIN_OUT, {
                runtimeId: entry.runtime.info.id,
                pluginId: entry.runtime.info.pluginId,
                reason,
            });
        }
    }

    // ── Query ────────────────────────────────────────────────────────

    pluginIdForWebContents(webContentsId: number): string | null {
        for (const [, entry] of this.entries) {
            if (entry.runtime.webContents.id === webContentsId)
                return entry.runtime.info.pluginId;
        }
        return null;
    }

    get runtimeCount(): number {
        return this.entries.size;
    }

    /** 获取或创建 Runtime — 先查找已有实例，没有再创建 */
    getOrCreate(pluginId: string): PluginRuntime | null {
        const existing = this.getByPluginId(pluginId);
        if (existing)
            return existing;
        return this.create(pluginId);
    }

    /** 按 pluginId 查找已有 runtime（首个匹配） */
    getByPluginId(pluginId: string): PluginRuntime | undefined {
        for (const [, entry] of this.entries) {
            if (entry.runtime.info.pluginId === pluginId)
                return entry.runtime;
        }
        return undefined;
    }

    /** 按 runtimeId 获取 */
    get(runtimeId: string): PluginRuntime | undefined {
        return this.entries.get(runtimeId)?.runtime;
    }

    /** 获取所有 Runtime */
    getAll(): PluginRuntime[] {
        return Array.from(this.entries.values()).map(e => e.runtime);
    }

    /** 销毁 Runtime */
    destroy(runtimeId: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        // 先注销快捷键
        entry.pluginViewShortcutDisposer?.();
        this.hostAttacher.detach(runtimeId);
        entry.runtime.webContents.close();
        this.entries.delete(runtimeId);
    }

    // ── Internals ────────────────────────────────────────────────────

    private transitionLoadState(runtimeId: string, target: LoadState): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        entry.runtime.info.loadState = target;
    }

    private publishState(runtimeId: string, mountState: MountState, loadState: LoadState, cmdLabel?: string): void {
        const entry = this.entries.get(runtimeId);
        if (!entry)
            return;
        this.statePublisher.publish(runtimeId, entry.runtime.info.pluginId, mountState, loadState, cmdLabel);
    }
}
