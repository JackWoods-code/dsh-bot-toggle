// DOM-stub 冒烟测试：用最小的 document/window 桩跑通客户的挂载、探测、文案与兼容性告警。
// 不依赖浏览器，也不需要 ds-bot 本体；node --test test/ 即可运行。
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientPath = path.join(rootDir, "lib", "client.js");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 极简元素桩：只覆盖 lib/client.js 真正用到的接口。
function makeEl(tag) {
  const listeners = {};
  return {
    tagName: tag,
    children: [],
    parentNode: null,
    className: "",
    hidden: false,
    textContent: "",
    innerHTML: "",
    title: "",
    type: "",
    style: {},
    dataset: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    getAttribute(name) {
      return name in this.attributes ? this.attributes[name] : null;
    },
    hasAttribute(name) {
      return name in this.attributes;
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners[type] || [];
      const index = list.indexOf(fn);
      if (index >= 0) list.splice(index, 1);
    },
    dispatch(type, extra) {
      for (const fn of [...(listeners[type] || [])]) {
        fn({ preventDefault() {}, stopPropagation() {}, ...extra });
      }
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((item) => item !== child);
      child.parentNode = null;
    },
    querySelector(selector) {
      return (this._selectors && this._selectors[selector]) || null;
    },
    querySelectorAll(selector) {
      return (this._selectors && this._selectors[selector]) || [];
    },
    getBoundingClientRect() {
      return { left: 100, top: 100, width: 118, height: 48, right: 218, bottom: 148 };
    },
    click() {
      this.dispatch("click", {});
    },
  };
}

function makeEnv({ lang = "en-US", bootEntries = null } = {}) {
  const matches = new Map();
  const doc = {
    documentElement: { lang },
    head: makeEl("head"),
    body: makeEl("body"),
    createElement: (tag) => makeEl(tag),
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      return matches.get(selector) ?? null;
    },
    querySelectorAll(selector) {
      const value = matches.get(selector);
      return value ? [].concat(value) : [];
    },
  };
  const store = new Map();
  const win = {
    __ModuleLoader__: {
      load(spec) {
        win.__spec = spec;
      },
    },
    __DSH_BOOT__: bootEntries ? { entries: bootEntries } : undefined,
    dshBot: undefined,
    document: doc,
    navigator: { language: lang },
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {},
  };
  return { win, doc, matches };
}

// 每次用不同的 query 导入，拿到全新的模块实例，避免桩状态跨用例串味。
async function loadClient(env, tag) {
  globalThis.window = env.win;
  globalThis.document = env.doc;
  const url = `${pathToFileURL(clientPath).href}?case=${tag}`;
  await import(url);
  assert.equal(typeof env.win.__spec, "object", "ModuleLoader.load 未被调用");
  return env.win.__spec;
}

function apply(spec) {
  assert.equal(typeof spec.factory, "function", "factory 缺失");
  const exports = spec.factory(() => {
    throw new Error("client bundle 不应 require 平台模块");
  });
  assert.equal(typeof exports.apply, "function", "exports.apply 缺失");
  const state = { dispose: null };
  exports.apply({
    effect(fn) {
      state.dispose = fn();
    },
  });
  return state;
}

function findPill(doc) {
  return doc.body.children.find((child) => child.className === "dsst") ?? null;
}

test("zh-CN：中文文案与挂载结构", async () => {
  const env = makeEnv({ lang: "zh-CN" });
  const spec = await loadClient(env, "zh");
  const app = apply(spec);
  try {
    const pill = findPill(env.doc);
    assert.ok(pill, "胶囊未挂载到 body");
    assert.equal(pill.hidden, true, "探测不到界面时应隐藏");
    assert.equal(pill.children.length, 4, "结构应为 滑块 + 两个按钮 + 提示");
    assert.equal(pill.getAttribute("aria-label"), "界面切换：Bot（Bot 界面）/ ADE（经典 DSH 界面）");

    const buttons = pill.children.filter((child) => child.tagName === "button");
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].getAttribute("aria-label"), "切换到 Bot 界面（ds-bot）");
    assert.equal(buttons[1].getAttribute("aria-label"), "切换到经典 DSH 界面");

    buttons[0].dispatch("mouseenter");
    const tip = pill.children.find((child) => child.className === "dsst-tip");
    assert.equal(tip.textContent, "Bot 界面 · Alt+Shift+B 切换");
    assert.equal(env.win.__botToggle.status().lang, "zh");
  } finally {
    app.dispose();
  }
});

