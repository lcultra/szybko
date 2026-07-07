# ShortcutRegistry — 分作用域快捷键系统设计

## 问题

当前 Szybko 的快捷键注册散落在多个文件中，没有统一的层级结构和扩展入口。具体问题：

- **隐式层级**：系统全局、主窗口、插件视图、菜单、document 这些作用域是存在的，但新人看不出有哪些层、每层管什么
- **注册模式不统一**：有的用 `globalShortcut`，有的直接 `on('before-input-event')`，有的 callback 赋值，有的藏在 menu 定义里
- **`ShortcutManager` 名不副实**：只做了 global toggle，叫 manager 却没管其他快捷键
- **扩展无入口**：加新快捷键得自己判断该放哪、要不要加新的 listener

## 目标

1. 把快捷键的作用域层级显式化
2. 提供一个集中的定义入口 + 按 scope 分发的注册方法
3. ShortcutRegistry 是纯基础设施，不依赖业务对象
4. 不引入中心路由（不同 scope 本来就是正交的，不需要一个 dispatch 去判断焦点在哪）

## 设计决策记录

以下决策来自 spec review 时的讨论：

- 一个 action（如 "分离插件"）可能有多条 binding（mac/win 不同修饰键），用 `actionId` + `bindings[]` 模型，而非 flat id
- 类型定义放在 `packages/shared/src/shortcut/`，而非 `packages/host/`，避免 renderer 反向依赖 host
- ShortcutRegistry 不持有 `WindowManager` / `RuntimeCoordinator` 引用，是纯基础设施
- 所有注册方法返回 disposer function，Registry 内部追踪已注册的 disposer，避免 listener 泄漏
- Menu 当前只有展示 accelerator 的用途，不作为独立监听 scope；保留 `menu` scope 为将来 AppMenu 预留
- `matchBinding` 只匹配 `input.type === 'keyDown'`；修饰键为精确 AND（binding 列出的必须全匹配，未列出的必须全 absent）；单字符 key 大小写归一
- 自定 `ShortcutPlatform` 类型，避免 `NodeJS.Platform` 泄到 shared 层
- `getAccelerator` 需要 scope + platform 消除歧义（`plugin:detach` 同时存在于 main-window 和 plugin-view）
- 迁移步骤不做新老并行：先建代码不挂载重复快捷键，再按 scope 原子切换
- PluginView 的 disposer 由 RuntimeManager 负责在 RuntimeEntry 中追踪，destroy 时调用；同时监听 `webContents.destroyed` 兜底

## 类型定义

```typescript
// packages/shared/src/shortcut/types.ts

export type ShortcutPlatform = 'darwin' | 'win32' | 'linux';

export type ShortcutScope =
  | 'system'              // globalShortcut
  | 'main-window'         // main win.webContents → before-input-event
  | 'plugin-view'         // plugin WebContentsView → before-input-event
  | 'menu'                // 当前仅展示 accelerator，预留 AppMenu
  | 'renderer-document';  // renderer document keydown (通过 IPC 消费)

/** 修饰键 — 均为 AND 语义：binding 列出的必须全匹配，未列出的必须全 absent */
export interface ShortcutModifiers {
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/**
 * 一条按键绑定。
 * 一个 action（如 "分离插件"）可在同一 scope 内有多条 binding（mac/win 不同修饰键）。
 */
export interface ShortcutBinding {
  /** 当前 binding 的唯一标识（同一 action 内唯一即可） */
  id: string;
  key: string;
  modifiers: ShortcutModifiers;
  /** 限制平台；不传则全平台 */
  platforms?: ShortcutPlatform[];
  /** 展示用的 accelerator 字符串，不传则自动生成 */
  accelerator?: string;
  /** 是否在匹配后调用 preventDefault（renderer-document 默认 true，其他 scope 默认 false） */
  preventDefault?: boolean;
}

/** 一个快捷键动作 = 一个 actionId + 若干 platform/variant binding */
export interface ShortcutActionDef {
  actionId: string;
  scope: ShortcutScope;
  description: string;
  bindings: ShortcutBinding[];
}
```

### 设计说明

- **actionId + bindings[]**：`plugin:detach` 是一个 action，它在 `main-window` scope 下有两条 binding（`{meta: true}` for macOS，`{ctrl: true}` for Windows）。这是 OR 语义的建模方式 —— Registry 匹配一条 binding 即可触发。
- **scope 不在 binding 层**：一条 binding 不会跨 scope。同一 action 出现在不同 scope 时，写两个独立的 `ShortcutActionDef`。
- **`menu` scope**：当前 ContextMenu 只展示 accelerator 给用户看，不通过 Registry 注册 handler。保留 scope 为将来 AppMenu 预留。
- **`renderer-document` scope**：Registry 不为主进程注册 handler；renderer 通过 IPC 拉取定义后自行绑定。
- **taxonomy 中还有一个 `renderer-element` 层**（React onKeyDown，如 GridTile 的 Enter/Space），但它不属于 Registry 管理的范围，不在 API 中出现。

