import { createServer } from 'node:net';

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

/**
 * 自动寻找空闲端口
 */
export async function findFreePort(preferred = 5173): Promise<number> {
    let port = await tryPort(preferred);
    if (port)
        return port;

    for (let i = preferred + 1; i < preferred + 100; i++) {
        port = await tryPort(i);
        if (port)
            return port;
    }

    return tryPort(0) as Promise<number>;
}
