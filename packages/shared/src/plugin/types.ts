/**
 * 插件清单 — 对应 plugin.json 文件。
 */
export interface PluginManifest {
    /** 必填。稳定插件 ID，用于持久化关联用户数据。 */
    id: string;
    /** 必填。插件运行入口，相对于 plugin.json 的 .html 路径。 */
    main: string;
    /** 必填。插件 Logo 图标，相对路径的图片文件。 */
    logo: string;
    /** 选填。窗口加载前执行的预加载脚本（.js）。运行在独立预加载环境，可使用 Node.js 能力。 */
    preload?: string;
    /** 选填。插件应用设置。 */
    pluginSetting?: {
        /** 默认 true。是否以单例模式运行。 */
        single?: boolean;
        /** 默认 544。插件初始高度。 */
        height?: number;
    };
    /** 选填。开发模式配置。 */
    development?: {
        /** 开发模式下加载的 URL，替代 main 文件路径。 */
        main?: string;
    };
    /** 必填。核心指令集合，最小长度 1。 */
    features: PluginFeature[];
}

/**
 * 核心功能定义。
 */
export interface PluginFeature {
    /** 必填且唯一。功能编码，插件入口用于区分不同功能。 */
    code: string;
    /** 选填。功能简短描述。 */
    explain?: string;
    /** 选填。功能图标文件（.png/.jpg/.svg）或动态 feature 中的 data URL。 */
    icon?: string;
    /** 选填。动态 feature 可限制平台。 */
    platform?: string | string[];
    /** 必填。指令集合，最小长度 1。 */
    cmds: (string | MatchCommand)[];
    /** 选填。是否向主搜索框推送内容。 */
    mainPush?: boolean;
    /** 选填。触发时是否隐藏主搜索框。 */
    mainHide?: boolean;
}

export type MatchCommand
    = | RegexMatch
        | OverMatch
        | ImgMatch
        | FilesMatch
        | WindowMatch;

/** 正则匹配文本 */
export interface RegexMatch {
    type: 'regex';
    /** 在列表中显示的指令名称。 */
    label: string;
    /** 正则表达式字符串（JSON 中反斜杠需双写）。 */
    match: string;
    minLength?: number;
    maxLength?: number;
}

/** 任意文本匹配 */
export interface OverMatch {
    type: 'over';
    label: string;
    /** 排除的正则表达式。 */
    exclude?: string;
    minLength?: number;
    /** 默认最多 10000。 */
    maxLength?: number;
}

/** 图像匹配（剪贴板或拖入的图片） */
export interface ImgMatch {
    type: 'img';
    label: string;
}

/** 文件/文件夹匹配 */
export interface FilesMatch {
    type: 'files';
    label: string;
    fileType?: 'file' | 'directory';
    /** 允许的文件扩展名列表。 */
    extensions?: string[];
    /** 匹配文件名的正则（与 extensions 二选一）。 */
    match?: string;
    minLength?: number;
    maxLength?: number;
}

/** 活动窗口匹配（Windows 专有 class，macOS 用 app + title） */
export interface WindowMatch {
    type: 'window';
    label: string;
    match: {
        /** 目标进程/应用名称列表。 */
        app: string[];
        /** 匹配窗口标题的正则。 */
        title?: string;
        /** 窗口类名列表（Windows 专有）。 */
        class?: string[];
    };
}
