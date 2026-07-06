import detect from 'detect-port';

/**
 * 自动寻找空闲端口，从 preferred 开始扫描
 */
export async function findFreePort(preferred = 5173): Promise<number> {
    const port = await detect(preferred);
    return port;
}
