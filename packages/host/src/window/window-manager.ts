import type { Host } from '@szybko/shared';
import type { WebContentsView } from 'electron';
import { BORDER_WIDTH, DEFAULT_WINDOW_WIDTH, MAX_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT, SEARCHBAR_HEIGHT, WINDOW_TOP_OFFSET_RATIO } from '@szybko/shared';
import { BrowserWindow, screen } from 'electron';

import { FloatingHost } from './hosts/floating-host';
import { LauncherRuntimeHost } from './hosts/launcher-runtime-host';

export class WindowManager {
    private window: BrowserWindow | null = null;
    private hosts: Map<string, Host> = new Map();
    private pluginView: WebContentsView | null = null;

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
        this.updatePluginBounds();
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
            return new LauncherRuntimeHost(`launcher-${Date.now()}`);
        return new FloatingHost(`floating-${Date.now()}`);
    }

    // ── Plugin WebContentsView management ──────────────────────────

    /** 挂载插件 View 到主窗口搜索栏下方 */
    attachPluginView(view: WebContentsView): void {
        this.detachPluginView();
        this.window?.contentView.addChildView(view);
        this.pluginView = view;
        this.updatePluginBounds();
    }

    /** 从主窗口移除插件 View（不销毁，保留 Runtime 状态） */
    detachPluginView(): void {
        if (this.pluginView && this.window && !this.window.isDestroyed()) {
            this.window.contentView.removeChildView(this.pluginView);
        }
        this.pluginView = null;
    }

    /** 将插件 View 定位到搜索栏下方的区域 */
    private updatePluginBounds(): void {
        if (!this.pluginView || !this.window)
            return;
        const [, height] = this.window.getSize();
        this.pluginView.setBounds({
            x: BORDER_WIDTH,
            y: SEARCHBAR_HEIGHT,
            width: DEFAULT_WINDOW_WIDTH - BORDER_WIDTH * 2,
            height: Math.max(height - SEARCHBAR_HEIGHT - BORDER_WIDTH, 0),
        });
    }
}
