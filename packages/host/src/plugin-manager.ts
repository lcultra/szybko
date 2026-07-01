import { rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PluginLoader } from './plugin-loader.js'

export class PluginManager {
    private loader = new PluginLoader()
    private plugins: Map<string, { id: string; manifest: any; path: string }> = new Map()

    scan() {
        const found = this.loader.scan()
        for (const p of found) this.plugins.set(p.id, p)
        return found
    }

    get(id: string) { return this.plugins.get(id) }
    getAll() { return Array.from(this.plugins.values()) }

    uninstall(id: string) {
        const plugin = this.plugins.get(id)
        if (!plugin) return
        const dir = join(process.cwd(), 'plugins', id)
        if (existsSync(dir)) rmSync(dir, { recursive: true })
        this.plugins.delete(id)
    }
}
