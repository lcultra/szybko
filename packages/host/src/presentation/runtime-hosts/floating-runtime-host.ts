import type { RuntimeSlot } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import type { Closable, Focusable, Pinnable } from './capabilities';
import type { HostMeta, RuntimeHost } from './runtime-host';
import { join } from 'node:path';
import process from 'node:process';
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, FLOATING_WINDOW_DEFAULT_HEIGHT, HEADER_HEIGHT, IPC, TRAFFIC_LIGHT_X, TRAFFIC_LIGHT_Y } from '@szybko/shared';
import { BrowserWindow } from 'electron';

export class FloatingRuntimeHost implements RuntimeHost, Focusable, Pinnable, Closable {
    id: string;
    type = 'floating' as const;
    private window: BrowserWindow | null = null;
    private view: WebContentsView | null = null;
    private currentMeta: HostMeta | null = null;
    private pendingSlot: RuntimeSlot | null = null;

    constructor(
        id: string,
        private hostPreloadPath: string,
    ) { this.id = id; }

    attach(view: unknown, meta: HostMeta): void {
        const webView = view as WebContentsView;
        this.currentMeta = meta;

        if (!this.window) {
            this.createWindow(meta); // 首次创建
        }
        else {
            this.pushSlotUpdate(meta); // 池复用 → IPC 更新 slot
        }

        if (webView) {
            this.view = webView;
            this.window!.contentView.addChildView(webView);
            this.relayout();
        }

        this.window!.show(); // show:false 的窗口在此显示
    }

    detach(): void {
        if (this.view && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.view);
        }
        this.view = null;
        this.setAlwaysOnTop(false); // 重置置顶
        this.pendingSlot = null; // 清除 pending slot
        this.window?.hide();
    }

    /** 预创建窗口（pool 补充用）：BrowserWindow 先建好，保持隐藏 */
    preloadWindow(): void {
        const placeholderMeta: HostMeta = {
            runtimeId: '',
            pluginId: '',
            featureExplain: '',
            cmdLabel: '',
        };
        this.createWindow(placeholderMeta);
    }

    /** 向浮动渲染器推送当前 slot（窗口已存在时更新标题栏信息） */
    private pushSlotUpdate(meta: HostMeta): void {
        const slot: RuntimeSlot = {
            runtimeId: meta.runtimeId,
            pluginId: meta.pluginId,
            pluginName: meta.pluginName,
            featureExplain: meta.featureExplain,
            cmdLabel: meta.cmdLabel ?? '',
            loadState: 'loaded',
            mountState: 'attached',
            iconUrl: meta.iconUrl,
        };
        this.pendingSlot = slot;
        if (this.window && !this.window.isDestroyed()) {
            this.window.webContents.send(IPC.FLOATING_SLOT_UPDATE, slot);
        }
    }

    /** 池 eviction 用：强制销毁，不触发 beforeunload */
    dispose(): void {
        if (this.window) {
            this.window.removeAllListeners();
            this.window.destroy(); // ← 不触发 beforeunload/close 事件
        }
        this.window = null;
        this.view = null;
        this.currentMeta = null;
        this.pendingSlot = null;
    }

    private createWindow(meta: HostMeta): void {
        this.window = new BrowserWindow({
            width: DEFAULT_WINDOW_WIDTH,
            height: FLOATING_WINDOW_DEFAULT_HEIGHT,
            frame: false,
            hasShadow: false,
            transparent: true,
            show: false,
            titleBarStyle: 'hidden',
            trafficLightPosition: {
                x: TRAFFIC_LIGHT_X,
                y: TRAFFIC_LIGHT_Y,
            },
            webPreferences: {
                preload: this.hostPreloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        // 窗口尺寸变化时重新布局子 view
        this.window.on('resize', this.relayout);
        this.window.on('maximize', this.relayout);
        this.window.on('unmaximize', this.relayout);

        // 全屏时交通灯移到菜单栏 → 取消左侧间距
        this.window.on('enter-full-screen', () => {
            void this.window?.webContents.executeJavaScript(
                'document.documentElement.style.setProperty("--traffic-left", "0.75rem")',
            );
        });
        this.window.on('leave-full-screen', () => {
            void this.window?.webContents.executeJavaScript(
                'document.documentElement.style.setProperty("--traffic-left", "19.5px")',
            );
        });

        // 页面加载完成时补发 pending slot（pool 复用场景）
        this.window.webContents.on('did-finish-load', () => {
            if (this.pendingSlot) {
                this.window!.webContents.send(IPC.FLOATING_SLOT_UPDATE, this.pendingSlot);
            }
        });

        const slot: RuntimeSlot = {
            runtimeId: meta.runtimeId,
            pluginId: meta.pluginId,
            pluginName: meta.pluginName,
            featureExplain: meta.featureExplain,
            cmdLabel: meta.cmdLabel ?? '',
            loadState: 'loaded',
            mountState: 'attached',
            iconUrl: meta.iconUrl,
        };

        const query = { slot: JSON.stringify(slot) };

        if (process.env.ELECTRON_RENDERER_URL) {
            const qs = new URLSearchParams(query).toString();
            void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')}/floating.html?${qs}`);
        }
        else {
            void this.window.loadFile(join(__dirname, '../renderer/floating.html'), { query });
        }
    }

    /** 重新计算子 view 边界（箭头函数 = 绑定 this） */
    private relayout = (): void => {
        if (!this.window || !this.view || this.window.isDestroyed())
            return;
        const { width, height } = this.window.contentView.getBounds();
        this.view.setBounds({
            x: BORDER_WIDTH,
            y: HEADER_HEIGHT,
            width: Math.max(width - BORDER_WIDTH * 2, 0),
            height: Math.max(height - HEADER_HEIGHT - BORDER_WIDTH, 0),
        });
    };

    /** 显示并聚焦浮动窗口 */
    focus(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.show();
            this.window.focus();
        }
    }

    /** 返回当前挂载的元信息（插件 ID、feature 等） */
    getMeta(): HostMeta | null {
        return this.currentMeta;
    }

    /** 切换窗口置顶 */
    setAlwaysOnTop(pin: boolean): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.setAlwaysOnTop(pin);
        }
    }

    /** 关闭并销毁浮动窗口 */
    close(): void {
        if (this.window) {
            this.window.removeListener('resize', this.relayout);
            this.window.removeListener('maximize', this.relayout);
            this.window.removeListener('unmaximize', this.relayout);
            this.window.close();
        }
        this.window = null;
        this.view = null;
        this.currentMeta = null;
    }
}
