/**
 * Re-export from domain layer.
 * RuntimeHost 和 HostMeta 是领域概念，定义在 domain/runtime/。
 * 具体实现（LauncherRuntimeHost、FloatingRuntimeHost）在此层提供 Electron 类型实例化。
 */
export type { HostMeta, RuntimeHost } from '../../domain/runtime/runtime-host';