## ShortcutRegistry 类

```typescript
// packages/host/src/window/shortcut-registry.ts

import type { ShortcutActionDef, ShortcutBinding, ShortcutScope } from '@szybko/shared';
import { platform } from 'node:process';
import { globalShortcut, type WebContents } from 'electron';

type Disposer = () => void;

class ShortcutRegistry {
  private defs: ShortcutActionDef[] = [];
  private actionHandlers = new Map<string, (...args: any[]) => void>();
  private disposers: Disposer[] = [];
  private activeBindings: string[] = [];   // 已注册的 globalShortcut accelerator 列表

  // ── 定义 ──

  /** 批量注册 action 定义，可反复调用来追加 */
  define(actions: ShortcutActionDef[]): void {
    this.defs.push(...actions);
  }

  /** 按 scope 和/或 actionId 查询定义 */
  getActions(scope: ShortcutScope, actionId?: string): ShortcutActionDef[] {
    return this.defs.filter(
      a => a.scope === scope && (!actionId || a.actionId === actionId),
    );
  }

  /**
   * 生成展示用 accelerator 字符串（用于 Menu）。
   * 需要 scope 消除歧义（如 `plugin:detach` 同时定义在 main-window 和 plugin-view）。
   */
  getAccelerator(
    actionId: string,
    options: { scope: ShortcutScope; platform?: ShortcutPlatform },
  ): string | null {
    const action = this.getActions(options.scope, actionId)[0];
    if (!action) return null;
    const binding = action.bindings.find(
      b => !b.platforms || b.platforms.includes((options.platform ?? platform) as ShortcutPlatform),
    );
    if (!binding) return null;
    return binding.accelerator ?? this.buildAccelerator(binding);
  }

  // ── handler 注入（singleton scope） ──

  /**
   * 注册一个 action 的处理函数。
   * 用于 System / MainWindow 等 singleton scope。
   * 后注册覆盖前注册（方便测试时 mock）。
   */
  onAction(actionId: string, fn: (...args: any[]) => void): void {
    this.actionHandlers.set(actionId, fn);
  }

  // ── 挂载监听器（每个返回 disposer） ──

  registerSystemGlobal(): Disposer {
    const accels: string[] = [];
    for (const action of this.getActions('system')) {
      for (const binding of action.bindings) {
        if (binding.platforms && !binding.platforms.includes(platform as ShortcutPlatform)) continue;
        const accel = binding.accelerator ?? this.buildAccelerator(binding);
        globalShortcut.register(accel, () => this.trigger(action.actionId));
        accels.push(accel);
        this.activeBindings.push(accel);
      }
    }
    return this.trackDisposer(() => accels.forEach(a => globalShortcut.unregister(a)));
  }

  registerMainWindow(webContents: WebContents): Disposer {
    const handler = (_e: Electron.Event, input: Electron.Input) => {
      if (input.type !== 'keyDown') return;
      for (const action of this.getActions('main-window')) {
        for (const binding of action.bindings) {
          if (this.matchBinding(binding, input)) {
            if (binding.preventDefault ?? false) _e.preventDefault();
            this.trigger(action.actionId);
            return;
          }
        }
      }
    };
    webContents.on('before-input-event', handler);
    return this.trackDisposer(() => webContents.removeListener('before-input-event', handler));
  }

  registerPluginView(
    webContents: WebContents,
    instanceActions: Record<string, (...args: any[]) => void>,
  ): Disposer {
    const handler = (_e: Electron.Event, input: Electron.Input) => {
      if (input.type !== 'keyDown') return;
      for (const action of this.getActions('plugin-view')) {
        for (const binding of action.bindings) {
          if (this.matchBinding(binding, input)) {
            if (binding.preventDefault ?? false) _e.preventDefault();
            instanceActions[action.actionId]?.();
            return;
          }
        }
      }
    };
    webContents.on('before-input-event', handler);

    // 兜底：webContents 销毁时自动清理
    const onDestroyed = () => disposer();
    webContents.on('destroyed', onDestroyed);

    const disposer = this.trackDisposer(() => {
      webContents.removeListener('before-input-event', handler);
      webContents.removeListener('destroyed', onDestroyed);
    });
    return disposer;
  }

  // ── 生命周期 ──

  /** 注销本 Registry 注册过的全部 listener */
  dispose(): void {
    // 先注销 globalShortcut
    this.activeBindings.forEach(a => globalShortcut.unregister(a));
    this.activeBindings = [];
    // 再跑所有 disposer
    this.disposers.forEach(d => d());
    this.disposers = [];
  }

  // ── 内部 ──

  private trigger(actionId: string): void {
    this.actionHandlers.get(actionId)?.();
  }

  private trackDisposer(d: Disposer): Disposer {
    this.disposers.push(d);
    return d;                           // 调用者也可以独立调用
  }

  /**
   * 匹配逻辑：精确 AND
   * - input.type === 'keyDown'
   * - binding 列出的修饰键必须 true；未列出的必须 false
   * - 单字符 key 大小写归一后比较
   */
  private matchBinding(binding: ShortcutBinding, input: Electron.Input): boolean {
    if (input.key.toLowerCase() !== binding.key.toLowerCase()) return false;
    if (this.mod(input.control)  !== (binding.modifiers.ctrl ?? false)) return false;
    if (this.mod(input.meta)     !== (binding.modifiers.meta ?? false)) return false;
    if (this.mod(input.alt)      !== (binding.modifiers.alt  ?? false)) return false;
    if (this.mod(input.shift)    !== (binding.modifiers.shift ?? false)) return false;
    return true;
  }

  /** globalShortcut 的输入没有 type 字段，用前 normalize */
  private mod(v: boolean | undefined): boolean {
    return Boolean(v);
  }

  private buildAccelerator(binding: ShortcutBinding): string {
    const parts: string[] = [];
    if (binding.modifiers.ctrl)  parts.push('Ctrl');
    if (binding.modifiers.meta)  parts.push('Cmd');
    if (binding.modifiers.alt)   parts.push('Alt');
    if (binding.modifiers.shift) parts.push('Shift');
    parts.push(binding.key === ' ' ? 'Space' : binding.key);
    return parts.join('+');
  }
}
```

