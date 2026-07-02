import type { Host, PluginRuntime } from '@szybko/shared';
import { BrowserWindow } from 'electron';

export class FloatingHost implements Host {
    id: string;
    type = 'floating' as const;
    private window: BrowserWindow | null = null;

    constructor(id: string) { this.id = id; }

    attach(runtime: PluginRuntime) {
        runtime.state = 'attached';
        runtime.host = this;
        this.window?.show();
    }

    detach(runtime: PluginRuntime) {
        runtime.state = 'detached';
        runtime.host = null;
        this.window?.hide();
    }

    createWindow() {
        this.window = new BrowserWindow({ width: 900, height: 600, frame: true });
    }
}
