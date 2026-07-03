import type { Host, PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { join } from 'node:path';
import process from 'node:process';
import { BrowserWindow } from 'electron';

const FLOATING_HEADER_HEIGHT = 48;

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
            view.setBounds({ x: 0, y: FLOATING_HEADER_HEIGHT, width: 900, height: 600 - FLOATING_HEADER_HEIGHT });
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

    createWindow(pluginName: string, runtimeId: string) {
        this.runtimeId = runtimeId;
        this.window = new BrowserWindow({
            width: 900,
            height: 600,
            frame: false,
            webPreferences: {
                preload: join(__dirname, '../preload/host.js'),
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        // 加载 Renderer 的 floating 页面
        if (process.env.ELECTRON_RENDERER_URL) {
            void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')}/floating.html?name=${pluginName}&runtimeId=${runtimeId}`);
        }
        else {
            void this.window.loadFile(join(__dirname, '../renderer/floating.html'), {
                query: { name: pluginName, runtimeId },
            });
        }
    }

    /** 显示并聚焦浮动窗口 */
    focus() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.show();
            this.window.focus();
        }
    }
}