test("en-US：英文文案", async () => {
  const env = makeEnv({ lang: "en-US" });
  const spec = await loadClient(env, "en");
  const app = apply(spec);
  try {
    const pill = findPill(env.doc);
    assert.ok(pill);
    assert.equal(pill.getAttribute("aria-label"), "Surface switch: Bot (ds-bot) / ADE (classic DSH UI)");
    const buttons = pill.children.filter((child) => child.tagName === "button");
    assert.equal(buttons[0].getAttribute("aria-label"), "Switch to the Bot surface (ds-bot)");
    buttons[1].dispatch("mouseenter");
    const tip = pill.children.find((child) => child.className === "dsst-tip");
    assert.equal(tip.textContent, "Classic DSH surface · Alt+Shift+B");
  } finally {
    app.dispose();
  }
});

test("探测两套界面并绘制高亮", async () => {
  const env = makeEnv({ lang: "en-US" });
  const spec = await loadClient(env, "paint");
  const app = apply(spec);
  try {
    const pill = findPill(env.doc);
    const status = env.win.__botToggle.status();
    assert.equal(status.mode, null);
    assert.equal(status.mounted, false);

    env.matches.set(".bt-account, .bt-side-top", makeEl("button"));
    await sleep(640);
    let current = env.win.__botToggle.status();
    assert.equal(current.mode, "bot");
    assert.equal(current.painted, "bot");
    assert.equal(pill.hidden, false);
    assert.equal(pill.getAttribute("data-mode"), "bot");

    env.matches.delete(".bt-account, .bt-side-top");
    env.matches.set(".bt-return", makeEl("button"));
    await sleep(640);
    current = env.win.__botToggle.status();
    assert.equal(current.mode, "classic");
    assert.equal(pill.getAttribute("data-mode"), "classic");
    assert.equal(pill.hidden, false);
  } finally {
    app.dispose();
  }
});

test("ds-bot 已加载但控件缺失：琥珀色兼容告警", async () => {
  const env = makeEnv({
    lang: "en-US",
    bootEntries: [{ id: "ds-bot", version: "0.2.2" }],
  });
  const spec = await loadClient(env, "compat");
  const app = apply(spec);
  try {
    const pill = findPill(env.doc);
    await sleep(80);
    const status = env.win.__botToggle.status();
    assert.deepEqual(status.dsBot, { loaded: true, version: "0.2.2", compatible: false });
    assert.equal(pill.hidden, false, "兼容告警态应保留胶囊");
    assert.ok(pill.hasAttribute("data-compat"), "应打上 data-compat");
    assert.match(pill.title, /dsh-bot-toggle may need an update/);
    assert.match(pill.title, /0\.2\.2/);

    const buttons = pill.children.filter((child) => child.tagName === "button");
    buttons[0].click();
    await sleep(20);
    assert.match(env.win.__botToggle.status().lastError, /may need an update/);
  } finally {
    app.dispose();
  }
});

test("卸载清理：DOM 与调试对象都移除", async () => {
  const env = makeEnv({ lang: "zh-CN" });
  const spec = await loadClient(env, "dispose");
  const app = apply(spec);
  const pill = findPill(env.doc);
  assert.ok(pill);
  app.dispose();
  assert.equal(findPill(env.doc), null, "胶囊应被移除");
  assert.equal(env.doc.head.children.length, 0, "样式应被移除");
  assert.equal(env.win.__botToggle, undefined, "调试对象应被移除");
});
