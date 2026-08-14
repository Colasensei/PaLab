import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Lang } from '@/utils/lang';

interface Props {
  lang: Lang;
  onClose: () => void;
  onShowEULA: () => void;
}

const CHANGELOG: { ver: string; date: string; items: string[] }[] = [
  {
    ver: 'Alpha 7.5（正式版）', date: '2026-08-14',
    items: [
      '自动生成新增种子输入框：0~16 位纯数字，填 0 为纯随机；相同种子（机器学习关闭、对齐节拍一致）生成完全一致的谱面，可复现分享',
      '难度定数量化到 0.5 档：同档位（±0.5）内相同种子谱面完全一致，跨档才变化；不加歌曲同样可用种子复现',
      '自动生成对齐节拍改为 1/4 拍网格，避免音符全吸到整拍/半拍变成双押',
      '可视化编辑器增强：撤销/重做、快捷键（Ctrl+Z/Y 等）、属性面板、复制粘贴、Ctrl+滚轮缩放',
      '修复音量不持久化：音乐音量与打击音量在音量面板改动即改即存，刷新/重进保留',
      'lingyanspace 智能通道（有 CORS 直连、无 CORS 走 /api 代理），修复生产环境 failed to fetch，内网穿透部署可用',
      '素材修复新增主界面封面：横屏 43.jpg / 竖屏 916.jpg 可云端下载修复',
      'Electron 关闭后台节流（backgroundThrottling），录制/切窗不再静音',
      'Hold 渲染优化：miss 变纯红（不再渐变→纯色跳变）、渐变锚定屏幕内可见段',
      '新增 GNU GPL v3.0 开源许可证；协助开发添加「乖猫猫$ǿ*」（提供公网部署）',
    ],
  },
  {
    ver: 'Alpha 7.4（正式版）', date: '2026-08-13',
    items: [
      '新增自动生成休息段：谱面中期/中后期插入一段 10~20 秒的低难度（约 5.0 定数）放松段落，低难度谱面则更简单',
      '列表封面改用缩略图：谱面库与音乐播放器列表不再渲染完整大图，修复列表加载与滚动卡顿；详情面板封面仍为完整图',
    ],
  },
  {
    ver: 'Alpha 7.3（正式版）', date: '2026-08-13',
    items: [
      '新增「性能模式」设置项：关闭实时模糊与背景粒子，Android 原生层启用硬件加速与 120Hz 高刷新率',
      '新增「长条渐变透明」设置开关（默认开启，可关闭为实心长条）',
      '长条渲染重构：双押黄色描边全包住长条、按住后描边不消失',
      '修复长条渐变突然消失（松手/miss 后渐变始终保留）',
      '长条尾部过判定线即删除；miss 长条整条直接掉下去，成功松手才收拢',
      'Android 调试包改用正式签名（可覆盖安装正式版）',
    ],
  },
  {
    ver: 'Alpha 7.2（正式版）', date: '2026-08-13',
    items: [
      '新增「机器学习」开关（自动生成歌曲面板）：开启后加载界面后台学习谱面库中谱面的音符编排并显示学习进度',
      '脑裂开关调整：默认关闭；开启后自动生成必定插入脑裂段，关闭则不生成',
      '新增歌曲喜爱功能：谱面库与音乐播放器均可标记喜爱（★），支持「仅喜爱」筛选，筛选影响列表与随机播放',
      '播放器顶部布局微调',
    ],
  },
  {
    ver: 'Alpha 7.1（紧急修复）', date: '2026-08-12',
    items: [
      '紧急修复快照',
      '修复游玩中音符凭空消失（同屏音符上限提升、已判定音符更快移出渲染窗口）',
      '界面大小 / 游戏界面大小新增极小档（60%）',
    ],
  },
  {
    ver: 'Alpha 7.0（正式版）', date: '2026-08-12',
    items: [
      '新增社区谱面库（lingyanspace 托管）：谱面库「社区」面板可浏览、搜索、筛选、排序并下载导入玩家分享的谱面',
      '新增公告系统：首页「公告」入口，重要更新置顶自动弹窗、未读黄色提示、按 id 记录已读',
      '关于界面重构：改为与其他页面一致的全屏叠加样式（顶部返回 + 标题 + 内容滚动）',
      '编辑器导出支持自由编辑难度与定数：难度下拉选择、定数不再锁定 ±5',
      '难度分析校准：整体下调约 7%，实际难度通常低于分析值',
      '性能优化：关闭 COMBO 动画（整百脉冲 + 数字 pop）',
      '修复：社区谱面下载 CORS、社区音乐播放泄漏、谱面库选中音乐停不下来等',
    ],
  },
  {
    ver: 'Alpha 6.1（正式版）', date: '2026-08-11',
    items: [
      '支持 OSU 谱面包视频导入：视频作为谱面背景，编辑器右栏可导入/移除/模糊/播放声音',
      '游玩时谱面视频背景：muted 硬件解码 + CSS 模糊，暂停与游戏时钟同步，流畅性能',
      '编辑器新增「导出并导入至谱面库」：打包后直接写入谱面库，免去手动再导入',
      '优化移动端打击音效延迟：资源路径兼容 Capacitor、预加载音效池兜底、首次触摸唤醒音频',
      '设置新增「谱面视频背景」开关：关闭后游玩回退到封面模糊背景',
      '修复加载界面：无曲绘只有封面时显示封面模糊背景',
    ],
  },
  {
    ver: 'Alpha 6.0（正式版）', date: '2026-08-02',
    items: [
      '新增脑裂机制（部分轨道反转）：编辑器「新增效果」可标记起止、游玩时判定线移到顶部音符反向上升（纯视觉，判分不变）',
      '脑裂大幅影响难度定级（覆盖率加成，最高 +2.0）',
      '自动生成：16 以上定数且开启开关时可能插入 4~8 小节脑裂（通常两个轨道），脑裂前后各留 2 拍空白',
      '真人试玩也记录分数（制作/编辑器试玩计入历史、最佳成绩与 RKS），移除「试玩不计分」提示',
      '结算界面评级字母按评级色发光（横竖屏）',
      '谱面库列表选择框平滑滑动过渡、详情面板切换淡入上移动画',
      '修复脑裂长条按住方向、脑裂判定线平滑上移动画',
      '修复无歌谱面暂停时音符继续下落',
    ],
  },
  {
    ver: 'Alpha 5.9（正式版）', date: '2026-08-01',
    items: [
      '判定系统重构为 Phigros 式：判定窗口统一（Perfect ≤80ms / Good ≤160ms / Bad 提前 ≤280ms），Miss 完全自动判定——音符进入可判窗口后没被点击，一过 Good 窗口上界立即自动判 Miss 并移除',
      '判定始终选择离判定线最近的音符（Tap/Hold 一视同仁），修复同轨道 Tap 紧跟 Hold 时按不住',
      '修复 AutoPlay 下音符整个越过判定线才消失（碰线即消失，与判定特效同步）',
      '修复 AutoPlay 下长条不出分不记连击（长条到点自动 Perfect 收尾）',
      '修复暂停 3 秒倒计时内音符继续下落、恢复后音符跳变',
      '修复长条按住时进度环被判定环遮挡（进度环提升到特效最上层）',
    ],
  },
  {
    ver: 'Alpha 5.8（正式版）', date: '2026-08-01',
    items: [
      '修复电脑端音符下落一顿一顿（canvas 改用平滑显示时钟驱动）',
      '音符渲染性能优化（去掉 shadowBlur 发光、双押只留黄描边、canvas DPR 封顶 2）',
      '修复试玩时关闭长条后重新开始又启用长条',
      '编辑器新增「导入 OSU 谱面包」（解析 .osz 内 .osu，仅 4K/mania，自动转谱）',
      'OSU 导入：标题/曲师/谱师自动预填，曲绘自动提取为封面',
      '游戏前摇（lead-in）：开局 1 秒内有判定则插入 4 拍 READY 空档再放歌',
      '前摇期间进度条从满逐渐降到 0，且完全不进行判定',
      '修复前摇期 hold 漏过判定线、前摇结束后卡顿（时钟每帧漂移校正）',
      '谱面包（Zip/OSU）导入免责声明覆盖音频+图片+谱面数据三类内容',
    ],
  },
  {
    ver: 'Alpha 5.7（正式版）', date: '2026-07-31',
    items: [
      '新增音乐播放器（主菜单长按谱面库卡片打开）',
      '音乐播放器：关闭后音乐继续播放、主菜单显示「正在播放」、歌单时长加载修复',
      '自动分析歌曲面板新增「关闭长条」开关（不生成 Hold 音符）',
      '难度体系重新校准：自动生成与分析器共用 Phigros 密度曲线，谱面难度互相自洽',
      '修复高难度自动谱面偏稀疏、手动/编辑器分析难度偏高的问题',
      '修复谱面库预览竞态（快速进出时音频不会带到主界面）',
      'Android 全屏适配增强（状态栏/导航栏透明、刘海屏适配、压制 OEM 延迟重绘）',
    ],
  },
  {
    ver: 'Alpha 5.6（正式版）', date: '2026-07-31',
    items: [
      'Android 端注册为游戏（isGame + 游戏分类）',
      'Android 返回键改为统一导航返回（不再直接退出游戏）',
      '修复竖屏谱面库卡片未占满整行（4 个按钮窜位）',
      '双押音符黄边更明显（显式黄色描边 + 发光增强）',
      'Android 打击音效延迟优化（resume 完成后调度）',
    ],
  },
  {
    ver: 'Alpha 5.5（正式版）', date: '2026-07-31',
    items: [
      '主菜单新增背景图（横屏 43.jpg / 竖屏 916.jpg，缺失自动回退原背景）',
      '主菜单底部导航文字纯白 + 黑色阴影',
      '谱面库卡片不再压暗、文字与卡片加阴影',
      '移除检查更新/制作谱面/手动制作/帮助页面的重复返回键',
      '修复制作/更新/帮助界面切换动画（与设置界面统一）',
      '模糊背景上叠加压暗层提升可读性',
    ],
  },
  {
    ver: 'Alpha 5.4（正式版）', date: '2026-07-31',
    items: [
      '音符渲染全面迁移至 Canvas（Tap/Hold 直接绘制，告别 DOM div）',
      '主菜单界面重做（Logo 左上、个人信息、谱面库卡片、文字导航）',
      '谱面库选曲音乐预览（离库自动降音量、切换歌曲渐入、退出停止）',
      '长条按住渲染修复（头部锁定判定线、尾部渐短、落完消失）',
      '音符改为四方直角样式',
      '延迟校准预览修复（音符在拍点到达判定线）',
      '主菜单「更新」有新版时显示黄色提示',
    ],
  },
  {
    ver: 'Alpha 5.3（正式版）', date: '2026-07-30',
    items: [
      '主界面卡片式 UI 大改 + 曲绘轮播背景',
      '暂停/恢复系统完善（3-2-1 倒计时恢复）',
      '竖屏立绘常关（showMascot 设置）',
      'Android 全屏沉浸式隐藏状态栏',
      'FPS 显示开关',
      '去除 Hold 动画',
    ],
  },
  {
    ver: 'Alpha 5.2（正式版）', date: '2026-07-29',
    items: [
      '修复 import.meta.env 生产构建兼容性',
      '准度条红区缩小、素材修复直链',
      '更新系统 lingyanspace 升级托管',
    ],
  },
  {
    ver: 'Alpha 5.1（正式版）', date: '2026-07-29',
    items: [
      '准度条红区大幅缩小（10%），绿黄占比增大',
      '素材修复切换至升级托管服务直链',
      '更新系统完善（进度条+速度+错误详情）',
    ],
  },
  {
    ver: 'Alpha 5.0（正式版）', date: '2026-07-29',
    items: [
      '更新系统切换至 lingyanspace 升级托管服务',
      '下载进度条 + 速度显示 + 错误详情',
      '素材修复云端下载 + 检查更新完善',
    ],
  },
  {
    ver: 'Alpha 4.7（正式版）', date: '2026-07-29',
    items: [
      '素材修复改为云端一键下载（七牛云）',
      '新增更新检查系统（主菜单 + 自动检测）',
      '打击音效延迟优化、高密度渲染修复',
    ],
  },
  {
    ver: 'Alpha 4.6（正式版）', date: '2026-07-29',
    items: [
      '素材修复改为云端一键下载（七牛云）',
      '新增更新检查系统（主菜单按钮 + 自动检测）',
      'perf_maxVisibleNotes 默认提升至 1000',
    ],
  },
  {
    ver: 'Alpha 4.5（正式版）', date: '2026-07-29',
    items: [
      '修复高密度谱面渲染停止恶性 bug',
      '完善帮助页面（编辑器、准度条、正解音）',
    ],
  },
  {
    ver: 'Alpha 4.4（正式版）', date: '2026-07-28',
    items: [
      '新增准度条（设置→开启，底部显示打击偏移）',
      '编辑器框选 + 批量移动/删除 + 节拍线标签',
      '正解音模式、打击音效延迟优化',
    ],
  },
  {
    ver: 'Alpha 4.3（正式版）', date: '2026-07-28',
    items: [
      '新增「正解音」模式（谱面库 Auto play / Mirror 旁开关）',
      '正解音模式：打击音效始终与谱面对齐，无视玩家操作',
      '自定义打击音效修复、打击音效延迟大幅优化',
    ],
  },
  {
    ver: 'Alpha 4.2（正式版）', date: '2026-07-28',
    items: [
      '打击音效延迟大幅优化（管线防休眠、去除热路径阻塞调用）',
      '自定义打击音效修复（设置→素材修复 导入后真正生效）',
      'Android 端打击音质大幅提升',
    ],
  },
  {
    ver: 'Alpha 4.1（正式版）', date: '2026-07-28',
    items: [
      '打击音效预热优化，减少延迟',
      '音符渲染性能优化（CSS box-shadow 精简、GPU 合成层）',
      'ACC 计算性能优化（单次遍历）',
      '自动播放轨道高亮仅在 overlord 模式显示',
    ],
  },
  {
    ver: 'Alpha 4.0（正式版）', date: '2026-07-28',
    items: [
      '修复 n 押音效丢失问题（doubleGroupId:0 / null 统一处理）',
      '修复 hold 音符计分精度',
      'PC / Android 正式双端构建',
    ],
  },
  {
    ver: 'Alpha 3.9（正式版）', date: '2026-07-27',
    items: [
      '修复旧谱 n 押音效丢失问题',
      'n 押分组检测更健壮',
    ],
  },
  {
    ver: 'Alpha 3.7（正式版）', date: '2026-07-27',
    items: [
      '运行时自动检测并修正 n 押分组（缺标注、部分标注、冲突标注自动修复）',
      '自动分析歌曲面板新增「对齐节拍」开关',
      '「关于」界面更新日志支持内容超出时滚动',
    ],
  },
  {
    ver: 'Alpha 3.6（正式版）', date: '2026-07-27',
    items: [
      '新增可视化谱面编辑器（节拍线点击放置、试玩、保存、Zip 导入/导出）',
      '新增捐赠感谢界面',
      '扩充「关于」界面（双栏布局 + 竖屏标签切换）',
      '编辑器自动检测 n 押分组，自动播放多押特效/音效修复',
      'Perfect/Good/Bad 判定分级特效（金/蓝/无），Bad/Miss 不触发音效',
    ],
  },
  {
    ver: 'Alpha 3.5（正式版）', date: '2026-07-26',
    items: [
      '结算界面全面重做（横屏/竖屏自适应，Georgia / Helvetica Neue 字体）',
      '加载界面优化（模糊 15px、进度条对齐、页面跳转动画）',
      'Tips 系统扩展至约 500 条，Fisher-Yates 洗牌无重复',
      '谱面库竖屏间距优化，双击播放，选中状态持久化',
      '新增制谱模式选择（自动生成 / 手动录制）',
      '新增手动录制功能（键盘 + 触屏输入，长按判定）',
      '延迟校准简化为手动滑块 + 节拍预览，标注不稳定警告',
      '暂停恢复功能暂时禁用（冻结问题）',
      '音频 resume 防冻结处理',
      'BPM 始终可编辑（不再限制开发者模式）',
      '音符大小滑块（0.5x ~ 2.0x）',
      '设置面板 UI 优化，警告文字内嵌按钮',
      '修复多处 TypeScript 编译错误',
      '性能优化',
    ],
  },
  {
    ver: 'Alpha 3.4（未发出）', date: '',
    items: [
      '测试在线更新服务（七牛云）',
    ],
  },
  {
    ver: '0.3.0（版本统一）', date: '2026-07-25',
    items: [
      '版本号体系统一：Alpha 3.0 / 0.3.0',
      '加载界面重写：模糊压暗曲绘背景 + 原曲绘剪影 + LOADING 增长动画 + 100 条随机 Tips',
      '界面切换动画（从右往左淡入、从左往右淡出）',
      '全面本地化：移除所有联网请求',
      '返回键统一为文字「返回」，多语言修复',
    ],
  },
  {
    ver: '0.2.4（演出与素材）', date: '2026-07-23',
    items: [
      '结算界面看板娘台词系统：评级 C 或单曲 RKS 不足 3 附「杂鱼」台词、RKS 10 以上「龙币」、15 以上「您？人？」，否则按本局数据给出看板娘风格小建议',
      '新增音符贴图导入（设置 → 个性化）：Tap 贴图保持比例、Hold 贴图拉伸填充',
      '素材修复（设置 → 素材修复）：看板娘立绘、打击音效本地导入并持久化',
      '新增谱面延时调整（tap-along 节拍校准）、音符大小缩放（0.5x~2.0x）、音量面板',
    ],
  },
  {
    ver: '0.2.3（移动端）', date: '2026-07-21',
    items: [
      '触控重构：Pointer Events 统一鼠标与触控、多点触控、修复断触（4 轨同按后再次按必断触问题）',
      '移动端性能优化：GPU 合成层（will-change / translateZ）、contain 渲染隔离、状态更新节流、同屏音符裁剪',
      'Android 谱面包导出（Capacitor Filesystem + Share）',
      '打击音效延迟优化、音频可视化高频裁剪拉伸',
    ],
  },
  {
    ver: '0.2.2（交互完善）', date: '2026-07-18',
    items: [
      '暂停系统重写：双击防误触、纯符号面板（▶ 继续 / ⟳ 重试 / ✕ 退出）、统一返回符号',
      '新增目标模式：FC / AP 目标，失败自动重启 + 弹跳动画 + 失误音符红色标记',
      '新增镜像模式、无敌娱乐模式（INVINCIBLE，全部判定 Perfect、不计分不存档）',
      '谱面库选中持久化、个人信息保存修复',
    ],
  },
  {
    ver: '0.2.1（视觉现代化）', date: '2026-07-14',
    items: [
      '新增「UI 模糊效果」设置：关闭后全局模糊（实时与预生成）全部移除',
      '背景模糊改为 Canvas 预生成静态图（blurImage），不消耗实时性能',
      '主界面看板娘立绘（横竖屏自适应、景深遮挡效果）',
      '去卡片化，统一 Apple 风格扁平 UI',
    ],
  },
  {
    ver: '0.2.0（开发者系统）', date: '2026-07-08',
    items: [
      '新增开发者面板：参数覆盖系统（130+ 参数），每个设置显示默认值，一键恢复全部默认',
      '判定 / Hold / 计分 / 音符物理 / 渲染 / 特效 / 音频 / UI 参数全部接线生效',
      '新增「性能」Tab：目标帧率、同屏音符上限、渲染画质、低功耗模式',
      '设置修改即时持久化（无需手动保存）',
    ],
  },
  {
    ver: '0.1.2（音频系统）', date: '2026-06-30',
    items: [
      '打击音效系统：低延迟播放、自定义音效导入、音量控制',
      '音乐预览 / 播放器雏形',
    ],
  },
  {
    ver: '0.1.1（自动生成）', date: '2026-06-24',
    items: [
      '谱面自动生成：音频分析（BPM / onset 能量）→ 自动铺谱（tap / hold / double）',
      '难度定级（NPS → 定数 → EZ/NM/HD/IN/AT）、流速调节',
      '音频可视化（频谱柱）',
    ],
  },
  {
    ver: '0.1.0（玩法扩展）', date: '2026-06-18',
    items: [
      'Hold 长条：按住判定、进度环、松手判定',
      '双押 / 多押（n 押）分组与判定',
      '自动播放（AutoPlay）',
    ],
  },
  {
    ver: '0.0.3（谱面系统）', date: '2026-06-10',
    items: [
      '谱面包（.zip）导入导出，本地谱面库管理',
      '曲绘 / 封面显示、背景切换',
      '谱面信息编辑（BPM、轨道数、定数、拍号）',
    ],
  },
  {
    ver: '0.0.2（核心玩法）', date: '2026-06-05',
    items: [
      '判定系统：Perfect / Good / Bad / Miss 分级，计分、连击、ACC',
      '结算界面雏形（评级、统计、历史记录）',
      'RKS 排名系统（单曲 RKS + 总 RKS）',
    ],
  },
  {
    ver: '0.0.1（初始版本）', date: '2026-06-01',
    items: [
      '项目初始化：Vite + React + TypeScript 脚手架，主界面框架（主菜单 / 谱面库 / 设置 / 关于）',
      'Canvas 音符下落渲染雏形，基础游玩流程（选曲 → 下落 → 判定 → 结算）',
      'Web Audio 基础打击音效',
    ],
  },
];