### handler 注册策略

| Scope | 注册方式 | 原因 |
|-------|----------|------|
| System / MainWindow | 全局 `onAction(id, fn)` | singleton scope，只注册一次 |
| PluginView | 实例级 `registerPluginView(wc, { id: fn })` | 每个 view 有自己的 runtimeId，互不覆盖 |
| menu / renderer-document | 不注册 handler | menu 只展示 accelerator；renderer 通过 IPC 自行绑定 |

### matchBinding 语义

- 只匹配 `input.type === 'keyDown'`（`globalShortcut` 无 type 字段，跳过此检查）
- 修饰键为**精确 AND**：binding.modifiers 中标为 `true` 的修饰键，input 中必须为 `true`；标注为 `false` 或未标注的修饰键，input 中必须为 `false`
- 单字符 key 通过 `.toLowerCase()` 归一后比较
- 匹配成功后，`preventDefault` 默认为 `false`（renderer-document 默认 `true`）

## 集成示例

### main/index.ts（启动顺序明确）

```typescript
// 1. 先创建 Registry 和 RuntimeManager（此时 coordinator 尚未存在）
const shortcutRegistry = new ShortcutRegistry();
const runtimeManager = new RuntimeManager(pluginManager, windowManager, pluginPreloadPath);

// 2. 创建 coordinator
const coordinator = new RuntimeCoordinator(runtimeManager, hostRegistry, pluginManager);

// 3. 给 RuntimeManager 注入 pluginView 快捷键工厂（闭包捕获 coordinator）
runtimeManager.setPluginViewShortcutHandler((runtimeId, webContents) => {
  shortcutRegistry.registerPluginView(webContents, {
    'plugin:detach': () => coordinator.moveToHost(runtimeId, 'floating'),
  });
});

// 4. 再 startAll（startAll 内部调用 shortcutHandler）
runtimeManager.startAll();
```

`RuntimeManager` 新增的方法：

```typescript
class RuntimeManager {
  private pluginViewShortcutHandler:
    ((runtimeId: string, wc: WebContents) => void) | null = null;

  setPluginViewShortcutHandler(
    fn: (runtimeId: string, wc: WebContents) => void,
  ): void {
    this.pluginViewShortcutHandler = fn;
  }
}
```

快捷键定义注册在 createMainWindow 之后：

