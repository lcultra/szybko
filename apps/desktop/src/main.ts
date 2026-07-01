import { app, BrowserWindow } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 820,
        height: 96,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            preload: undefined,
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173')
    }

    mainWindow.on('blur', () => {
        mainWindow?.hide()
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
