export type Lang = 'zh' | 'en';

type TextMap = Record<string, string>;

const zh: TextMap = {
  // 通用
  'back': '返回',
  'save': '保存',
  'edit': '编辑',
  'confirm': '确认',
  'start': '开始',
  'retry': '重新开始',
  'advanced': '高级设置',
  'reset': '重置',
  'apply': '应用',
  'play': '开始游戏',
  'settings': '设置',
  'language': '语言',
  'chinese': '中文',
  'english': 'English',

  // 主菜单
  'game.title': 'Palab',
  'game.subtitle': '节奏游戏',
  'rks.label': 'RKS',

  // 配置面板
  'bpm': 'BPM',
  'time.signature': '拍号',
  'song.optional': '歌曲（可选）',
  'select.audio': '选择音频...',
  'tracks': '轨道',
  'difficulty': '难度',

  // 歌曲面板
  'normal': '普通',
  'easy': '简单',
  'hard': '困难',
  'insane': '疯狂',
  'imminent': '逼近',
  'speed': '速度',
  'hit.volume': '打击音量',
  'auto.play': '自动演奏',
  'best.score': '最高分',
  'no.data': '无记录',
  'recent': '最近',
  'timing.ms': '判定 (ms)',
  'colors': '颜色',
  'note.color': '音符',
  'hold.color': '长按',
  'bg.color': '背景',
  'line.color': '判定线',
  'reset.config': '重置配置',
  'help': '帮助',

  // 设置面板
  'latency.offset': '延迟偏移',
  'current.offset': '当前偏移',
  'latency.calibration': '延迟校准',
  'double.glow': '双押提示',
  'enable.holds': '长条音符',
  'custom.colors': '自定义颜色',
  'bg.image': '背景图片',
  'change.image': '更换图片',
  'select.image': '选择图片...',
  'clear': '清除',

  // 加载页
  'generating': '生成中...',
  'how.to.play': '玩法说明',
  'notes.fall': '音符从上方落下，到达判定线时按下对应按键！',
  'tap.note': '点击音符',
  'hold.note': '按住音符',
  'double.note': '双押音符',
  'current.keys': '当前按键',

  // 结算页
  'all.perfect': 'ALL PERFECT',
  'full.combo': 'FULL COMBO',
  'score': '分数',
  'pp': 'RKS',
  'total.notes': '总音符数',
  'avg.offset': '平均偏差',
  'max.combo': '最大连击',
  'click.for.details': '点击查看详情',
  'collapse': '收起',

  // 暂停
  'paused': '暂停',
  'resume': '继续',
  'quit': '退出',

  // 延迟校准
  'calibration.title': '延迟校准',
  'calibration.desc': '播放音乐后，观察右侧音符是否与音乐拍子同步。调整延迟偏移直到音符落到判定线与节拍完全一致。',
  'calibration.played': '已播放节拍',
  'calibration.play': '播放音乐',
  'calibration.stop': '停止',
  'calibration.save.back': '保存并返回',
};

const en: TextMap = {
  'back': 'BACK',
  'save': 'SAVE',
  'edit': 'EDIT',
  'confirm': 'CONFIRM',
  'start': 'START',
  'retry': 'RETRY',
  'advanced': 'ADVANCED',
  'reset': 'RESET',
  'apply': 'APPLY',
  'play': 'PLAY',
  'settings': 'SETTINGS',
  'language': 'LANGUAGE',
  'chinese': '中文',
  'english': 'English',

  'game.title': 'Palab',
  'game.subtitle': 'RHYTHM GAME',
  'rks.label': 'RKS',

  'bpm': 'BPM',
  'time.signature': 'TIME SIGNATURE',
  'song.optional': 'SONG (OPTIONAL)',
  'select.audio': 'SELECT AUDIO...',
  'tracks': 'TRACKS',
  'difficulty': 'DIFFICULTY',

  'normal': 'NORMAL',
  'easy': 'EASY',
  'hard': 'HARD',
  'insane': 'INSANE',
  'imminent': 'IMMINENT',
  'speed': 'SPEED',
  'hit.volume': 'HIT VOLUME',
  'auto.play': 'AUTO PLAY',
  'best.score': 'BEST SCORE',
  'no.data': 'NO DATA',
  'recent': 'RECENT',
  'timing.ms': 'TIMING (ms)',
  'colors': 'COLORS',
  'note.color': 'NOTE',
  'hold.color': 'HOLD',
  'bg.color': 'BG',
  'line.color': 'LINE',
  'reset.config': 'RESET CONFIG',
  'help': 'HELP',

  'latency.offset': 'LATENCY OFFSET',
  'current.offset': 'Current Offset',
  'latency.calibration': 'LATENCY CALIBRATION',
  'double.glow': 'DOUBLE GLOW',
  'enable.holds': 'HOLD NOTES',
  'custom.colors': 'CUSTOM COLORS',
  'bg.image': 'BG IMAGE',
  'change.image': 'CHANGE',
  'select.image': 'SELECT...',
  'clear': 'CLEAR',

  'generating': 'GENERATING...',
  'how.to.play': 'HOW TO PLAY',
  'notes.fall': 'Notes fall from the top. Press the key when they reach the judgment line!',
  'tap.note': 'Tap Note',
  'hold.note': 'Hold Note',
  'double.note': 'Double Note',
  'current.keys': 'Current Keys',

  'all.perfect': 'ALL PERFECT',
  'full.combo': 'FULL COMBO',
  'score': 'SCORE',
  'pp': 'RKS',
  'total.notes': 'TOTAL NOTES',
  'avg.offset': 'AVG OFFSET',
  'max.combo': 'MAX COMBO',
  'click.for.details': '点击查看详情',
  'collapse': '收起',

  'paused': 'PAUSED',
  'resume': 'RESUME',
  'quit': 'QUIT',

  'calibration.title': 'LATENCY CALIBRATION',
  'calibration.desc': 'Play music and observe if the notes sync with the beat. Adjust the latency offset until notes hit the judgment line perfectly in time with the music.',
  'calibration.played': 'Beats Played',
  'calibration.play': 'PLAY',
  'calibration.stop': 'STOP',
  'calibration.save.back': 'SAVE & BACK',
};

export function t(key: string, lang: Lang): string {
  const map = lang === 'zh' ? zh : en;
  return map[key] ?? key;
}
