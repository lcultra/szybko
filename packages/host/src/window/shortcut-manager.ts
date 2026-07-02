import type { WindowManager } from './window-manager.js';
import process from 'node:process';
import { globalShortcut } from 'electron';

export class ShortcutManager {
    registerToggle(windowManager: WindowManager) {
        const accelerator = process.platform === 'darwin' ? 'Command+Space' : 'Control+Space';
        globalShortcut.register(accelerator, () => {
            if (windowManager.isVisible())
                windowManager.hide();
            else windowManager.show();
        });
    }

    unregisterAll() {
        globalShortcut.unregisterAll();
    }
}
