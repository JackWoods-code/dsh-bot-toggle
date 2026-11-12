// dsh-bot-toggle — 浏览器侧（v0.4.5）。
//
// v0.4.5：适配 dsh-boot-suite 的开机动画。boot-suite 在页面解析阶段就注入全屏遮罩
// #dsh-startup-root（fixed inset:0，z-index 2147483000），和胶囊同层；胶囊后挂到 body，
// 所以开机动画播放期间胶囊会压在动画上。现在 refresh() 先看遮罩在不在，在场就隐藏胶囊、
// 不插顶栏入口；遮罩移除后一个轮询周期内自动恢复。
//
// v0.4.4：快捷键跨平台。以前用 event.key 判定 Alt+Shift+B，可 macOS 上 Option 会改变
// 输入的字符（Option+Shift+B 得到 "ı"），事件里的 key 永远不是 b，于是快捷键在 mac
// 上完全失效（Windows 的 Alt 不改字符，所以只有 Windows 好使）。现在按物理键位
// event.code === "KeyB" 判定，与键盘布局无关；macOS 额外接受 ⌘+Shift+B；忽略长按
// 自动重复与输入法合成中的按键；提示文案按平台显示 ⌥⇧B / ⌘⇧B。
//
// 作用：在 ds-bot 的两套界面之间放一枚常驻的分段开关，ds-bot 插件始终加载：
//   Bot = ds-bot 的 Bot 界面；ADE = 经典 DSH 界面。
//
// 切换依赖 ds-bot 自己渲染的控件（见下），ds-bot 升级后可能需要适配。
// 不伪造任何状态；唯一例外是兜底（见下）会写它持久化的 localStorage：
//   经典 → Bot：点侧栏底部的 .bt-return（BotReturn，仅 agent 模式存在）
//   Bot → 经典（v0.4.2 适配 ds-bot 0.3.x）：点 .bt-account 打开账号菜单 →
//   点设置项打开设置页（默认落在 General）→ 点 Classic Agent mode 行的
//   「切换」按钮。0.3.x 起账号菜单里不再有「切换经典 Agent 模式」，官方入口
//   挪到了设置 → General → 模式（Mode）里；设置项本身在 0.3.2 改名为「设置/Settings」。
//   兜底：DOM 路径两连败时，写 ds-bot 自己的持久化键 ds-bot:surface（bot/agent）
//   并 location.reload()——ds-bot 启动时读它决定进哪个界面，等价于它自己的
//   setSurface 加重开页面。代价是整页刷新，所以只作最后手段。
//
// v0.4.2 另在 ds-bot 顶栏（.bt-side-top，窄侧栏为 .bt-rail-top）注入一枚常驻
// 「ADE」大入口，用 refresh 的轮询守护对抗 React 重渲染清除；经典界面没有
// 顶栏容器，此时靠悬浮胶囊和 .bt-return。
//
// v0.4.3：切换是模拟点击、会真实打开账号菜单和设置页，用户能看到它们闪一下。
// 现在切经典前先注入一段临时样式，把 .bt-account-menu / .bt-settings-layer 压成
// display:none（元素仍在 DOM 里，程序化 click 照常生效），切完或失败后延迟移除，
// 视觉上无感；失败时再补一发 Escape 尽力收起残留弹层。
//
// v0.4.0 起：界面文案中英双语（跟随页面/浏览器语言）；会探测 ds-bot 是否加载、
// 以及能拿到时的版本号——控件缺失时胶囊转琥珀色并说明原因，而不是直接消失。
//
// v0.2.0 的界面改动（相对 0.1.0 的两枚纯文字小按钮）：
//   · 两段式胶囊：图标 + 文字，白色滑块跟着当前界面滑动；磨砂底、细描边、柔和投影
//   · 悬停/聚焦时向左弹出提示（含快捷键）；切换失败时同一位置显示原因并轻抖一下
//   · 4 秒无交互自动变淡、不挡视线，鼠标移入立即恢复
//   · 拖动后吸附到最近边缘；右键复位到默认位置（右侧居中）
//   · 切换期间滑块呼吸提示，重复点击被忽略；尊重 prefers-reduced-motion
//
// 本文件是标准的 DSH 客户端插件 bundle：外层用 window.__ModuleLoader__.load 包装，
// factory 内是普通 CJS，exports.apply 交给宿主调用，返回的清理函数在插件卸载时执行。
(function (root) {
  if (root === null || typeof root !== "object") return;
  if (!root.__ModuleLoader__ || typeof root.__ModuleLoader__.load !== "function") return;

  root.__ModuleLoader__.load({
    id: "dsh-bot-toggle",
    factory: (require) => {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

      var VERSION = "0.4.5";
      var LOG = "[bot-toggle]";
      var POS_KEY = "dsh-bot-toggle:pos";
      var SURFACE_KEY = "ds-bot:surface"; // ds-bot 自己的界面持久化键（bot/agent）
      var STEALTH_ID = "dsst-stealth-style"; // 切换期间临时压掉弹层的样式节点 id
      var STEALTH_CSS = ".bt-account-menu,.bt-settings-layer{display:none!important}";
      var BOT_MARKERS = ".bt-account, .bt-side-top"; // Bot 界面（侧栏账号按钮 / 侧栏顶部行）
      var CLASSIC_MARKER = ".bt-return"; // 经典界面（ds-bot 的「DS Bot」返回按钮）
      var SPLASH_SELECTOR = "#dsh-startup-root"; // dsh-boot-suite 的开机动画遮罩（全屏、与胶囊同 z-index）
      var TICK_MS = 500; // 轮询界面状态的间隔：只读 DOM，开销可忽略
      var HIDE_AFTER_MS = 1600; // 连续这么久探测不到界面才隐藏（避免切换过渡时闪一下）
      var IDLE_AFTER_MS = 4000; // 这么久没有交互就变淡
      var EDGE_MARGIN = 12; // 默认位置与吸附后距边缘的距离
      var SNAP_ZONE = 80; // 松手时离边缘多近就吸附过去

      // 界面文案跟随页面语言：中文环境用中文，其余用英文。
      var LANG = (function () {
        try {
          var lang =
            (document.documentElement && document.documentElement.lang) ||
            (root.navigator && root.navigator.language) ||
            "en";
          return /^zh\b/i.test(String(lang).trim()) ? "zh" : "en";
        } catch (_) {
          return "en";
        }
      })();

      // 快捷键：Windows/Linux 是 Alt+Shift+B；macOS 的 Alt 即 ⌥，另加 ⌘+Shift+B，
      // 因为 mac 上 Option 常被系统输入法占用。提示文案跟着平台走，免得 mac 用户去
      // 找一个不存在的 Alt 键。
      var IS_MAC = (function () {
        try {
          var nav = (root && root.navigator) || {};
          var platform = String(
            (nav.userAgentData && nav.userAgentData.platform) || nav.platform || nav.userAgent || ""
          );
          return /mac|iphone|ipad|ipod/i.test(platform);
        } catch (_) {
          return false;
        }
      })();
      var HOTKEY_LABEL = IS_MAC ? "⌥⇧B / ⌘⇧B" : "Alt+Shift+B";

      var MESSAGES = {
        zh: {
          pillAria: "界面切换：Bot（Bot 界面）/ ADE（经典 DSH 界面）",
          botAria: "切换到 Bot 界面（ds-bot）",
          botTip: "Bot 界面 · " + HOTKEY_LABEL + " 切换",
          classicAria: "切换到经典 DSH 界面",
          classicTip: "经典 DSH 界面 · " + HOTKEY_LABEL + " 切换",
          resetDone: "已复位到默认位置",
          errNoDsBot: "ds-bot 未加载",
          warnNoDsBot: "ds-bot 没有加载（插件页里未启用），没有可切换的界面。",
          errNoBack: "找不到返回 DS Bot 的按钮（.bt-return）",
          errNoAccount: "找不到 ds-bot 的账号按钮（.bt-account）",
          errNoSwitch: "设置页里没找到「经典 Agent 模式 · 切换」按钮",
          errNoMenu: "账号菜单里没有「设置」项（ds-bot 0.2.x 叫「Bot 设置」）",
          errNoReload: "兜底切换失败：无法写入 ds-bot:surface",
          bigAria: "切换到经典 DSH 界面（ADE）",
          bigTip: "经典 DSH 界面（ADE）· " + HOTKEY_LABEL + " 可切回 Bot",
          notFlipped: function (target) { return "切换未生效（目标：" + target + "）"; },
          incompat: function (version) {
            var suffix = version ? "（ds-bot " + version + "）" : "";
            return "ds-bot 已加载但找不到界面控件，可能需要更新 dsh-bot-toggle" + suffix;
          },
        },
        en: {
          pillAria: "Surface switch: Bot (ds-bot) / ADE (classic DSH UI)",
          botAria: "Switch to the Bot surface (ds-bot)",
          botTip: "Bot surface · " + HOTKEY_LABEL,
          classicAria: "Switch to the classic DSH surface",
          classicTip: "Classic DSH surface · " + HOTKEY_LABEL,
          resetDone: "Position reset",
          errNoDsBot: "ds-bot is not loaded",
          warnNoDsBot: "ds-bot is not loaded (enable it on the Plugins page); nothing to switch.",
          errNoBack: "The DS Bot return button (.bt-return) is missing",
          errNoAccount: "The ds-bot account button (.bt-account) is missing",
          errNoSwitch: 'No "Classic Agent mode → Switch" button found on the settings page',
          errNoMenu: 'No "Settings" item in the account menu (named "Bot settings" before ds-bot 0.3.2)',
          errNoReload: "Fallback switch failed: cannot write ds-bot:surface",
          bigAria: "Switch to the classic DSH surface (ADE)",
          bigTip: "Classic DSH surface (ADE) · " + HOTKEY_LABEL + " switches back to Bot",
          notFlipped: function (target) { return "Switch did not take effect (target: " + target + ")"; },
          incompat: function (version) {
            var suffix = version ? " (ds-bot " + version + ")" : "";
            return "ds-bot is loaded but its surface controls were not found; dsh-bot-toggle may need an update" + suffix;
          },
        },
      };
      var STR = MESSAGES[LANG];

      var ICON_BOT = [
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"',
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
        '<rect x="3.2" y="5.6" width="9.6" height="7.4" rx="2.4"/>',
        '<path d="M8 3.4v2.2"/><circle cx="8" cy="2.5" r="0.9" fill="currentColor" stroke="none"/>',
        '<circle cx="6.1" cy="9" r="0.85" fill="currentColor" stroke="none"/>',
        '<circle cx="9.9" cy="9" r="0.85" fill="currentColor" stroke="none"/>',
        '<path d="M6.6 11.2h2.8"/>',
        "</svg>",
      ].join("");

      var ICON_CLASSIC = [
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"',
        ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
        '<path d="M5.4 4.8 2.2 8l3.2 3.2"/>',
        '<path d="M10.6 4.8 13.8 8l-3.2 3.2"/>',
        '<path d="M9.1 3.6 6.9 12.4"/>',
        "</svg>",
      ].join("");

      function log() {
        try {
          console.log.apply(console, [LOG].concat(Array.prototype.slice.call(arguments)));
        } catch (_) {}
      }

      function warn() {
        try {
          console.warn.apply(console, [LOG].concat(Array.prototype.slice.call(arguments)));
        } catch (_) {}
      }

      // 当前界面：bot | classic | null（null = ds-bot 没加载，或正处在过渡态）
      function detectMode() {
        try {
          if (document.querySelector(BOT_MARKERS) !== null) return "bot";
          if (document.querySelector(CLASSIC_MARKER) !== null) return "classic";
          // 兜底：ds-bot 客户端已加载但界面标记还没渲染出来时，读它自己的持久化值。
          if (root.dshBot !== undefined) {
            var stored = null;
            try {
              stored = root.localStorage.getItem("ds-bot:surface");
            } catch (_) {}
            return stored === "agent" ? "classic" : "bot";
          }
        } catch (_) {}
        return null;
      }

      // ds-bot 版本探测：它没有公开版本号 API，只能按可用来源依次尝试。
      // 已知 window.dshBot 是主题注册 hub（registerShape/registerTheme/themes/shapes），不含 version。
      function bootEntries() {
        try {
          var boot = root.__DSH_BOOT__;
          var entries = boot && boot.entries;
          if (!entries) return [];
          if (Array.isArray(entries)) return entries;
          if (typeof entries === "object") {
            return Object.keys(entries).map(function (key) {
              return entries[key];
            });
          }
        } catch (_) {}
        return [];
      }

      function probeDsBot() {
        var entry = null;
        var list = bootEntries();
        for (var i = 0; i < list.length; i += 1) {
          var item = list[i];
          if (!item || typeof item !== "object") continue;
          if (item.id === "ds-bot" || item.name === "ds-bot" || item.package === "ds-bot") {
            entry = item;
            break;
          }
        }
        var version = null;
        if (entry !== null) {
          version =
            entry.version ||
            (entry.pkg && entry.pkg.version) ||
            (entry.manifest && entry.manifest.version) ||
            null;
        }
        if (version === null && root.dshBot && typeof root.dshBot.version === "string") {
          version = root.dshBot.version;
        }
        if (version === null) {
          try {
            if (document.body && document.body.dataset && document.body.dataset.dsBotVersion) {
              version = document.body.dataset.dsBotVersion;
            }
          } catch (_) {}
        }
        var mode = detectMode();
        var loaded =
          entry !== null ||
          root.dshBot !== undefined ||
          document.querySelector(BOT_MARKERS) !== null ||
          document.querySelector(CLASSIC_MARKER) !== null;
        return {
          loaded: loaded,
          version: version === null ? null : String(version),
          compatible: mode !== null,
        };
      }

      // ds-bot 0.3.x 起账号菜单里不再有「切换经典 Agent 模式」，官方入口挪到了
      // 设置 → 通用（General）→ 模式（Mode）→ Classic Agent mode 行的「切换」按钮。
      // 打开路径：点 .bt-account 弹账号菜单 → 点设置项打开设置层（默认落在 General 页）。
      // 设置项文案随 ds-bot 版本变化：0.2.x–0.3.1 是「Bot 设置 / Bot settings」，
      // 0.3.2 起只剩「设置 / Settings」。两种都认，且不依赖菜单顺序，也就不会误点
      // 未登录时菜单里出现的「登录 DeepSeek 账号」（0.4.1 的 bug 根源）。
      function menuSettingsItem() {
        var textRe = /(设置|Settings)/i;
        var menus = document.querySelectorAll(".bt-account-menu");
        for (var m = 0; m < menus.length; m += 1) {
          var items = menus[m].querySelectorAll('[role="menuitem"]');
          for (var i = 0; i < items.length; i += 1) {
            if (textRe.test((items[i].textContent || "").trim())) return items[i];
          }
        }
        return null;
      }

      // 设置 → General 页里的 Classic Agent mode 行：文案匹配行标签，
      // 再点同一行里文案恰好是「切换 / Switch」的 .bt-soft 按钮。
      function findSwitchButton() {
        var rowRe = /(经典\s*Agent\s*模式|Classic\s+Agent\s*mode)/i;
        var clickRe = /^(切换|Switch)$/;
        var scroll = document.querySelector(".bt-settings-scroll");
        if (scroll === null) return null;
        var rows = scroll.querySelectorAll(".bt-set-row");
        for (var r = 0; r < rows.length; r += 1) {
          var copy = rows[r].querySelector(".bt-set-copy");
          if (copy === null || !rowRe.test((copy.textContent || "").trim())) continue;
          var buttons = rows[r].querySelectorAll("button.bt-soft");
          for (var b = 0; b < buttons.length; b += 1) {
            if (clickRe.test((buttons[b].textContent || "").trim())) return buttons[b];
          }
        }
        return null;
      }

      // 设置层可能开在别的页上：先把左侧导航切回 General（通用）。
      function findGeneralNavItem() {
        var re = /^(通用|General)$/;
        var items = document.querySelectorAll(".bt-settings-nav .bt-settings-item");
        for (var i = 0; i < items.length; i += 1) {
          if (re.test((items[i].textContent || "").trim())) return items[i];
        }
        return null;
      }

      function waitFor(predicate, timeoutMs) {
        return new Promise(function (resolve) {
          var started = Date.now();
          (function tick() {
            var value = null;
            try {
              value = predicate();
            } catch (_) {}
            if (value) {
              resolve(value);
              return;
            }
            if (Date.now() - started >= timeoutMs) {
              resolve(null);
              return;
            }
            root.setTimeout(tick, 60);
          })();
        });
      }

      // 最后的兜底：ds-bot 没把 setSurface 暴露到 window（只在 React 组件树里传），
      // 但它把当前界面持久化在 localStorage 的 ds-bot:surface（bot/agent）里、启动时
      // 读回来——写键 + 刷新等价于它自己的 setSurface 加重开页面。代价是整页刷新，
      // 所以只在 DOM 路径失败后才走。返回 true 表示已触发重载。
      function persistAndReload(surface) {
        try {
          root.localStorage.setItem(SURFACE_KEY, surface);
        } catch (_) {
          warn(STR.errNoReload);
          return false;
        }
        log("persisted", SURFACE_KEY, "=", surface, "; reloading page");
        root.location.reload();
        return true;
      }

      // 切换期间给弹层「隐身」：注入临时样式把账号菜单和设置页压成 display:none。
      // 元素仍在 DOM 里，querySelector 找得到、程序化 click 照常触发，只是不画出来。
      function stealthOn() {
        try {
          if (document.getElementById(STEALTH_ID) !== null) return;
          var node = document.createElement("style");
          node.id = STEALTH_ID;
          node.textContent = STEALTH_CSS;
          (document.head || document.documentElement).appendChild(node);
        } catch (error) {
          warn("stealth on failed:", error && error.message ? error.message : error);
        }
      }

      // 延迟一帧多的时间再撤掉：React 提交 unmount 可能晚于我们的 finally。
      function stealthOff() {
        root.setTimeout(function () {
          try {
            var node = document.getElementById(STEALTH_ID);
            if (node !== null && node.parentNode !== null) node.parentNode.removeChild(node);
          } catch (_) {}
        }, 400);
      }

      // 失败时尽力收起可能残留的弹层（Escape 是设置层/菜单常用的关闭键）。
      function dismissPopups() {
        try {
          ["keydown", "keyup"].forEach(function (type) {
            document.dispatchEvent(
              new KeyboardEvent(type, {
                key: "Escape",
                code: "Escape",
                keyCode: 27,
                which: 27,
                bubbles: true,
                cancelable: true,
              })
            );
          });
        } catch (_) {}
      }

      // 执行一次界面切换。失败时抛错，由调用方统一提示。
      function switchTo(target) {
        if (target === "bot") {
          var back = document.querySelector(CLASSIC_MARKER);
          if (back === null) throw new Error(STR.errNoBack);
          back.click();
          return Promise.resolve();
        }

        var account = document.querySelector(".bt-account");
        if (account === null) throw new Error(STR.errNoAccount);

        // 设置层已开着（上次尝试残留或用户自己开着）→ 直接定位开关按钮。
        if (document.querySelector(".bt-settings-layer") !== null) {
          var nav = findGeneralNavItem();
          if (nav !== null && nav.getAttribute("aria-current") !== "page") nav.click();
          return waitFor(findSwitchButton, 2000).then(function (button) {
            if (button === null) throw new Error(STR.errNoSwitch);
            button.click();
          });
        }

        account.click();
        return waitFor(menuSettingsItem, 1500)
          .then(function (item) {
            if (item === null) throw new Error(STR.errNoMenu);
            item.click();
            return waitFor(findSwitchButton, 2500);
          })
          .then(function (button) {
            if (button === null) throw new Error(STR.errNoSwitch);
            button.click();
          });
      }

      var STYLES = [
        // 胶囊本体：固定定位 + 磨砂底。放在 body 直下，两个界面里都能浮在最上层。
        ".dsst{--dsst-ink:#1b1b1f;--dsst-dim:rgba(27,27,31,.5);--dsst-line:rgba(20,20,26,.1);position:fixed;z-index:2147483000;display:flex;align-items:center;padding:4.5px;border:1px solid var(--dsst-line);border-radius:999px;background:rgba(250,248,244,.88);box-shadow:0 18px 48px -15px rgba(20,20,30,.3),0 3px 12px rgba(20,20,30,.12);-webkit-backdrop-filter:blur(18px) saturate(1.2);backdrop-filter:blur(18px) saturate(1.2);font:600 13.5px/1 ui-sans-serif,-apple-system,'Segoe UI','PingFang SC',sans-serif;color:var(--dsst-ink);user-select:none;-webkit-user-select:none;touch-action:none;opacity:.96;transition:opacity .28s ease,box-shadow .2s ease,border-color .2s ease;}",
        ".dsst[hidden]{display:none}",
        // 空闲变淡：只降透明度，不缩尺寸，避免看起来像坏了。
        ".dsst[data-idle]{opacity:.4}",
        ".dsst:hover{opacity:1;box-shadow:0 21px 54px -15px rgba(20,20,30,.34),0 2px 8px rgba(20,20,30,.12)}",
        ".dsst[data-drag]{cursor:grabbing;box-shadow:0 27px 66px -18px rgba(20,20,30,.38)}",
        ".dsst[data-busy]{cursor:progress}",
        ".dsst[data-error]{border-color:rgba(216,72,72,.55);box-shadow:0 0 0 1.5px rgba(216,72,72,.45),0 18px 48px -15px rgba(20,20,30,.3)}",
        // 兼容性告警：ds-bot 已加载但找不到控件时，用琥珀色提示，而不是消失。
        ".dsst[data-compat]{border-color:rgba(196,132,24,.55);box-shadow:0 0 0 1.5px rgba(196,132,24,.45),0 18px 48px -15px rgba(20,20,30,.3)}",
        ".dsst[data-shake]{animation:dsst-shake .34s cubic-bezier(.36,.07,.19,.97)}",
        "@keyframes dsst-shake{0%,100%{transform:translate(0)}15%{transform:translate(-3px,0)}30%{transform:translate(3px,0)}45%{transform:translate(-3px,0)}60%{transform:translate(3px,0)}80%{transform:translate(-1.5px,0)}}",
        // 滑块：43px = 按钮宽，切换时只动 transform，跟手。
        ".dsst-thumb{position:absolute;left:4.5px;top:4.5px;bottom:4.5px;width:54px;border-radius:999px;background:#fff;box-shadow:0 1.5px 4.5px rgba(20,20,30,.18),0 0 0 1px rgba(20,20,30,.04);transition:transform .24s cubic-bezier(.22,.61,.36,1),opacity .2s ease}",
        ".dsst[data-mode='classic'] .dsst-thumb{transform:translateX(54px)}",
        ".dsst[data-busy] .dsst-thumb{animation:dsst-breathe 1.1s ease-in-out infinite}",
        "@keyframes dsst-breathe{0%,100%{opacity:.55}50%{opacity:1}}",
        ".dsst button{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:4.5px;width:54px;height:36px;margin:0;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsst-dim);font:inherit;letter-spacing:.05em;cursor:pointer;transition:color .16s ease}",
        ".dsst button:hover{color:var(--dsst-ink)}",
        ".dsst button[data-active]{color:var(--dsst-ink)}",
        ".dsst button:focus-visible{outline:2px solid rgba(27,27,31,.55);outline-offset:1px}",
        ".dsst svg{width:16.5px;height:16.5px;display:block;flex:none}",
        ".dsst-label{font-size:13.5px;font-weight:650;letter-spacing:.055em}",
        // 提示气泡：挂在胶囊左侧，不挡按钮，也不侵占正文。
        ".dsst-tip{position:absolute;right:calc(100% + 15px);top:50%;transform:translateY(-50%);z-index:1;max-width:360px;padding:9px 13.5px;border-radius:13.5px;background:#212126;color:#fff;font:500 15px/1.4 ui-sans-serif,-apple-system,'PingFang SC',sans-serif;letter-spacing:0;white-space:nowrap;box-shadow:0 15px 39px rgba(0,0,0,.28);opacity:0;pointer-events:none;transition:opacity .14s ease}",
        ".dsst[data-edge='left'] .dsst-tip{right:auto;left:calc(100% + 15px)}",
        ".dsst-tip[data-show]{opacity:1}",
        ".dsst-tip[data-tone='error']{background:#8f2f2f}",
        // 顶栏大入口：先给不带 color-mix 的兜底配色，支持 color-mix 的内核再用
        // 跟随文字色的半透明配色（深浅主题都不突兀）。
        ".dsst-big{display:inline-flex;align-items:center;gap:5px;height:28px;margin-left:10px;padding:0 10px 0 9px;border:1px solid rgba(127,127,127,.4);border-radius:999px;background:rgba(127,127,127,.08);color:inherit;font:600 12.5px/1 ui-sans-serif,-apple-system,'Segoe UI','PingFang SC',sans-serif;letter-spacing:.04em;cursor:pointer;flex:none;transition:box-shadow .16s ease,transform .16s ease}",
        ".dsst-big{border-color:color-mix(in srgb,currentColor 22%,transparent);background:color-mix(in srgb,currentColor 7%,transparent)}",
        ".dsst-big:hover{box-shadow:0 2px 10px rgba(127,127,127,.35);transform:translateY(-1px)}",
        ".dsst-big:active{transform:translateY(0)}",
        ".dsst-big:focus-visible{outline:2px solid rgba(127,127,127,.6);outline-offset:1px}",
        ".dsst-big svg{width:15px;height:15px;display:block;flex:none}",
        ".dsst-big-label{font-weight:700}",
        ".dsst-big[data-busy]{opacity:.65;pointer-events:none}",
        ".dsst-big-narrow{height:26px;margin-left:6px;padding:0 8px}",
        "@media (prefers-reduced-motion:reduce){.dsst,.dsst button,.dsst-thumb,.dsst-tip{transition:none}.dsst[data-shake]{animation:none}}",
      ].join("\n");

      function mount(ctx) {
        var disposed = false;
        var busy = false;
        var suppressClick = false;
        var mode = null; // 最近一次探测到的界面
        var lastPaint = null;
        var pill = null;
        var thumb = null;
        var tip = null;
        var topBtn = null; // 顶栏大入口（插在 React 子树里，可能被清掉重插）
        var style = null;
        var buttons = {};
        var tickTimer = null;
        var idleTimer = null;
        var tipTimer = null;
        var nullSince = 0;
        var drag = null;
        var hovered = false;
        var lastError = null;
        var compatWarned = false;

        // ---------- 绘制 ----------

        function paint() {
          if (pill === null || mode === null) return;
          if (lastPaint === mode) return;
          lastPaint = mode;
          pill.setAttribute("data-mode", mode);
          if (mode === "bot") buttons.bot.setAttribute("data-active", "");
          else buttons.bot.removeAttribute("data-active");
          if (mode === "classic") buttons.classic.setAttribute("data-active", "");
          else buttons.classic.removeAttribute("data-active");
          buttons.bot.setAttribute("aria-pressed", mode === "bot" ? "true" : "false");
          buttons.classic.setAttribute("aria-pressed", mode === "classic" ? "true" : "false");
        }

        function setVisible(visible) {
          if (pill === null) return;
          pill.hidden = !visible;
        }

        // dsh-boot-suite 的开机动画遮罩在页面解析阶段注入，和胶囊同 z-index（2147483000）
        // 且更早进入 DOM；不处理的话胶囊会压在动画上。遮罩在场期间不显示胶囊、也不插
        // 顶栏入口；它移除后（finish() 会摘掉节点）由 500ms 轮询自动恢复。
        function splashActive() {
          try {
            return document.querySelector(SPLASH_SELECTOR) !== null;
          } catch (_) {
            return false;
          }
        }

        function refresh() {
          if (splashActive()) {
            setVisible(false);
            return;
          }
          ensureTopButton();
          var next = detectMode();
          if (next !== null) {
            nullSince = 0;
            mode = next;
            compatWarned = false;
            if (pill !== null) {
              pill.removeAttribute("data-compat");
              pill.title = "";
            }
            setVisible(true);
            paint();
            return;
          }
          var probe = probeDsBot();
          if (probe.loaded) {
            // ds-bot 已加载、但两套界面的控件都找不到：多半是版本不兼容。保留胶囊并标黄。
            nullSince = 0;
            setVisible(true);
            if (pill !== null) {
              pill.setAttribute("data-compat", "");
              pill.title = STR.incompat(probe.version);
            }
            if (!compatWarned) {
              compatWarned = true;
              warn(STR.incompat(probe.version));
            }
            return;
          }
          if (pill !== null) {
            pill.removeAttribute("data-compat");
            pill.title = "";
            if (!pill.hidden) {
              if (nullSince === 0) nullSince = Date.now();
              else if (Date.now() - nullSince >= HIDE_AFTER_MS) setVisible(false);
            }
          }
          mode = null;
          lastPaint = null;
        }

        // ---------- 顶栏大入口 ----------
        // v0.4.2：在 ds-bot 顶栏放一枚显眼的「ADE」按钮（只有 Bot 界面有顶栏容器；
        // 经典界面里靠悬浮胶囊和 .bt-return）。按钮插在 React 管理的子树里，重渲染
        // 可能把它清掉——refresh 的 500ms 轮询顺带守护，发现没了就重插。
        function removeTopButton() {
          if (topBtn !== null && topBtn.parentNode !== null) topBtn.parentNode.removeChild(topBtn);
          topBtn = null;
        }

        function ensureTopButton() {
          if (disposed) return;
          var container = document.querySelector(".bt-side-top");
          var narrow = false;
          if (container === null) {
            container = document.querySelector(".bt-rail-top"); // 窄侧栏没有 bt-side-top
            narrow = true;
          }
          if (container === null) {
            if (topBtn !== null) removeTopButton();
            return;
          }
          if (topBtn !== null && topBtn.parentNode === container) return; // 完好
          if (topBtn !== null) removeTopButton();
          topBtn = document.createElement("button");
          topBtn.type = "button";
          topBtn.className = narrow ? "dsst-big dsst-big-narrow" : "dsst-big";
          topBtn.setAttribute("aria-label", STR.bigAria);
          topBtn.title = STR.bigTip;
          topBtn.innerHTML = ICON_CLASSIC + '<span class="dsst-big-label">ADE</span>';
          topBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            run("classic");
          });
          // brand 带 margin-right:auto，右侧按钮组从它后面开始；插在它后面就是
          // 右侧按钮组的第一枚，不挤占品牌区。
          var brand = container.querySelector(".bt-brand");
          if (brand !== null && brand.nextSibling !== null) {
            container.insertBefore(topBtn, brand.nextSibling);
          } else {
            container.appendChild(topBtn);
          }
          wake();
        }

        // ---------- 空闲变淡 ----------

        function wake() {
          if (pill !== null) pill.removeAttribute("data-idle");
          scheduleIdle();
        }

        function scheduleIdle() {
          if (idleTimer !== null) root.clearTimeout(idleTimer);
          idleTimer = root.setTimeout(function () {
            idleTimer = null;
            if (pill === null || drag !== null || hovered || busy) return;
            pill.setAttribute("data-idle", "");
          }, IDLE_AFTER_MS);
        }

        // 胶囊靠左半边时把提示放到右侧，贴边拖动也不会溢出屏幕。
        function updateTipSide() {
          if (pill === null) return;
          var rect = pill.getBoundingClientRect();
          var onLeft = rect.left + rect.width / 2 < root.innerWidth / 2;
          pill.setAttribute("data-edge", onLeft ? "left" : "right");
        }

        // ---------- 提示气泡 ----------

        function showTip(text, tone) {
          if (tip === null) return;
          if (tipTimer !== null) {
            root.clearTimeout(tipTimer);
            tipTimer = null;
          }
          tip.textContent = text;
          if (tone === "error") tip.setAttribute("data-tone", "error");
          else tip.removeAttribute("data-tone");
          tip.setAttribute("data-show", "");
        }

        function hideTip(force) {
          if (tip === null || tipTimer !== null) return;
          if (!force && tip.getAttribute("data-tone") === "error") return;
          tip.removeAttribute("data-show");
        }

        function showErrorTip(text) {
          if (tip === null) return;
          showTip(text, "error");
          tipTimer = root.setTimeout(function () {
            tipTimer = null;
            if (tip !== null) {
              tip.removeAttribute("data-tone");
              tip.removeAttribute("data-show");
            }
          }, 2600);
        }

        // ---------- 位置与拖拽 ----------

        function isAnchored() {
          return pill === null || pill.style.left === "";
        }

        function savePos() {
          if (pill === null) return;
          try {
            root.localStorage.setItem(
              POS_KEY,
              JSON.stringify({
                left: parseFloat(pill.style.left) || 0,
                top: parseFloat(pill.style.top) || 0,
              })
            );
          } catch (_) {}
        }

        function clampPos() {
          if (pill === null) return;
          if (isAnchored()) {
            // 默认锚定在右侧居中，只保证纵向不越界。
            pill.style.top = "50%";
            updateTipSide();
            return;
          }
          var rect = pill.getBoundingClientRect();
          var maxLeft = Math.max(EDGE_MARGIN, root.innerWidth - rect.width - EDGE_MARGIN);
          var maxTop = Math.max(EDGE_MARGIN, root.innerHeight - rect.height - EDGE_MARGIN);
          var left = Math.min(Math.max(EDGE_MARGIN, parseFloat(pill.style.left) || 0), maxLeft);
          var top = Math.min(Math.max(EDGE_MARGIN, parseFloat(pill.style.top) || 0), maxTop);
          pill.style.left = left + "px";
          pill.style.top = top + "px";
          updateTipSide();
        }

        // 松手后吸附：靠近哪边就贴哪边，纵向留在原地。
        function snapToEdge() {
          if (pill === null || isAnchored()) return;
          var rect = pill.getBoundingClientRect();
          var left = rect.left;
          if (left < SNAP_ZONE) left = EDGE_MARGIN;
          else if (left + rect.width > root.innerWidth - SNAP_ZONE) {
            left = root.innerWidth - rect.width - EDGE_MARGIN;
          }
          pill.style.left = Math.max(EDGE_MARGIN, left) + "px";
          clampPos();
          updateTipSide();
        }

        function resetPosition() {
          if (pill === null) return;
          pill.style.left = "";
          pill.style.top = "";
          pill.style.right = EDGE_MARGIN + "px";
          pill.style.bottom = "";
          pill.style.transform = "translateY(-50%)";
          try {
            root.localStorage.removeItem(POS_KEY);
          } catch (_) {}
          updateTipSide();
          showTip(STR.resetDone, "info");
          root.setTimeout(function () {
            hideTip(true);
          }, 1400);
        }

        function onPointerDown(event) {
          if (pill === null) return;
          if (event.button !== undefined && event.button !== 0) return;
          wake();
          var rect = pill.getBoundingClientRect();
          drag = {
            x: event.clientX,
            y: event.clientY,
            left: rect.left,
            top: rect.top,
            moved: false,
          };
          // 从「右边缘锚定」改成绝对定位，拖拽期间不跳位。
          pill.style.right = "auto";
          pill.style.left = rect.left + "px";
          pill.style.top = rect.top + "px";
          pill.style.transform = "none";
          root.addEventListener("pointermove", onPointerMove, true);
          root.addEventListener("pointerup", onPointerUp, true);
          root.addEventListener("pointercancel", onPointerUp, true);
        }

        function onPointerMove(event) {
          if (drag === null || pill === null) return;
          var dx = event.clientX - drag.x;
          var dy = event.clientY - drag.y;
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
          drag.moved = true;
          pill.setAttribute("data-drag", "");
          pill.style.left = drag.left + dx + "px";
          pill.style.top = drag.top + dy + "px";
        }

        function onPointerUp() {
          if (drag === null) return;
          var moved = drag.moved;
          drag = null;
          root.removeEventListener("pointermove", onPointerMove, true);
          root.removeEventListener("pointerup", onPointerUp, true);
          root.removeEventListener("pointercancel", onPointerUp, true);
          if (pill !== null) {
            pill.removeAttribute("data-drag");
            if (moved) snapToEdge();
            else clampPos();
          }
          if (moved) {
            // 拖拽结束后的那次 click 不算点击，避免误切换。
            suppressClick = true;
            savePos();
            wake();
            root.setTimeout(function () {
              suppressClick = false;
            }, 140);
          }
        }

        // ---------- 切换 ----------

        function flashError(error) {
          lastError = error && error.message ? error.message : String(error);
          if (pill === null) return;
          pill.setAttribute("data-error", "");
          pill.setAttribute("data-shake", "");
          showErrorTip(lastError);
          root.setTimeout(function () {
            if (pill !== null) {
              pill.removeAttribute("data-error");
              pill.removeAttribute("data-shake");
            }
          }, 900);
        }

        async function run(target) {
          if (disposed || busy || pill === null) return;
          var current = detectMode();
          if (current === null) {
            var probe = probeDsBot();
            if (probe.loaded) {
              warn(STR.incompat(probe.version));
              flashError(new Error(STR.incompat(probe.version)));
            } else {
              warn(STR.warnNoDsBot);
              flashError(new Error(STR.errNoDsBot));
            }
            return;
          }
          if (current === target) {
            refresh();
            return;
          }

          busy = true;
          wake();
          pill.setAttribute("data-busy", "");
          if (topBtn !== null) topBtn.setAttribute("data-busy", "");
          var flipped = false;
          var domError = null;
          var stealth = target === "classic"; // 只有切经典要开弹层，才需要隐身
          if (stealth) stealthOn();
          try {
            log("switching", current, "->", target);
            try {
              await switchTo(target);
              flipped = await waitFor(function () {
                return detectMode() === target;
              }, 2500);
              if (!flipped) {
                await switchTo(target); // 失败重试一次
                flipped = await waitFor(function () {
                  return detectMode() === target;
                }, 2500);
              }
            } catch (error) {
              domError = error;
              flipped = false;
            }
            if (!flipped) {
              // DOM 路径失败 → 兜底：写 ds-bot 的持久化键并刷新页面（页面马上重开）。
              if (persistAndReload(target === "classic" ? "agent" : "bot")) return;
              throw domError !== null ? domError : new Error(STR.notFlipped(target));
            }
            mode = target;
            lastPaint = null;
            refresh();
            log("switched to", target);
          } catch (error) {
            warn("switch failed:", error && error.message ? error.message : error);
            dismissPopups();
            flashError(error);
          } finally {
            if (stealth) stealthOff();
            busy = false;
            if (pill !== null) pill.removeAttribute("data-busy");
            if (topBtn !== null) topBtn.removeAttribute("data-busy");
            scheduleIdle();
          }
        }

        // 快捷键判定：认物理键位，不认字符。
        // macOS 上 Option 会改写输入字符——⌥⇧B 得到的 event.key 是 "ı" 而不是 "B"，
        // 旧实现（event.key === "b"/"B"）因此在 mac 上永远不触发（Windows 的 Alt 不
        // 改字符，所以只有 Windows 好使）。event.code 报的是键位 "KeyB"，与键盘布局、
        // 修饰键组合都无关，是跨平台唯一可靠的判据。
        var KEY_B_CHARS = { b: true, B: true, "ı": true, "∫": true };
        function isToggleHotkey(event) {
          if (!event || typeof event !== "object") return false;
          if (event.repeat === true) return false; // 长按不连续切换
          if (event.isComposing === true) return false; // 输入法合成中不抢键
          if (!event.shiftKey) return false;
          // Windows/Linux：Alt+Shift+B；macOS：⌥+Shift+B 或 ⌘+Shift+B
          if (!event.altKey && !(IS_MAC && event.metaKey)) return false;
          if (event.ctrlKey === true) return false; // Ctrl+Alt+Shift+B 留给系统与其它插件
          if (typeof event.code === "string" && event.code !== "") return event.code === "KeyB";
          // 合成事件/老环境没有 code 时退回字符判定（含 macOS 组合后的字符）
          return KEY_B_CHARS[String(event.key || "")] === true;
        }

        function onKeyDown(event) {
          if (!isToggleHotkey(event)) return;
          if (splashActive()) return; // 开机动画期间不抢快捷键
          event.preventDefault();
          event.stopPropagation();
          var current = detectMode();
          if (current === null) return;
          run(current === "bot" ? "classic" : "bot");
        }

        function onContextMenu(event) {
          event.preventDefault();
          event.stopPropagation();
          resetPosition();
        }

        // ---------- 组装 ----------

        function makeButton(target, label, aria, tipText) {
          var button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-target", target);
          button.setAttribute("aria-label", aria);
          button.setAttribute("aria-pressed", "false");
          button.innerHTML =
            (target === "bot" ? ICON_BOT : ICON_CLASSIC) +
            '<span class="dsst-label">' +
            label +
            "</span>";
          button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (suppressClick) return;
            run(target);
          });
          button.addEventListener("mouseenter", function () {
            showTip(tipText);
            wake();
          });
          button.addEventListener("mouseleave", function () {
            hideTip(false);
          });
          button.addEventListener("focus", function () {
            showTip(tipText);
          });
          button.addEventListener("blur", function () {
            hideTip(false);
          });
          return button;
        }

        function restorePosition() {
          var saved = null;
          try {
            saved = JSON.parse(root.localStorage.getItem(POS_KEY) || "null");
          } catch (_) {}
          if (
            saved &&
            typeof saved.left === "number" &&
            typeof saved.top === "number" &&
            isFinite(saved.left) &&
            isFinite(saved.top)
          ) {
            pill.style.left = saved.left + "px";
            pill.style.top = saved.top + "px";
            pill.style.transform = "none";
          } else {
            pill.style.right = EDGE_MARGIN + "px";
            pill.style.top = "50%";
            pill.style.transform = "translateY(-50%)";
          }
          updateTipSide();
        }

        function build() {
          style = document.createElement("style");
          style.setAttribute("data-dsh-bot-toggle", "");
          style.textContent = STYLES;
          document.head.appendChild(style);

          pill = document.createElement("div");
          pill.className = "dsst";
          pill.hidden = true;
          pill.setAttribute("role", "group");
          pill.setAttribute("aria-label", STR.pillAria);

          thumb = document.createElement("span");
          thumb.className = "dsst-thumb";
          pill.appendChild(thumb);

          buttons.bot = makeButton("bot", "Bot", STR.botAria, STR.botTip);
          buttons.classic = makeButton("classic", "ADE", STR.classicAria, STR.classicTip);
          pill.appendChild(buttons.bot);
          pill.appendChild(buttons.classic);

          tip = document.createElement("span");
          tip.className = "dsst-tip";
          tip.setAttribute("aria-hidden", "true");
          pill.appendChild(tip);

          pill.addEventListener("pointerdown", onPointerDown);
          pill.addEventListener("contextmenu", onContextMenu);
          pill.addEventListener("pointerenter", function () {
            hovered = true;
            wake();
          });
          pill.addEventListener("pointerleave", function () {
            hovered = false;
            hideTip(false);
            scheduleIdle();
          });

          restorePosition();
          document.body.appendChild(pill);
          document.addEventListener("keydown", onKeyDown, true);
          root.addEventListener("resize", clampPos);

          paint();
          refresh();
          clampPos();
          tickTimer = root.setInterval(refresh, TICK_MS);
          scheduleIdle();

          root.__botToggle = {
            version: VERSION,
            status: function () {
              return {
                version: VERSION,
                mode: detectMode(),
                painted: mode,
                lang: LANG,
                dsBot: probeDsBot(),
                busy: busy,
                mounted: pill !== null && !pill.hidden,
                lastError: lastError,
              };
            },
            switchTo: run,
            toggle: function () {
              var current = detectMode();
              return current === null ? undefined : run(current === "bot" ? "classic" : "bot");
            },
            reset: resetPosition,
            probe: probeDsBot,
          };
          log("v" + VERSION + " mounted; ds-bot surface =", detectMode(), "· " + HOTKEY_LABEL + " 切换");
        }

        function dispose() {
          if (disposed) return;
          disposed = true;
          if (tickTimer !== null) {
            root.clearInterval(tickTimer);
            tickTimer = null;
          }
          if (idleTimer !== null) {
            root.clearTimeout(idleTimer);
            idleTimer = null;
          }
          if (tipTimer !== null) {
            root.clearTimeout(tipTimer);
            tipTimer = null;
          }
          document.removeEventListener("keydown", onKeyDown, true);
          root.removeEventListener("resize", clampPos);
          root.removeEventListener("pointermove", onPointerMove, true);
          root.removeEventListener("pointerup", onPointerUp, true);
          root.removeEventListener("pointercancel", onPointerUp, true);
          removeTopButton();
          var stealthNode = document.getElementById(STEALTH_ID);
          if (stealthNode !== null && stealthNode.parentNode !== null) stealthNode.parentNode.removeChild(stealthNode);
          if (pill !== null && pill.parentNode !== null) pill.parentNode.removeChild(pill);
          if (style !== null && style.parentNode !== null) style.parentNode.removeChild(style);
          pill = null;
          style = null;
          if (root.__botToggle && root.__botToggle.version === VERSION) delete root.__botToggle;
        }

        // client 插件在 shell 启动后才应用，正常此时 body 已存在；仍然留一个等待，
        // 避免极早期挂载时 document.body 为 null 直接抛错。
        (function whenBody(attempt) {
          if (disposed) return;
          if (document.body) {
            build();
            return;
          }
          if (attempt > 40) {
            warn("document.body 一直不可用，放弃挂载");
            return;
          }
          root.setTimeout(function () {
            whenBody(attempt + 1);
          }, 50);
        })(0);

        return dispose;
      }

      // 插件入口：交给宿主的 cordis 上下文管理生命周期。
      function apply(ctx) {
        try {
          if (ctx && typeof ctx.effect === "function") {
            ctx.effect(function () {
              return mount(ctx);
            }, "dsh-bot-toggle: Bot/ADE switch");
          } else {
            mount(ctx);
          }
        } catch (error) {
          warn("mount failed:", error && error.message ? error.message : error);
        }
      }

      exports.apply = apply;
      return module.exports;
    },
  });
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : null);
