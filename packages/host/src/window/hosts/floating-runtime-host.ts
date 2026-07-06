import type { RuntimeSlot } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import type { Closable, Focusable, Pinnable } from './capabilities';
import type { HostMeta, RuntimeHost } from './runtime-host';
import { join } from 'node:path';
import process from 'node:process';
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, SEARCHBAR_HEIGHT } from '@szybko/shared';
import { BrowserWindow } from 'electron';

export class FloatingRuntimeHost implements RuntimeHost, Focusable, Pinnable, Closable {
    id: string;
    type = 'floating' as const;
    private window: BrowserWindow | null = null;
    private view: WebContentsView | null = null;
    private currentMeta: HostMeta | null = null;

    constructor(
        id: string,
        private pluginPreloadPath: string,
    ) { this.id = id; }

    attach(view: WebContentsView, meta: HostMeta): void {
        this.currentMeta = meta;

        // 自动创建窗口（如果尚未创建）
        if (!this.window) {
            this.createWindow(meta);
        }
        if (view) {
            this.view = view;
            this.window!.contentView.addChildView(view);
            this.relayout();
        }
        this.window!.show();
    }

    detach(): void {
        if (this.view && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.view);
        }
        this.view = null;
        this.window?.hide();
    }

    private createWindow(meta: HostMeta): void {
        this.window = new BrowserWindow({
            width: DEFAULT_WINDOW_WIDTH,
            height: 600,
            frame: false,
            hasShadow: false,
            transparent: true,
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 12, y: 26 },
            webPreferences: {
                preload: this.pluginPreloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        // 窗口尺寸变化时重新布局子 view
        this.window.on('resize', this.relayout);
        this.window.on('maximize', this.relayout);
        this.window.on('unmaximize', this.relayout);

        const slot: RuntimeSlot = {
            runtimeId: meta.runtimeId,
            pluginId: meta.pluginId,
            pluginName: meta.pluginName,
            featureExplain: meta.featureExplain ?? '',
            loadState: 'loaded',
            mountState: 'attached',
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
            y: SEARCHBAR_HEIGHT,
            width: Math.max(width - BORDER_WIDTH * 2, 0),
            height: Math.max(height - SEARCHBAR_HEIGHT - BORDER_WIDTH, 0),
        });
    };

    /** 显示并聚焦浮动窗口 */
    focus(): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.show();
            this.window.focus();
        }
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
