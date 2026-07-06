import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 从指定目录向上查找项目根目录（存在 pnpm-workspace.yaml 的目录）
 */
export function findProjectRoot(cwd: string): string | null {
    let dir = cwd;

    // 最多向上找 10 层
    for (let i = 0; i < 10; i++) {
        if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) {
            return dir;
        }
        const parent = resolve(dir, '..');
        if (parent === dir)
            break; // 到根了
        dir = parent;
    }

    return null;
}
