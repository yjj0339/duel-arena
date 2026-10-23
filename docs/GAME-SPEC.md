# GAME-SPEC — 双人对决游戏开发规范（必读）

## 项目背景
`D:\WokBuddy\2026-10-22-23-36-40\duel-arena` 是一个 24 款双人对决游戏联机平台。
服务器/网络层/游戏基座/大厅已全部完成。你只负责生产指定游戏的 `main.js`。

## 文件与结构
- 每款游戏一个文件：`public/games/<id>/main.js`（单文件，全局注册 `window.GameDef`）
- **代码零注释**（一行注释都不许有）
- 依赖通过 `<script>` 已加载：`net.js`、`sdk.js`（内含 `GameKit`、`Sfx`、`hashSeed`、`mulberry32`），样式 `design.css`
- 你可以在 main.js 里动态注入自己的 `<style>`（用 `document.createElement('style')`），注意类名加游戏前缀防冲突

## 必读样板（先完整阅读再动手）
- `public/games/gomoku/main.js`（回合制棋类样板）
- `public/games/pong/main.js`（实时对抗样板：主机权威 + 状态流）
- `public/games/memory/main.js`（轮流行动样板）
- `public/sdk.js`（GameKit 全部能力）

## GameKit API（ctx 由 def.create(ctx) 传入）
```
ctx = {
  mode: 'online'|'ai',      // ai=单机打AI（此时无网络），online=远程联机
  side: 0|1,                 // 0=先手/左/红方，1=后手/右/蓝方。ai 模式恒为 0
  seed: 字符串,              // 双端一致的种子（联机=房间号派生；重赛后变化）
  rng: ()=>float,            // 用 seed 初始化的确定性随机数（洗牌/生成地图必须用它保证双端一致）
  root: DOM元素,             // 游戏主区域，把你的 DOM/canvas 挂这里
  me:{name}, opp:{name},
  setStatus(text),           // 更新我的状态标签（如"你的回合"/"等待对方…"）
  setOppStatus(text),
  turn(0|1|-1),              // 高亮当前行动方玩家卡（0=我，1=对方，-1=无）
  send(k, d, snap?),         // 联机发送；k 建议用 'mv'(走子)/'st'(状态流)/'in'(输入)/'ev'(事件)；snap=全量快照
  toast(text),
  sfx: {play('click'|'place'|'pop'|'good'|'bad'|'win'|'lose'|'tick')},
  finish('win'|'lose'|'draw', detailText),  // 结束（自动弹遮罩+音效+彩带+再来一局）
  onMsg(cb),                 // cb(k,d) 收对方消息（sys 已被框架拦截）
  onRestore(cb),             // cb(state) 断线重连恢复；state={s0:对方或我的快照,s1:...} 取 s['s'+ctx.side]（权威类游戏取 s0）
  onPeer(cb),                // cb(online) 对手上线/掉线
}
```
### 消息与快照约定（极重要，保证退出重连不掉线）
- 每次对局状态变化都 `ctx.send('mv'|'st', data, serializeSnapshot())`
- `serializeSnapshot()` 返回你游戏的**全量可恢复状态**对象（含随机种子派生数据时直接存结果而不是种子）
- 重连时 `onRestore(state)` 的 `state.s0` 是 0 号位最后一次快照、`state.s1` 是 1 号位的；恢复自己的局面用 `state['s'+ctx.side]`；主机权威类游戏（pong/snake/tank）恢复用 `state.s0`（host 的权威状态），恢复后等待下一帧状态流即可
- create 末尾：`if (ctx.mode==='online' && ctx.side===0) ctx.send('hello', null, serialize())` —— 让后加入者拿到初始快照
- 任何时刻快照必须能独立重建完整 UI

## 美术规范（顶级标准，硬性要求）
- **视觉基调**：macOS 白底简约毛玻璃风。背景已由框架提供；游戏区 `.gk-card` 毛玻璃卡片
- Canvas 必须**高 DPI 渲染**：`dpr=Math.min(devicePixelRatio,2.5)`，canvas.width=逻辑宽*dpr，`ctx.setTransform(dpr,0,0,dpr,0,0)`，style.width 设逻辑宽；监听 resize
- 色彩：用 CSS 变量 `--acc/--ink/--ink2`，主色可自定但需和大厅注册表 accent 一致；禁用大面积纯黑背景（实时类游戏区可用深色画布，如 pong 的深蓝渐变）
- 棋子/球体/牌面必须有**渐变+高光+阴影**（参考 gomoku 的 stone()），不许扁平色块
- 动画：所有状态变化要有过渡（落子弹跳、翻牌 3D、得分弹跳、胜利闪光）；用 requestAnimationFrame；动画时长 200-500ms
- 布局：居中，`width:min(560px, 92vw)` 类自适应；移动端不崩
- 提示文案：简洁中文，字体 `font-weight:600+`，用 `var(--ink2)`
- 音效：关键动作必须配 `ctx.sfx.play()`
- 悬停/可点区域要有 cursor:pointer 和 :hover 反馈

## AI（单机模式 ctx.mode==='ai'）
- AI 是 1 号位（你 0 号位先手），AI 用 `setTimeout(思考, 400~900ms)` 模拟思考
- AI 必须能玩、有基本策略但允许失误（难度适中）
- 实时类 AI 在本地模拟对手输入
- 竞速类 AI 用自己的进度模拟（同 seed 可预生成其操作序列）

## 公平性（联机）
- 所有随机内容（洗牌、地图、地鼠序列、拼图切块）必须用 `ctx.rng`（种子一致→双端一致）
- 判定胜负的数值比较（如反应时间、比分）在两端各自独立计算，结果必须一致（确定性）

## 语法与验收
1. `node --check public/games/<id>/main.js` 必须通过
2. 单文件、零注释、无外部资源引用（图片一律 canvas 程序化绘制或 emoji/SVG）
3. `window.GameDef = { create(ctx) { ... return { destroy(){...} } } }`
4. 断线恢复路径必须真实实现（onRestore 完整重建）
5. 代码规模参考：每款 250-600 行

## 通用 UI 结构建议
root 下：计分区/状态条（自绘）→ 主画布/棋盘 → 底部提示。GameKit 顶栏和玩家卡已存在，不要重复实现。
