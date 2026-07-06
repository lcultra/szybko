import { createServer } from 'node:net';

/**
 * 自动寻找空闲端口，从 preferred 开始扫描
 */
export async function findFreePort(preferred = 5173): Promise<number> {
    const port = await tryPort(preferred);
    if (port)
        return port;

    // 如果 preferred 被占，扫描后续端口
    for (let i = preferred + 1; i < preferred + 100; i++) {
        const p = await tryPort(i);
        if (p)
            return p;
    }

    // 兜底：让系统分配
    return tryPort(0) as Promise<number>;
}

function tryPort(port: number): Promise<number | null> {
    return new Promise((resolve) => {
        const server = createServer();
        server.unref();
        server.on('error', () => resolve(null));
        server.listen(port, () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                server.close(() => resolve(addr.port));
            }
            else {
                server.close(() => resolve(null));
            }
        });
    });
}
