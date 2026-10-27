// dsh-bot-toggle — 宿主侧入口。
// 这个原型只做界面切换，全部逻辑都在浏览器侧（lib/client.js），
// 宿主侧不注册工具、不改配置，保持空实现，避免影响普通会话。
export const name = 'dsh-bot-toggle'

export function apply(ctx) {
  // 只留一条启动日志，方便在 DSH 日志里确认插件真的被组合进来。
  try {
    ctx?.logger?.debug?.('dsh-bot-toggle: host half loaded (no host behaviour)')
  } catch {
    // 日志服务不可用时忽略：宿主侧没有必须完成的工作。
  }
}
