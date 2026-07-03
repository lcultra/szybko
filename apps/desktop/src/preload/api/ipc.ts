import type {
    IpcInvokeContract,
    IpcMainToRendererEventContract,
} from '@szybko/shared';
import { ipcRenderer } from 'electron';

type InvokePayload<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['request'];
type InvokeResponse<C extends keyof IpcInvokeContract> = IpcInvokeContract[C]['response'];
type MainEventPayload<C extends keyof IpcMainToRendererEventContract> = IpcMainToRendererEventContract[C];

export function invoke<C extends keyof IpcInvokeContract>(
    channel: C,
): (payload: InvokePayload<C>) => Promise<InvokeResponse<C>> {
    return async (payload: InvokePayload<C>) =>
        ipcRenderer.invoke(channel, payload) as Promise<InvokeResponse<C>>;
}

export function on<C extends keyof IpcMainToRendererEventContract>(
    channel: C,
): (cb: (data: MainEventPayload<C>) => void) => () => void {
    return (cb: (data: MainEventPayload<C>) => void) => {
        const handler = (_: unknown, data: MainEventPayload<C>) => cb(data);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    };
}
