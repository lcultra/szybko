import type { Host } from '@szybko/shared';
import { DEFAULT_WINDOW_WIDTH, MAX_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT, WINDOW_TOP_OFFSET_RATIO } from '@szybko/shared';
import { BrowserWindow, screen } from 'electron';

import { FloatingHost } from './hosts/floating-host.js';
import { LauncherHost } from './hosts/launcher-host.js';

export class WindowManager {
    private window: BrowserWindow | null = null;
    private hosts: Map<string, Host> = new Map();

    createMainWindow(preloadPath: string): BrowserWindow {
        this.repositionToCursor();

        this.window = new BrowserWindow({
            width: DEFAULT_WINDOW_WIDTH,
            height: MIN_WINDOW_HEIGHT,
            frame: false,
            transparent: true,
            resizable: false,
            webPreferences: {
                preload: preloadPath,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });

        this.window.on('blur', () => this.window?.hide());
        return this.window;
    }

    repositionToCursor() {
        const cursorPoint = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursorPoint);
        const winX = Math.round(display.workArea.x + (display.workArea.width - DEFAULT_WINDOW_WIDTH) / 2);
        const winY = Math.round(display.workArea.y + display.workArea.height * WINDOW_TOP_OFFSET_RATIO);
        this.window?.setPosition(winX, winY);
    }

    getWindow() { return this.window; }
    resize(height: number) {
        const clamped = Math.min(Math.max(height, MIN_WINDOW_HEIGHT), MAX_WINDOW_HEIGHT);
        this.window?.setSize(DEFAULT_WINDOW_WIDTH, clamped);
    }

    hide() { this.window?.hide(); }
    show() {
        this.repositionToCursor();
        this.window?.show();
    }

    isVisible(): boolean { return this.window?.isVisible() ?? false; }

    registerHost(id: string, host: Host) { this.hosts.set(id, host); }
    getHost(id: string): Host | undefined { return this.hosts.get(id); }

    createHost(type: 'launcher' | 'floating'): Host {
        if (type === 'launcher')
            return new LauncherHost(`launcher-${Date.now()}`);
        return new FloatingHost(`floating-${Date.now()}`);
    }
}
