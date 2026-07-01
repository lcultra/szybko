# 插件规范

## plugin.json

字段与 uTools 完全一致。

```json
{
    "main": "index.html",
    "logo": "icon.png",
    "preload": "preload.js",
    "pluginSetting": {
        "single": true,
        "height": 544
    },
    "features": [
        {
            "code": "hello",
            "explain": "示例插件",
            "cmds": ["hello", "你好"]
        }
    ]
}
```

| 字段                   | 必填 | 说明                                                          |
| ---------------------- | ---- | ------------------------------------------------------------- |
| `main`                 | ✅   | `.html` 文件路径，插件 UI 入口                                |
| `logo`                 | ✅   | 图标文件路径                                                  |
| `preload`              | ❌   | 预加载脚本（可调 Node.js）                                    |
| `pluginSetting.single` | ❌   | 默认 `true`。单例：整个应用只一个 Runtime；`false` 允许多实例 |
| `pluginSetting.height` | ❌   | 默认 `544`。插件初始高度                                      |
| `features`             | ✅   | 指令集合，最小 1 条                                           |
| `features[].code`      | ✅   | 功能编码，唯一                                                |
| `features[].explain`   | ❌   | 功能描述                                                      |
| `features[].icon`      | ❌   | 功能图标 (.png/.jpg/.svg)                                     |
| `features[].cmds`      | ✅   | 指令列表，字符串或匹配对象                                    |

### cmds 匹配类型

**功能指令**（字符串）：简短唯一，中文自动支持拼音和首字母搜索。

**匹配指令**（对象）：

| 类型                                                                               | 用途         |
| ---------------------------------------------------------------------------------- | ------------ |
| `{ type: "regex", label, match, minLength?, maxLength? }`                          | 正则匹配文本 |
| `{ type: "over", label, exclude?, minLength?, maxLength? }`                        | 匹配任意文本 |
| `{ type: "img", label }`                                                           | 匹配图像     |
| `{ type: "files", label, fileType?, extensions?, match?, minLength?, maxLength? }` | 匹配文件(夹) |
| `{ type: "window", label, match: { app, title?, class? } }`                        | 匹配系统窗口 |

## 插件目录结构

```
my-plugin/
├── plugin.json
├── preload.js       # 可选，可调 Node.js
├── index.html
├── icon.png
└── package.json     # 可选
```

## SDK API

插件通过 `window.utools` 访问宿主能力：

| 分类     | 方法                                                                                                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 生命周期 | `onPluginEnter/onPluginOut/onPluginDetach/onPluginReady`                                                                                                                         |
| 搜索     | `onSearch(ctx) → SearchResult[]`                                                                                                                                                 |
| 窗口     | `setExpendHeight/hideMainWindow/showMainWindow/outPlugin`                                                                                                                        |
| 子输入框 | `setSubInput/removeSubInput/setSubInputValue/subInputFocus/blur/select`                                                                                                          |
| 系统     | `shellOpenPath/shellShowItemInFolder/shellOpenExternal/shellTrashItem/showNotification/getNativeId/getAppName/getAppVersion/getPath/getFileIcon/isMacOS/isWindows/isLinux/isDev` |
| 剪贴板   | `copyText/copyFile/copyImage/getCopyedFiles/hideMainWindowPasteText/PasteImage/PasteFile/hideMainWindowTypeString`                                                               |
| 存储     | `db.put/get/remove/bulkDocs/allDocs` + `dbStorage` + `dbCryptoStorage`                                                                                                           |
| 动态指令 | `getFeatures/setFeature/removeFeature`                                                                                                                                           |
| 模拟按键 | `simulateKeyboardTap/simulateMouseMove/Click/DoubleClick/RightClick`                                                                                                             |
| AI 工具  | `registerTool`（注册 tools 到 AI Agent）                                                                                                                                         |

## 兼容策略

| 等级 | 含义                           | MVP 目标 |
| ---- | ------------------------------ | -------- |
| C0   | 可识别 manifest                | ✅       |
| C1   | 基础生命周期 + 窗口控制        | ✅ MVP   |
| C2   | 系统 API + 剪贴板 + DB         | 部分     |
| C3   | 高级匹配 + 动态 feature        | 后续     |
| C4   | 高兼容，运行大部分 uTools 插件 | 不承诺   |

### MVP 兼容 API

- ✅ 生命周期 `onPluginEnter/out/detach`
- ✅ 窗口 `setExpendHeight/hideMainWindow/showMainWindow/outPlugin`
- ✅ Shell `openPath/showItemInFolder/openExternal/trashItem`
- ✅ 剪贴板文本 `copyText/getCopyedFiles`
- ✅ DB `put/get/remove/allDocs` + `dbStorage`
- ⬜ 剪贴板文件/图像、子输入框、动态 feature、files/img/window 匹配类型

### 运行模式

- `compat` — preload 可用 Node.js，适合 uTools 兼容和本地可信插件
- `sandbox` — preload 禁用 Node.js，所有系统能力经主进程鉴权（插件市场必选）

MVP 先用 `compat`，插件市场前补齐 `sandbox`。
