// Thin shell — real logic lives in @szybko/host
// This file will be replaced with: import { bootstrap } from '@szybko/host'
// after Task D1 creates the host package.

import path, { join } from 'node:path';
import process from 'node:process';
import { app, BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 820,
        height: 96,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (process.env.ELECTRON_RENDERER_URL) {
        mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    }
    else {
        mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
    }
    mainWindow.on('blur', () => mainWindow?.hide());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
