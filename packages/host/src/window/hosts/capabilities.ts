import type { RuntimeHost } from './runtime-host';

export interface Focusable { focus: () => void }
export interface Pinnable { setAlwaysOnTop: (pin: boolean) => void }
export interface Closable { close: () => void }
export interface Resizable { resize: (width: number, height: number) => void }
export interface Positionable { setPosition: (x: number, y: number) => void }

export function isFocusable(host: RuntimeHost): host is RuntimeHost & Focusable {
    return 'focus' in host;
}

export function isPinnable(host: RuntimeHost): host is RuntimeHost & Pinnable {
    return 'setAlwaysOnTop' in host;
}

export function isClosable(host: RuntimeHost): host is RuntimeHost & Closable {
    return 'close' in host;
}
