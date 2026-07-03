import type { Host, PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { join } from 'node:path';
import process from 'node:process';
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, SEARCHBAR_HEIGHT } from '@szybko/shared';
import { BrowserWindow } from 'electron';

export class FloatingHost implements Host {
    id: string;
    type = 'floating' as const;
    private window: BrowserWindow | null = null;
    private view: WebContentsView | null = null;
    private runtimeId: string | null = null;

    constructor(id: string) { this.id = id; }

    attach(runtime: PluginRuntime, view?: WebContentsView) {
        if (view) {
            this.view = view;
            this.window?.contentView.addChildView(view);
            view.setBounds({ x: BORDER_WIDTH, y: SEARCHBAR_HEIGHT + BORDER_WIDTH, width: DEFAULT_WINDOW_WIDTH - BORDER_WIDTH * 2, height: 600 - SEARCHBAR_HEIGHT - BORDER_WIDTH * 2 });
        }
        runtime.state = 'attached';
        runtime.host = this;
        this.window?.show();
    }

    detach(runtime: PluginRuntime) {
        if (this.view && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.view);
        }
        runtime.state = 'detached';
        runtime.host = null;
        this.view = null;
        this.window?.close();
        this.window = null;
    }

    createWindow(pluginName: string, runtimeId: string, pluginId?: string, explain?: string) {
        this.runtimeId = runtimeId;
        this.window = new BrowserWindow({
            width: DEFAULT_WINDOW_WIDTH,
            height: 600,
            frame: false,
            transparent: true,
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 12, y: 26 },
            webPreferences: {
                preload: join(__dirname, '../preload/host.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        // 加载 Renderer 的 floating 页面
        const query: Record<string, string> = { name: pluginName, runtimeId, pluginId: pluginId ?? '', explain: explain ?? '' };
        if (process.env.ELECTRON_RENDERER_URL) {
            const qs = new URLSearchParams(query).toString();
            void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')}/floating.html?${qs}`);
        }
        else {
            void this.window.loadFile(join(__dirname, '../renderer/floating.html'), { query });
        }
    }

    /** 显示并聚焦浮动窗口 */
    focus() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.show();
            this.window.focus();
        }
    }

    /** 切换窗口置顶 */
    setAlwaysOnTop(pin: boolean) {
        if (this.window && !this.window.isDestroyed()) {
            this.window.setAlwaysOnTop(pin);
        }
    }
}
