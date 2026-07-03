import type { WebContentsView } from 'electron';
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, MAX_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT, SEARCHBAR_HEIGHT, WINDOW_TOP_OFFSET_RATIO } from '@szybko/shared';
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
        this.relayout();
    }

    hide() { this.window?.hide(); }
    show() {
        this.repositionToCursor();
        this.window?.show();
    }

    isVisible(): boolean { return this.window?.isVisible() ?? false; }

    /** 初始化 Host 注册表（main/index.ts 启动时调用一次） */
    initHostRegistry(pluginPreloadPath: string): RuntimeHostRegistry {
        this.hostRegistry = new RuntimeHostRegistry(this, pluginPreloadPath);
        return this.hostRegistry;
    }

    getHostRegistry(): RuntimeHostRegistry | null {
        return this.hostRegistry;
    }

    // ── Child view management (called by RuntimeHost implementations) ──

    addChildView(view: WebContentsView): void {
        this.window?.contentView.addChildView(view);
        this.relayout();
    }

    removeChildView(view: WebContentsView): void {
        if (this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(view);
        }
        this.relayout();
    }

    /** 重新计算所有子 view 的位置（窗口 resize 或 view 变更时调用） */
    relayout(): void {
        if (!this.window)
            return;
        const [, winHeight] = this.window.getSize();
        for (const view of this.window.contentView.children) {
            view.setBounds({
                x: BORDER_WIDTH,
                y: SEARCHBAR_HEIGHT,
                width: DEFAULT_WINDOW_WIDTH - BORDER_WIDTH * 2,
                height: Math.max(winHeight - SEARCHBAR_HEIGHT - BORDER_WIDTH, 0),
            });
        }
    }
}
