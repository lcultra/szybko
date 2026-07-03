export interface Focusable { focus(): void; }
export interface Pinnable { setAlwaysOnTop(pin: boolean): void; }
export interface Closable { close(): void; }
export interface Resizable { resize(width: number, height: number): void; }
export interface Positionable { setPosition(x: number, y: number): void; }
