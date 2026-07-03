import { IPC } from '@szybko/shared';
import { on } from './ipc';

/**
 * 主题变更通知。
 * 监听系统/应用主题切换（亮色/暗色），只有 launcher 宿主需要。
 */
export function createThemeApi() {
    return {
        onThemeChanged: on(IPC.THEME_CHANGED),
    };
}
