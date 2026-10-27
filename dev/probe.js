// dsh-bot-toggle 一次性探针（开发调试用，不安装插件也能验证选择器）。
// 用法：在 DSH 窗口打开 DevTools（Cmd+Opt+I），把本文件内容整段粘进 Console 回车。
// 然后调用 __botProbe.status() / .toBot() / .toClassic()。
(() => {
  const log = (...args) => console.log("[solo-probe]", ...args);
  const detect = () =>
    document.querySelector(".bt-account, .bt-side-top")
      ? "bot"
      : document.querySelector(".bt-return")
        ? "classic"
        : null;
  const findAgentItem = () => {
    const textRe = /(经典\s*Agent|classic\s+Agent)/i;
    for (const menu of document.querySelectorAll(".bt-account-menu")) {
      for (const item of menu.querySelectorAll('[role="menuitem"]')) {
        if (textRe.test((item.textContent || "").trim())) return item;
      }
    }
    return null;
  };
  const waitFor = (predicate, timeoutMs) =>
    new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        let value = null;
        try {
          value = predicate();
        } catch (_) {}
        if (value) return resolve(value);
        if (Date.now() - started >= timeoutMs) return resolve(null);
        setTimeout(tick, 60);
      };
      tick();
    });

  window.__botProbe = {
    status() {
      const mode = detect();
      log({
        mode,
        botMarkers: !!document.querySelector(".bt-account, .bt-side-top"),
        returnButton: !!document.querySelector(".bt-return"),
        dshBot: typeof window.dshBot,
        storedSurface: (() => {
          try {
            return localStorage.getItem("ds-bot:surface");
          } catch (_) {
            return null;
          }
        })(),
      });
      return mode;
    },
    async toBot() {
      const back = document.querySelector(".bt-return");
      if (!back) throw new Error("找不到 .bt-return（当前不在经典界面，或 ds-bot 未启用）");
      back.click();
      log("clicked .bt-return");
      return this;
    },
    async toClassic() {
      const account = document.querySelector(".bt-account");
      if (!account) throw new Error("找不到 .bt-account（当前不在 Bot 界面，或 ds-bot 未启用）");
      if (!document.querySelector(".bt-account-menu")) account.click();
      const item = await waitFor(findAgentItem, 1500);
      if (!item) throw new Error("账号菜单里没找到「切换经典 Agent 模式」项");
      item.click();
      log("clicked agent-mode item");
      return this;
    },
  };
  log("探针就绪：__botProbe.status() / .toBot() / .toClassic()");
})();
