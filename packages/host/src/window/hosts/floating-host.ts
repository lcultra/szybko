import type { Host, PluginRuntime } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { BrowserWindow } from 'electron';

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
            view.setBounds({ x: 0, y: 0, width: 900, height: 600 });
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

    createWindow() {
        this.window = new BrowserWindow({ width: 900, height: 600, frame: true });
    }
}
