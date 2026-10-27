// dsh-bot-toggle — 浏览器侧（v0.3.0）。
//
// 作用：在 ds-bot 的两套界面之间放一枚常驻的分段开关，ds-bot 插件始终加载：
//   Bot = ds-bot 的 Bot 界面；ADE = 经典 DSH 界面。
//
// 切换依赖 ds-bot 自己渲染的按钮与菜单（见下），ds-bot 升级后可能需要适配。
// 不伪造任何状态，也不碰它持久化的 localStorage：
//   经典 → Bot：点侧栏底部的 .bt-return（BotReturn，仅 agent 模式存在）
//   Bot → 经典：点 .bt-account 打开账号菜单，再点菜单里的「切换经典 Agent 模式」
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

      var VERSION = "0.3.0";
      var LOG = "[bot-toggle]";
      var POS_KEY = "dsh-bot-toggle:pos";
      var BOT_MARKERS = ".bt-account, .bt-side-top"; // Bot 界面（侧栏账号按钮 / 侧栏顶部行）
      var CLASSIC_MARKER = ".bt-return"; // 经典界面（ds-bot 的「DS Bot」返回按钮）
      var TICK_MS = 500; // 轮询界面状态的间隔：只读 DOM，开销可忽略
      var HIDE_AFTER_MS = 1600; // 连续这么久探测不到界面才隐藏（避免切换过渡时闪一下）
      var IDLE_AFTER_MS = 4000; // 这么久没有交互就变淡
      var EDGE_MARGIN = 12; // 默认位置与吸附后距边缘的距离
      var SNAP_ZONE = 80; // 松手时离边缘多近就吸附过去

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

      // 账号菜单里的「切换经典 Agent 模式」项。优先按文案匹配，选择器只作兜底，
      // 这样 ds-bot 菜单顺序变了也不会点错。
      function findAgentItem() {
        var textRe = /(经典\s*Agent|classic\s+Agent)/i;
        var menus = document.querySelectorAll(".bt-account-menu");
        for (var m = 0; m < menus.length; m += 1) {
          var items = menus[m].querySelectorAll('[role="menuitem"]');
          for (var i = 0; i < items.length; i += 1) {
            if (textRe.test((items[i].textContent || "").trim())) return items[i];
          }
        }
        return document.querySelector(
          '.bt-account-menu > .bt-menu-sep:last-of-type ~ [role="menuitem"]'
        );
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

      // 执行一次界面切换。失败时抛错，由调用方统一提示。
      function switchTo(target) {
        if (target === "bot") {
          var back = document.querySelector(CLASSIC_MARKER);
          if (back === null) throw new Error("找不到返回 DS Bot 的按钮（.bt-return）");
          back.click();
          return Promise.resolve();
        }

        var account = document.querySelector(".bt-account");
        if (account === null) throw new Error("找不到 ds-bot 的账号按钮（.bt-account）");
        if (document.querySelector(".bt-account-menu") === null) account.click();
        return waitFor(findAgentItem, 1500).then(function (item) {
          if (item === null) throw new Error("账号菜单里没有「切换经典 Agent 模式」项");
          item.click();
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
        var style = null;
        var buttons = {};
        var tickTimer = null;
        var idleTimer = null;
        var tipTimer = null;
        var nullSince = 0;
        var drag = null;
        var hovered = false;
        var lastError = null;

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

        function refresh() {
          var next = detectMode();
          if (next !== null) {
            nullSince = 0;
            mode = next;
            setVisible(true);
            paint();
            return;
          }
          if (pill !== null && !pill.hidden) {
            if (nullSince === 0) nullSince = Date.now();
            else if (Date.now() - nullSince >= HIDE_AFTER_MS) setVisible(false);
          }
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
          showTip("已复位到默认位置", "info");
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
            warn("ds-bot 没有加载（插件页里未启用），没有可切换的界面。");
            flashError(new Error("ds-bot 未加载"));
            return;
          }
          if (current === target) {
            refresh();
            return;
          }

          busy = true;
          wake();
          pill.setAttribute("data-busy", "");
          try {
            log("switching", current, "->", target);
            await switchTo(target);
            var flipped = await waitFor(function () {
              return detectMode() === target;
            }, 2500);
            if (!flipped) {
              await switchTo(target); // 失败重试一次
              flipped = await waitFor(function () {
                return detectMode() === target;
              }, 2500);
            }
            if (!flipped) throw new Error("切换未生效（目标：" + target + "）");
            mode = target;
            lastPaint = null;
            refresh();
            log("switched to", target);
          } catch (error) {
            warn("switch failed:", error && error.message ? error.message : error);
            flashError(error);
          } finally {
            busy = false;
            if (pill !== null) pill.removeAttribute("data-busy");
            scheduleIdle();
          }
        }

        function onKeyDown(event) {
          if (!event.altKey || !event.shiftKey) return;
          if (event.key !== "b" && event.key !== "B") return;
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

        function makeButton(target, label, hint) {
          var button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-target", target);
          button.setAttribute("aria-label", hint);
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
            showTip(hint.replace(/（.*$/, "") + " · Alt+Shift+B");
            wake();
          });
          button.addEventListener("mouseleave", function () {
            hideTip(false);
          });
          button.addEventListener("focus", function () {
            showTip(hint.replace(/（.*$/, "") + " · Alt+Shift+B");
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
          pill.setAttribute("aria-label", "界面切换：Bot（Bot 界面）/ ADE（经典 DSH 界面）");

          thumb = document.createElement("span");
          thumb.className = "dsst-thumb";
          pill.appendChild(thumb);

          buttons.bot = makeButton("bot", "Bot", "Bot 界面（Alt+Shift+B 切换）");
          buttons.classic = makeButton("classic", "ADE", "经典 DSH 界面（Alt+Shift+B 切换）");
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
          };
          log("v" + VERSION + " mounted; ds-bot surface =", detectMode(), "· Alt+Shift+B 切换");
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
