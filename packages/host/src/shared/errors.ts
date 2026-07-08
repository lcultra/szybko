export const AppErrorCode = {
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_PACKAGE_MISSING: 'PLUGIN_PACKAGE_MISSING',
  PLUGIN_PACKAGE_INVALID: 'PLUGIN_PACKAGE_INVALID',
  PLUGIN_SOURCE_FORBIDS_UNINSTALL: 'PLUGIN_SOURCE_FORBIDS_UNINSTALL',
  PLUGIN_ALREADY_INSTALLED: 'PLUGIN_ALREADY_INSTALLED',
  PLUGIN_NOT_INSTALLED: 'PLUGIN_NOT_INSTALLED',
  RUNTIME_NOT_FOUND: 'RUNTIME_NOT_FOUND',
  SEARCH_SESSION_EXPIRED: 'SEARCH_SESSION_EXPIRED',
  LAUNCHER_ITEM_NOT_FOUND: 'LAUNCHER_ITEM_NOT_FOUND',
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message?: string,
    public readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}
