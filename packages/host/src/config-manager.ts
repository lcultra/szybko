import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface AppConfig {
    theme?: 'system' | 'light' | 'dark'
    hotkey?: string
    [key: string]: unknown
}

export class ConfigManager {
    private config: AppConfig = {}
    private configPath: string

    constructor() {
        this.configPath = join(app.getPath('userData'), 'config.json')
        this.load()
    }

    private load() {
        if (existsSync(this.configPath)) {
            try { this.config = JSON.parse(readFileSync(this.configPath, 'utf-8')) }
            catch { /* use defaults */ }
        }
    }

    private save() {
        mkdirSync(this.configPath.replace(/\/[^/]+$/, ''), { recursive: true })
        writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    }

    get(key: string): unknown { return this.config[key] }
    set(key: string, value: unknown) { this.config[key] = value; this.save() }
}
