import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function findProjectRoot(cwd: string): string | null {
    let dir = cwd;

    for (let i = 0; i < 10; i++) {
        if (existsSync(resolve(dir, 'pnpm-workspace.yaml')))
            return dir;

        const parent = resolve(dir, '..');
        if (parent === dir)
            break;
        dir = parent;
    }

    return null;
}
