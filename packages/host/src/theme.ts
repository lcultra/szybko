import type { BrowserWindow } from 'electron';
import { IPC } from '@szybko/shared';
import { nativeTheme } from 'electron';

export class ThemeManager {
    setupListener(mainWindow: BrowserWindow) {
        nativeTheme.on('updated', () => {
            mainWindow.webContents.send(IPC.THEME_CHANGED, { isDark: this.isDark() });
        });
    }

    isDark(): boolean {
        return nativeTheme.shouldUseDarkColors;
    }

    handleGet() {
        return { isDark: this.isDark() };
    }
}
