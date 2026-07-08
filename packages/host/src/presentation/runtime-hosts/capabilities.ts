import type { Closable, Focusable, Pinnable } from '../../domain/runtime/runtime-host-capabilities';
import type { RuntimeHost } from './runtime-host';

export type { Closable, Focusable, Pinnable, Positionable, Resizable } from '../../domain/runtime/runtime-host-capabilities';

export function isFocusable(host: RuntimeHost): host is RuntimeHost & Focusable {
    return 'focus' in host;
}

export function isPinnable(host: RuntimeHost): host is RuntimeHost & Pinnable {
    return 'setAlwaysOnTop' in host;
}

export function isClosable(host: RuntimeHost): host is RuntimeHost & Closable {
    return 'close' in host;
}
