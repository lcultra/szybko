export interface PluginManifest {
    main: string;
    logo: string;
    preload?: string;
    pluginSetting?: {
        single?: boolean;
        height?: number;
    };
    development?: {
        main?: string;
    };
    features: PluginFeature[];
}

import type { ActionDescriptor } from '../search/types.js';

export interface PluginFeature {
    code: string;
    explain?: string;
    icon?: string;
    cmds: (string | MatchCommand)[];
    /** 静态指令的直接动作。设置后匹配 cmd 时直接返回此动作，而非"打开插件"。 */
    action?: ActionDescriptor;
    mainHide?: boolean;
    mainPush?: boolean;
}

export type MatchCommand
    = | RegexMatch
        | OverMatch
        | ImgMatch
        | FilesMatch
        | WindowMatch;

export interface RegexMatch {
    type: 'regex';
    label: string;
    match: string;
    minLength?: number;
    maxLength?: number;
}

export interface OverMatch {
    type: 'over';
    label: string;
    exclude?: string;
    minLength?: number;
    maxLength?: number;
}

export interface ImgMatch {
    type: 'img';
    label: string;
}

export interface FilesMatch {
    type: 'files';
    label: string;
    fileType?: 'file' | 'directory';
    extensions?: string[];
    match?: string;
    minLength?: number;
    maxLength?: number;
}

export interface WindowMatch {
    type: 'window';
    label: string;
    match: {
        app: string[];
        title?: string;
        class?: string[];
    };
}