```typescript
shortcutRegistry.define([
  {
    actionId: 'window:toggle',
    scope: 'system',
    description: '切换主窗口显示',
    bindings: [
      { id: 'mac', key: 'Space', modifiers: { meta: true }, platforms: ['darwin'] },
      { id: 'win', key: 'Space', modifiers: { alt: true },  platforms: ['win32', 'linux'] },
    ],
  },
  {
    actionId: 'plugin:detach',
    scope: 'main-window',
    description: '分离当前插件（搜索框焦点时）',
    bindings: [
      { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
      { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32', 'linux'] },
    ],
  },
  {
    actionId: 'plugin:detach',
    scope: 'plugin-view',
    description: '分离当前插件（插件焦点时）',
    bindings: [
      { id: 'mac', key: 'd', modifiers: { meta: true }, platforms: ['darwin'] },
      { id: 'win', key: 'd', modifiers: { ctrl: true }, platforms: ['win32', 'linux'] },
    ],
  },
  // RendererDocument 的快捷键也在这定义，renderer 通过 IPC 消费
  {
    actionId: 'shell:escape',
    scope: 'renderer-document',
    description: '逐级关闭',
    bindings: [
      { id: 'default', key: 'Escape', modifiers: {}, preventDefault: true },
    ],
  },
  // ... shell:navigate-up/down/left/right/execute
]);

shortcutRegistry.onAction('window:toggle', () => {
  if (windowManager.isVisible()) windowManager.hide();
  else windowManager.show();
});

shortcutRegistry.onAction('plugin:detach', () => {
  // MainWindow scope — 需要扫描 launcher-host
  for (const rt of runtimeManager.getAll()) {
    const host = runtimeManager.getHostFor(rt.info.id);
    if (host?.id === 'launcher-host') {
      coordinator.moveToHost(rt.info.id, 'floating');
      return;
    }
  }
});

shortcutRegistry.registerSystemGlobal();
shortcutRegistry.registerMainWindow(win.webContents);
```

### RuntimeManager.createRuntime（disposer 追踪 + destroyed 兜底）

```typescript
createRuntime(pluginId: string): PluginRuntime | null {
  // ...
  const runtime = { info: { id: runtimeId } };

  const disposer = this.pluginViewShortcutHandler?.(runtimeId, view.webContents);
  if (disposer) {
    entry.pluginViewShortcutDisposer = disposer;
  }

  // webContents.destroyed 兜底已经在 registerPluginView 内部处理
}

destroy(runtimeId: string): void {
  const entry = this.entries.get(runtimeId);
  // 先注销快捷键
  entry?.pluginViewShortcutDisposer?.();
  // 再销毁 runtime
  // ...
}
```

### RuntimeCoordinator.showPluginMenu

```typescript
const accel = this.shortcutRegistry.getAccelerator('plugin:detach', {
  scope: 'main-window',  // 明确 scope 消除歧义
});
```

### Renderer useKeyboard

IPC 新增 `getShortcutDefs(scope: 'renderer-document'): ShortcutActionDef[]`，renderer 侧消费：

```typescript
useKeyboard({
  actions: {
    'shell:escape': () => onEscape(),
    'shell:execute': () => onExecuteItem(...),
    'shell:navigate-up': () => setSelectedIndex(navigationMap.up),
    // ...
  },
});
```

## 迁移步骤

### Step 1：新建文件 + 纯函数验证
- 创建 `packages/shared/src/shortcut/types.ts`
- 创建 `packages/host/src/window/shortcut-registry.ts`
- 实例化 ShortcutRegistry，注册定义、注入 handler
- **不挂载 listener**（不调 `registerSystemGlobal` / `registerMainWindow`）
- 编写单元测试验证：`define` + `matchBinding` + `buildAccelerator` + `getAccelerator`
- 旧代码保持不动，无功能变化

### Step 2：按 scope 原子切换
- 先切 **System Global**：调 `registerSystemGlobal()`，同时删除 `shortcutManager` 旧代码
- 再切 **MainWindow**：调 `registerMainWindow(win.webContents)`，同时删除 main/index.ts 里的 inline `before-input-event` handler
- 再切 **PluginView**：注入 `setPluginViewShortcutHandler`，删除 `runtimeManager.detachRequested` callback 和 runtime-manager.ts 里的 inline `before-input-event` handler
- 每步独立验证，出错可回退单个 scope

### Step 3：Renderer 侧
- IPC 新增 `getShortcutDefs`
- `useKeyboard` 改为消费 ShortcutActionDef 列表
- `showPluginMenu` 改为读 `getAccelerator`

## 文件变化

```
新增:
  packages/shared/src/shortcut/types.ts
  packages/host/src/window/shortcut-registry.ts

删除:
  packages/host/src/window/shortcut-manager.ts

修改:
  apps/desktop/src/main/index.ts
  packages/host/src/runtime/runtime-manager.ts
  packages/host/src/runtime/runtime-coordinator.ts
  packages/host/src/index.ts                            (导出变更)
  packages/shared/src/api/internal.ts                   (新增 IPC 方法)
  apps/desktop/src/renderer/pages/shell/hooks/useKeyboard.ts
  apps/desktop/src/renderer/pages/shell/Shell.tsx
```

## 未涉及

- **GridTile 的 onKeyDown**（Enter / Space）不属于 Registry 管理范围，保持不变。
- **Renderer 侧导航逻辑**（NavigationMap）不搬移，只是快捷键匹配方式从硬编码 switch-case 改为 binding 匹配。
