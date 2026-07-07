import type { SzybkoInternalApi } from '@szybko/shared';
import {
    BORDER_WIDTH,
    DEFAULT_WINDOW_WIDTH,
    FLOATING_WINDOW_DEFAULT_HEIGHT,
    HEADER_HEIGHT,
    MAX_WINDOW_HEIGHT,
    PLUGIN_CONTENT_MIN_HEIGHT,
    SHELL_CONTENT_MAX_HEIGHT,
    WINDOW_TOP_OFFSET_RATIO,
} from '@szybko/shared';

/**
 * 布局常量 API — 将 shared 中的像素值派发给 renderer。
 */
export function createLayoutApi(): Pick<SzybkoInternalApi, 'getLayoutConstants'> {
    return {
        getLayoutConstants: () => ({
            css: {
                '--layout-header-height': `${HEADER_HEIGHT}px`,
                '--layout-shell-content-max-height': `${SHELL_CONTENT_MAX_HEIGHT}px`,
                '--layout-plugin-content-min-height': `${PLUGIN_CONTENT_MIN_HEIGHT}px`,
                '--layout-border-width': `${BORDER_WIDTH}px`,
                '--layout-floating-window-default-height': `${FLOATING_WINDOW_DEFAULT_HEIGHT}px`,
            },
            raw: {
                HEADER_HEIGHT,
                DEFAULT_WINDOW_WIDTH,
                MAX_WINDOW_HEIGHT,
                MIN_WINDOW_HEIGHT: HEADER_HEIGHT,
                BORDER_WIDTH,
                SHELL_CONTENT_MAX_HEIGHT,
                PLUGIN_CONTENT_MIN_HEIGHT,
                FLOATING_WINDOW_DEFAULT_HEIGHT,
                WINDOW_TOP_OFFSET_RATIO,
            },
        }),
    };
}
