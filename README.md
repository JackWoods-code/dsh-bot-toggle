# dsh-bot-toggle（v0.3.0）

一枚常驻的 **Bot / ADE** 分段开关，用来在 ds-bot 的两种界面之间切换，**ds-bot 插件保持启用**：

- **Bot** = ds-bot 的 Bot 界面（长期存活 Bot 团队那套界面）
- **ADE** = 经典 DSH 界面（宿主自己的界面）

适合频繁在两种界面之间来回切换的场景：开关常驻，一次点击完成切换。

## 安装

前提：ds-bot 已安装并启用。

- 从 GitHub：`dsh plugin --profile desktop add github:JackWoods-code/dsh-bot-toggle`，或在设置 → 插件里添加该仓库。
- 本地 tgz：设置 → 插件 → 添加插件，选 `dsh-bot-toggle-0.3.0.tgz`。

装好后如果提示「下次启动生效」，重启 DSH。

## 使用

- 点 `Bot` 切到 Bot 界面，点 `ADE` 切回经典界面；当前模式会高亮。
- 拖动胶囊可移动位置（记在 localStorage `dsh-bot-toggle:pos`）；右键复位到右侧居中。
- 快捷键 `Alt+Shift+B` 在两种界面间切换。

## 排错

打开 DevTools 控制台（设置 → 账号 → 开发者工具）：

```js
__botToggle.status()        // { version, mode, painted, busy, mounted, lastError }
__botToggle.switchTo("bot") // 手动切到 Bot 界面
__botToggle.switchTo("classic")
__botToggle.reset()         // 位置复位
```

日志前缀为 `[bot-toggle]`。

## 已知限制

- 这是界面层切换，不卸载 ds-bot：普通会话的工具表仍包含 ds-bot 的工具（如 `list_bots`、`message_bot`）。
- 切换依赖 ds-bot 自己渲染的按钮与菜单（`.bt-return` / `.bt-account`），ds-bot 大版本升级后可能需要适配。
- 两种界面的 DOM 都探测不到时，胶囊自动隐藏。

## 兼容

- DSH Desktop 0.2.1-rc.2 / 0.2.1-rc.3
- ds-bot 0.2.2（实测）

## 卸载

设置 → 插件 → `dsh-bot-toggle` → 关闭或移除。卸载不会影响 ds-bot 的数据（`~/.dsh/bot/`）。
