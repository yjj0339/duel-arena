'use strict';
const I = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const GAMES = [
  { id: 'gomoku', name: '五子棋', cat: '棋类', acc: '#3478f6', desc: '连成五子即胜', icon: I('<circle cx="8" cy="9" r="3.2" fill="currentColor"/><circle cx="16.5" cy="14.5" r="3.2"/><circle cx="15" cy="6" r="1.2" fill="currentColor"/>') },
  { id: 'connect4', name: '四子棋', cat: '棋类', acc: '#ff6482', desc: '投子连四', icon: I('<rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.7" fill="currentColor"/><circle cx="15" cy="14" r="1.7"/>') },
  { id: 'reversi', name: '黑白棋', cat: '棋类', acc: '#1d1d1f', desc: '翻转占领棋盘', icon: I('<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor"/>') },
  { id: 'uttt', name: '终极井字棋', cat: '棋类', acc: '#00c7be', desc: '九宫嵌套博弈', icon: I('<path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>') },
  { id: 'dots', name: '点格棋', cat: '棋类', acc: '#7b5cff', desc: '围格得分', icon: I('<path d="M5 5h6M13 11h6M5 13v6M11 19h6"/><circle cx="5" cy="5" r="1.4" fill="currentColor"/><circle cx="11" cy="5" r="1.4"/><circle cx="13" cy="11" r="1.4" fill="currentColor"/><circle cx="19" cy="11" r="1.4"/><circle cx="5" cy="19" r="1.4"/><circle cx="11" cy="19" r="1.4"/>') },
  { id: 'quarto', name: '夸托棋', cat: '棋类', acc: '#ff9f0a', desc: '四特征连四', icon: I('<rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="3.5"/><rect x="4" y="13" width="7" height="7" rx="3.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>') },
  { id: 'jungle', name: '斗兽棋', cat: '棋类', acc: '#30b15c', desc: '兽王争穴', icon: I('<circle cx="12" cy="13" r="6"/><path d="M7 8l1.5-3.5L11 7M17 8l-1.5-3.5L13 7M12 11v4M10.5 13h3"/>') },
  { id: 'checkers', name: '西洋跳棋', cat: '棋类', acc: '#c0392b', desc: '跳跃吃子', icon: I('<circle cx="12" cy="10" r="6"/><circle cx="12" cy="14" r="6"/>') },
  { id: 'go9', name: '九路围棋', cat: '棋类', acc: '#5d4037', desc: '围地致胜', icon: I('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9.5" cy="9.5" r="1.6" fill="currentColor"/><circle cx="14.5" cy="14.5" r="1.6"/>') },
  { id: 'flipchess', name: '翻翻棋', cat: '棋类', acc: '#e67e22', desc: '暗棋翻战', icon: I('<rect x="5" y="6" width="14" height="12" rx="2.5"/><path d="M12 9.5v5M9.5 12h5" opacity=".8"/>') },
  { id: 'pong', name: '弹球对决', cat: '实时', acc: '#3478f6', desc: '街机弹球', icon: I('<path d="M6 4v16M18 8v16"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/>') },
  { id: 'airhockey', name: '空气曲棍球', cat: '实时', acc: '#00c7be', desc: '指尖冰球', icon: I('<rect x="5" y="3" width="14" height="18" rx="4"/><circle cx="12" cy="12" r="2.4"/><path d="M5 7.5h14M5 16.5h14" opacity=".45"/>') },
  { id: 'snake', name: '贪吃蛇对决', cat: '实时', acc: '#30b15c', desc: '吞噬成长', icon: I('<path d="M7 19c-2.5-1-3-4-1-5.5 1.6-1.2 4-.4 5-2 .8-1.4-.3-3 1-4 1.6-1.2 4-.6 5 1.5"/>') },
  { id: 'tank', name: '坦克对决', cat: '实时', acc: '#8e8e93', desc: '钢铁交锋', icon: I('<rect x="4" y="12" width="16" height="5" rx="2.5"/><rect x="8" y="7" width="8" height="5" rx="1.5"/><path d="M16 9.5h4"/>') },
  { id: 'tetris', name: '方块对决', cat: '实时', acc: '#7b5cff', desc: '消行攻敌', icon: I('<rect x="4" y="10" width="5" height="5" rx="1" fill="currentColor"/><rect x="9.5" y="10" width="5" height="5" rx="1"/><rect x="9.5" y="4.5" width="5" height="5" rx="1"/><rect x="15" y="10" width="5" height="5" rx="1"/>') },
  { id: 'maze', name: '迷宫竞速', cat: '竞速', acc: '#64a3ff', desc: '先出迷宫者胜', icon: I('<path d="M4 4h16v16H4zM8 4v8h8M12 20v-4h8"/>') },
  { id: 'fifteen', name: '数字华容道', cat: '竞速', acc: '#ff9f0a', desc: '复原数字拼盘', icon: I('<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="7" y="7" width="4.5" height="4.5" rx="1" fill="currentColor"/><text x="16" y="14.6" font-size="6.5" fill="currentColor" stroke="none" text-anchor="middle" font-weight="700">15</text>') },
  { id: 'g2048', name: '2048 竞速', cat: '竞速', acc: '#e67e22', desc: '先到 2048 者胜', icon: I('<rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor"/>') },
  { id: 'whack', name: '打地鼠对决', cat: '竞速', acc: '#ff6482', desc: '手速大比拼', icon: I('<path d="M5 19l7-7M12 12l4-4c1.5 1.5 4 .5 4-2-2.5 0-3.5-1-3.5-3-2.5 0-3.5 2.5-2 4z" transform="rotate(45 12 12)"/>') },
  { id: 'picpuzzle', name: '拼图竞速', cat: '竞速', acc: '#00c7be', desc: '拼出完整图案', icon: I('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5" opacity=".6"/>') },
  { id: 'memory', name: '记忆翻牌', cat: '反应', acc: '#7b5cff', desc: '配对计分', icon: I('<rect x="4" y="5" width="9" height="14" rx="2"/><rect x="11" y="5" width="9" height="14" rx="2" fill="currentColor" opacity=".25"/>') },
  { id: 'quickdraw', name: '快枪手', cat: '反应', acc: '#ff375f', desc: '反应速度对决', icon: I('<path d="M13 3L5 13h5l-1 8 8-10h-5z" fill="currentColor"/>') },
  { id: 'bulls', name: '猜数字对决', cat: '反应', acc: '#3478f6', desc: '推理破译密码', icon: I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>') },
  { id: 'rps', name: '猜拳锦标赛', cat: '反应', acc: '#ff9f0a', desc: '三局两胜', icon: I('<path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 11V5a1.5 1.5 0 0 1 3 0v6M13 11V6a1.5 1.5 0 0 1 3 0v6.5M16 12.5c2 0 2.8 1.2 2 2.8-1.5 3-3 5.7-6.5 5.7-3.5 0-4.5-2.5-4.5-5"/>') }
];
