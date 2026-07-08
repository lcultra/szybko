/**
 * Runtime Host 可选能力接口。
 * 这些是 structural type 定义，纯 domain 概念，无 Electron 依赖。
 * 类型守卫函数在 presentation/ 层，因为它们需要 cast 到具体实现类型。
 */

export interface Focusable {
    focus: () => void;
}

export interface Pinnable {
    setAlwaysOnTop: (pin: boolean) => void;
}

export interface Closable {
    close: () => void;
}

export interface Resizable {
    resize: (width: number, height: number) => void;
}

export interface Positionable {
    setPosition: (x: number, y: number) => void;
}
