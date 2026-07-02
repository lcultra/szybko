import type { ActionDescriptor, SearchResult } from '@szybko/shared';
import type { BrowserWindow } from 'electron';
import type { WindowManager } from './window-manager.js';
import { exec } from 'node:child_process';
import { IPC } from '@szybko/shared';
import { clipboard, ipcMain, shell } from 'electron';

// ── Built-in search sources ──────────────────────────────────────

interface SearchSource {
    name: string;
    search: (query: string) => SearchResult[];
}

function calculate(query: string): SearchResult[] {
    // Only allow safe math expressions: digits, operators, parentheses, dots, spaces
    if (!/^[\d+\-*/.()%\s]+$/.test(query.trim()))
        return [];

    try {
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${query})`)();
        if (typeof result !== 'number' || !Number.isFinite(result))
            return [];

        return [{
            id: `calc-${Date.now()}`,
            title: String(result),
            subtitle: `${query} =`,
            icon: '🧮',
            group: '计算器',
            score: 100,
            action: { type: 'clipboard.writeText', payload: { text: String(result) } },
        }];
    }
    catch {
        return [];
    }
}

const STATIC_APPS: SearchResult[] = [
    {
        id: 'app-vscode',
        title: 'Visual Studio Code',
        subtitle: '代码编辑器',
        icon: '💻',
        group: '应用',
        score: 90,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.microsoft.VSCode' } },
    },
    {
        id: 'app-terminal',
        title: '终端',
        subtitle: 'Terminal.app',
        icon: '🖥️',
        group: '应用',
        score: 80,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.Terminal' } },
    },
    {
        id: 'app-finder',
        title: '访达',
        subtitle: 'Finder',
        icon: '📁',
        group: '应用',
        score: 70,
        action: { type: 'shell.openPath', payload: { path: '/' } },
    },
    {
        id: 'app-safari',
        title: 'Safari',
        subtitle: '浏览器',
        icon: '🌐',
        group: '应用',
        score: 65,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.Safari' } },
    },
    {
        id: 'app-calendar',
        title: '日历',
        subtitle: 'Calendar',
        icon: '📅',
        group: '应用',
        score: 60,
        action: { type: 'process.launchApp', payload: { bundleId: 'com.apple.iCal' } },
    },
];

const SOURCES: SearchSource[] = [
    { name: 'calculator', search: calculate },
    {
        name: 'apps',
        search: (query: string) => {
            const lower = query.toLowerCase();
            return STATIC_APPS.filter(
                app => app.title.toLowerCase().includes(lower)
                    || app.subtitle?.toLowerCase().includes(lower),
            ).map((app, i) => ({ ...app, score: app.score - i * 5 }));
        },
    },
];

function runBuiltinSearch(query: string): SearchResult[] {
    if (!query.trim())
        return [];

    const results: SearchResult[] = [];
    for (const source of SOURCES) {
        const hits = source.search(query);
        results.push(...hits);
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10);
}

// ── Execute action ────────────────────────────────────────────────

function executeAction(action: ActionDescriptor): { ok: boolean; error?: string } {
    switch (action.type) {
        case 'shell.openPath': {
            shell.openPath(action.payload.path);
            return { ok: true };
        }

        case 'shell.openUrl': {
            shell.openExternal(action.payload.url);
            return { ok: true };
        }

        case 'clipboard.writeText': {
            clipboard.writeText(action.payload.text);
            return { ok: true };
        }

        case 'process.launchApp': {
            exec(`open -b "${action.payload.bundleId}"`);
            return { ok: true };
        }

        default:
            return { ok: false, error: `Unknown action type: ${(action as any).type}` };
    }
}

// ── Register all IPC handlers ─────────────────────────────────────

export function registerIpcHandlers(windowManager: WindowManager) {
    // ── Internal API (__szybko_internal__) ────────────────────────

    ipcMain.handle(IPC.SEARCH, (_event, req: { queryId: string; query: string; timestamp: number }) => {
        const results = runBuiltinSearch(req.query);
        if (results.length > 0) {
            const win = windowManager.getWindow();
            if (win && !win.isDestroyed()) {
                win.webContents.send(IPC.SEARCH_BATCH, {
                    queryId: req.queryId,
                    batchSeq: 0,
                    source: 'builtin',
                    results,
                    isFinal: true,
                });
            }
        }
        return { ok: true };
    });

    ipcMain.handle(IPC.SEARCH_CANCEL, () => {
        return { ok: true };
    });

    ipcMain.handle(IPC.WINDOW_RESIZE, (_event, { height }: { height: number }) => {
        windowManager.resize(height);
        return { ok: true };
    });

    ipcMain.handle(IPC.WINDOW_HIDE, () => {
        windowManager.hide();
        return { ok: true };
    });

    // ── Public API (szybko / utools) ──────────────────────────────

    ipcMain.handle(IPC.EXECUTE, (_event, { action }: { action: ActionDescriptor }) => {
        return executeAction(action);
    });

    ipcMain.handle(IPC.HOST_SWITCH, (_event, { pluginId: _pluginId, targetHost }: { pluginId: string; targetHost: string }) => {
        try {
            const host = windowManager.createHost(targetHost as 'launcher' | 'floating');
            windowManager.registerHost(host.id, host);
            return { ok: true, hostId: host.id };
        }
        catch (err) {
            return { ok: false, error: String(err) };
        }
    });
}

// ── Push notifications (main → renderer) ──────────────────────────

export function notifyShowMainWindow(win: BrowserWindow) {
    if (!win.isDestroyed()) {
        win.webContents.send(IPC.SHOW_MAIN_WINDOW);
    }
}
