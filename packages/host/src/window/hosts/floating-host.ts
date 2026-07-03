import type { Host, PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';

const FLOATING_HEADER_HEIGHT = 48;

export class FloatingHost implements Host {
    id: string;
    type = 'floating' as const;
    private window: BrowserWindow | null = null;
    private view: WebContentsView | null = null;

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

    createWindow(pluginName?: string) {
        this.window = new BrowserWindow({
            width: 900,
            height: 600,
            frame: false,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        // 加载浮动窗口外壳 HTML
        const htmlPath = join(__dirname, '../../resources/floating-host.html');
        void this.window.loadFile(htmlPath, {
            query: { name: pluginName || '插件' },
        });
    }

    /** 显示并聚焦浮动窗口 */
    focus() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.show();
            this.window.focus();
        }
    }
}
