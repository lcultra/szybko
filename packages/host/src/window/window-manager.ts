import type { WebContentsView } from 'electron';
import { DEFAULT_WINDOW_WIDTH, MAX_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT, WINDOW_TOP_OFFSET_RATIO } from '@szybko/shared';
import { BrowserWindow, screen } from 'electron';

import { RuntimeHostRegistry } from './runtime-host-registry';

export class WindowManager {
    private window: BrowserWindow | null = null;
    private hostRegistry: RuntimeHostRegistry | null = null;

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
                sandbox: false,
                contextIsolation: true,
                nodeIntegration: false,
            },
        });
        this.window.contentView.setBorderRadius(8);

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

    /** 初始化 Host 注册表（main/index.ts 启动时调用一次） */
    initHostRegistry(): RuntimeHostRegistry {
        this.hostRegistry = new RuntimeHostRegistry(this);
        return this.hostRegistry;
    }

    getHostRegistry(): RuntimeHostRegistry | null {
        return this.hostRegistry;
    }

    // ── Child view management (called by RuntimeHost implementations) ──

    addChildView(view: WebContentsView): void {
        this.window?.contentView.addChildView(view);
    }

    removeChildView(view: WebContentsView): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(view);
        }
    }
}
