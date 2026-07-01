import { globalShortcut } from 'electron'
import type { WindowManager } from './window-manager.js'

export class ShortcutManager {
    registerAltSpace(windowManager: WindowManager) {
        globalShortcut.register('Alt+Space', () => {
            if (windowManager.isVisible()) windowManager.hide()
            else windowManager.show()
        })
    }

    unregisterAll() {
        globalShortcut.unregisterAll()
    }
}