type AboutTab = 'info' | 'changelog';

export const AboutScreen: React.FC<Props> = ({ lang, onClose, onShowEULA }) => {
  const [tab, setTab] = useState<AboutTab>('info');

  const infoContent = (
    <>
      <div className="about-logo">PALAB</div>
      <div className="about-ver">Alpha 7.5</div>
      <div className="about-ver about-ver-sub">v0.7.5</div>

      <div className="about-section">
        <div className="about-label">{lang === 'zh' ? '作者' : 'Author'}</div>
        <div className="about-name">ColaSensei</div>
      </div>

      <div className="about-section">
        <div className="about-label">{lang === 'zh' ? '协助开发' : 'Contributor'}</div>
        <span className="about-link about-link-plain">满目星辰</span>
        <span className="about-link about-link-plain">C.C</span>
        <span className="about-link about-link-plain">ATHAZA2322</span>
        <a className="about-link" href="https://space.bilibili.com/3546634667428724" target="_blank" rel="noopener noreferrer">
          {lang === 'zh' ? '重音teto的法棍厨子' : 'Teto\'s Baguette Chef'}
        </a>
        <div className="about-contrib-note">{lang === 'zh' ? '帮助测试和提出建议' : 'Testing & feedback'}</div>
        <span className="about-link about-link-plain">乖猫猫$ǿ*</span>
        <div className="about-contrib-note">{lang === 'zh' ? '提供公网部署' : 'Provided public deployment'}</div>
      </div>

      <div className="about-links">
        <a className="about-link" href="https://space.bilibili.com/3546689348569553" target="_blank" rel="noopener noreferrer">
          Bilibili @ColaSensei
        </a>
        <a className="about-link" href="https://github.com/ColaSensei" target="_blank" rel="noopener noreferrer">
          GitHub @ColaSensei
        </a>
      </div>

      <button className="about-eula-btn" onClick={onShowEULA}>
        {lang === 'zh' ? '用户协议' : 'Terms of Service'}
      </button>

      <div className="about-section">
        <div className="about-label">{lang === 'zh' ? 'QQ 群' : 'QQ Group'}</div>
        <div className="about-name" style={{ fontSize: 16 }}>1072635157</div>
        <div className="about-contrib-note">{lang === 'zh' ? '测试研讨群聊，欢迎加入，群内有最新版资源' : 'Test & discussion group, latest builds inside'}</div>
      </div>

      <p className="about-footer">
        {lang === 'zh' ? '感谢游玩 Palab' : 'Thanks for playing Palab'}
      </p>

      {/* 特别鸣谢圆角矩形 */}
      <div className="about-xwhite-box">
        <div className="about-xwhite-title">{lang === 'zh' ? '特别鸣谢' : 'Special Thanks'}</div>
        <img className="about-xwhite" src="/xWhite.png" alt="xWhite" />
        <div className="about-xwhite-sub">{lang === 'zh' ? '提供的支持' : 'Support provided'}</div>
      </div>
    </>
  );

  const changelogContent = (
    <div className="about-changelog">
      <h2>{lang === 'zh' ? '更新日志' : 'Changelog'}</h2>
      {CHANGELOG.map((entry, i) => (
        <div key={i}>
          <h3>{entry.ver}{entry.date ? ` — ${entry.date}` : ''}</h3>
          <ul>
            {entry.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return createPortal(
    <div className="ann-overlay about-overlay">
      <div className="ann-top">
        <button className="btn btn-primary ann-back" onClick={onClose}>{lang === 'zh' ? '返回' : 'Back'}</button>
        <h3 className="ann-title">{lang === 'zh' ? '关于' : 'About'}</h3>
        <span className="ann-count">Alpha 7.5</span>
      </div>
      <div className="ann-list about-list">
        {/* 宽屏：双栏布局 */}
        <div className="about-layout about-wide">
          <div className="about-left">{infoContent}</div>
          <div className="about-right">{changelogContent}</div>
        </div>

        {/* 竖屏：标签切换 */}
        <div className="about-tabs about-narrow">
          <div className="about-tab-bar">
            <button
              className={`about-tab ${tab === 'info' ? 'active' : ''}`}
              onClick={() => setTab('info')}
            >
              {lang === 'zh' ? '关于' : 'About'}
            </button>
            <button
              className={`about-tab ${tab === 'changelog' ? 'active' : ''}`}
              onClick={() => setTab('changelog')}
            >
              {lang === 'zh' ? '更新日志' : 'Changelog'}
            </button>
          </div>
          <div className="about-tab-content">
            {tab === 'info' ? infoContent : changelogContent}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
