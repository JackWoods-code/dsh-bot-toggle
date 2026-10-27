# dsh-bot-toggle

![CI](https://github.com/JackWoods-code/dsh-bot-toggle/actions/workflows/ci.yml/badge.svg)
![release](https://img.shields.io/github/v/release/JackWoods-code/dsh-bot-toggle)
![license](https://img.shields.io/github/license/JackWoods-code/dsh-bot-toggle)

一枚常驻的 **Bot / ADE** 分段开关，用来在 DSH Web 界面的两套界面之间切换，**ds-bot 插件保持启用**：

- **Bot** = [ds-bot](https://github.com/Fei2411/DS-Bot) 的 Bot 界面（长期存活 Bot 团队那套界面）
- **ADE** = 经典 DSH 界面（宿主自己的界面）

[English](README.md)

<img src="assets/icon-180.png" width="96" alt="dsh-bot-toggle 图标">

## 为什么需要它

ds-bot 自带两套界面，却没有一个常驻开关：在 Bot 界面里只能通过它的账号菜单切回经典界面，
在经典界面里则要点它侧栏底部的「DS Bot」返回按钮。这个插件在屏幕右缘放一枚两段式胶囊，
两套界面里都在，点一下就能切。

它是 ds-bot 之上的一层界面工具，不是替代品：切换全程 ds-bot 都保持加载。

## 功能

- 点 **Bot** / **ADE** 一键切换，当前界面高亮
- 固定浮层，两套界面里都可见，且避开正文区域
- 可拖动到任意位置并吸附边缘；右键复位到右侧居中（位置记忆在 localStorage）
- 快捷键 `Alt+Shift+B`
- 4 秒无交互自动变淡，鼠标移入恢复；尊重 `prefers-reduced-motion`
- 界面文案中英双语，跟随页面或浏览器语言
- ds-bot 兼容性探测：能拿到时报告是否加载、版本号；控件缺失时胶囊转琥珀色并说明原因，
  而不是无声消失

## 环境要求

- DSH Desktop `0.2.1-rc.2` / `0.2.1-rc.3`（实测）
- ds-bot 已安装并启用（实测 `0.2.2`）

## 安装

DSH 里：**设置 → 插件 → 添加插件**，然后二选一

- GitHub 源：`github:JackWoods-code/dsh-bot-toggle`
- Releases 里的 `dsh-bot-toggle-<version>.tgz`（或自己 `npm pack`）

命令行等价写法：`dsh plugin --profile desktop add github:JackWoods-code/dsh-bot-toggle`。

插件页提示「下次启动生效」时重启 DSH。

## 使用

- 点 **Bot** 进入 ds-bot 的 Bot 界面，点 **ADE** 回到经典 DSH 界面。
- 拖动胶囊可移动位置；右键复位到右缘居中。
- 任意位置按 `Alt+Shift+B` 切换。

## 排错

打开 DevTools 控制台（设置 → 账号 → 开发者工具）：

```js
__botToggle.status()
// { version, mode, painted, lang, busy, mounted, lastError,
//   dsBot: { loaded, version, compatible } }
__botToggle.probe()          // 只返回 ds-bot 探测结果
__botToggle.switchTo("bot")  // 反方向用 "classic"
__botToggle.toggle()
__botToggle.reset()          // 位置复位
```

日志前缀为 `[bot-toggle]`。

## 兼容性探测

ds-bot 没有公开的版本 API——`window.dshBot` 只是它的主题注册中心（`registerShape` /
`registerTheme` / `themes` / `shapes`），不带版本号。因此探测按以下顺序读取：

1. `window.__DSH_BOOT__.entries` 里 `id` / `name` / `package` 为 `ds-bot` 的条目
   （以及它可能带的 `version`、`pkg.version`、`manifest.version`）；
2. `window.dshBot.version`（为未来预留）；
3. `document.body.dataset.dsBotVersion`（为未来预留）。

如果 ds-bot 看起来已加载、但两套界面的控件都找不到，胶囊会转琥珀色，提示可能需要更新插件，
同时 `status().dsBot.compatible` 为 `false`。

## 已知限制

- **只切界面**：ds-bot 保持加载，普通会话的工具表里仍有 ds-bot 的工具
  （`list_bots`、`message_bot` 等）。要彻底卸载 ds-bot，请到插件页关掉它。
- 切换依赖 ds-bot 自己渲染的 DOM：`.bt-return`、`.bt-account`、`.bt-account-menu`
  以及本地化文案「切换经典 Agent 模式」。ds-bot 升级可能挪动这些，兼容性探测就是用来
  把这种变化暴露出来的。
- 两套界面都探测不到时，胶囊约 1.6 秒后自动隐藏。

## 开发

```sh
npm test        # DOM-stub 冒烟测试（node --test，无第三方依赖）
npm run check   # 语法检查：客户端 bundle、宿主入口、测试
```

结构：`lib/client.js` 是 Web 端 bundle，`lib/index.js` 是宿主入口（故意留空），
`cordis.patch.yml` 插入 `bot-toggle` 插件行。

## 许可证

MIT © 2026 JackWoods-code。与 DeepSeek、ds-bot 无隶属关系。
