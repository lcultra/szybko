export const HEADER_HEIGHT = 60;
export const DEFAULT_WINDOW_WIDTH = 820;
export const MAX_WINDOW_HEIGHT = 520;
export const WINDOW_TOP_OFFSET_RATIO = 1 / 3;
export const BORDER_WIDTH = 1;
export const MIN_WINDOW_HEIGHT = HEADER_HEIGHT;
export const SHELL_CONTENT_MAX_HEIGHT = 600;
export const PLUGIN_CONTENT_MIN_HEIGHT = 400;
export const FLOATING_WINDOW_DEFAULT_HEIGHT = 600;

// macOS 交通灯按钮（关闭/最小化/最大化）在 frameless 窗口中的位置
const TRAFFIC_LIGHT_BUTTON_SIZE = 12;
export const TRAFFIC_LIGHT_X = 12;
export const TRAFFIC_LIGHT_Y = Math.floor((HEADER_HEIGHT - TRAFFIC_LIGHT_BUTTON_SIZE) / 2);

// 浮动窗口标题栏左侧避让交通灯的安全间距
export const FLOATING_HEADER_PADDING_LEFT = 78;
