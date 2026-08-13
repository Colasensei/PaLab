import React from 'react';
import { Lang } from '@/utils/lang';

interface Props {
  lang: Lang;
}

export const HelpScreen: React.FC<Props> = ({ lang }) => {
  return (
    <div className="screen help-screen">
      <div className="help-container">
        <div className="help-topbar">
          <span className="help-title">{lang === 'zh' ? '游戏指南' : 'Game Guide'}</span>
        </div>

        <div className="help-scroll">
          {lang === 'zh' ? (
            <>
              {/* 欢迎 */}
              <div className="help-card">
                <h2>欢迎来到 Palab</h2>
                <p>Palab 是一款受 Phigros 启发的下落式节奏游戏。您将随着音乐的节奏，在恰当的时机敲击键盘对应按键，击打从屏幕上方落下的音符。本指南将详细介绍游戏的所有功能和玩法。</p>
              </div>

              {/* 基础玩法动画演示 */}
              <div className="help-card">
                <h2>基础玩法</h2>
                <div className="help-demo help-demo-notes">
                  <div className="help-note-demo help-note-fall">◆</div>
                  <div className="help-line-demo" />
                  <div className="help-key-demo">D F J K</div>
                </div>
                <p>音符从屏幕上方落下，当其到达判定线（屏幕中下部的横线）时，按下对应轨道的按键。判定分为四个等级：</p>
                <ul>
                  <li><b style={{ color: '#FFD700' }}>Perfect（完美）</b> — 偏差 ≤ 80ms，获得满分</li>
                  <li><b style={{ color: '#4488FF' }}>Good（良好）</b> — 偏差 ≤ 160ms，获得 65% 分数</li>
                  <li><b style={{ color: '#FF4444' }}>Bad（较差）</b> — 偏差较大，不得分</li>
                  <li><b style={{ color: '#888' }}>Miss（丢失）</b> — 未按下或偏差过大</li>
                </ul>
              </div>

              {/* 轨道 */}
              <div className="help-card">
                <h2>轨道与按键</h2>
                <p>游戏支持 2K、4K、6K、8K 四种轨道配置：</p>
                <table className="help-table">
                  <thead><tr><th>轨道数</th><th>对应按键</th><th>适合人群</th></tr></thead>
                  <tbody>
                    <tr><td>2K</td><td>F J</td><td>新手入门</td></tr>
                    <tr><td>4K</td><td>D F J K</td><td>标准玩法</td></tr>
                    <tr><td>6K</td><td>S D F J K L</td><td>进阶挑战</td></tr>
                    <tr><td>8K</td><td>A S D F J K L ;</td><td>高手领域</td></tr>
                  </tbody>
                </table>
              </div>

              {/* 长条 */}
              <div className="help-card">
                <h2>Hold 音符（长按）</h2>
                <div className="help-demo help-demo-hold">
                  <div className="help-hold-bar" />
                  <div className="help-hold-circle" />
                </div>
                <p>Hold 音符需要按住对应按键不放，直到音符尾部到达判定线。按住期间，音符的尾部会被判定线"吃掉"，并在判定线处显示金色进度环。松手时根据按住时长判定：</p>
                <ul>
                  <li>按住超过 78% 时长 → <b style={{ color: '#FFD700' }}>Perfect</b></li>
                  <li>按住不足 78% → <b style={{ color: '#FF4444' }}>Bad</b></li>
                  <li>到达尾部时仍按住 → 自动 <b style={{ color: '#FFD700' }}>Perfect</b></li>
                </ul>
              </div>

              {/* 双押 */}
              <div className="help-card">
                <h2>双押与交互</h2>
                <p>当两个音符同时出现在不同轨道上时，即为"双押"（Double）。双押音符带有黄色发光特效。谱面中还可能出现"交互"（Trill）——两个轨道快速交替出现音符——和"楼梯"（Stair）——音符逐轨上升或下降的排列。</p>
              </div>

              {/* 评分系统 */}
              <div className="help-card">
                <h2>评分与 RKS 系统</h2>
                <p>Palab 采用 Phigros 风格的 RKS（Ranking Score）排名系统：</p>
                <ul>
                  <li>每首谱面满分 <b>100,000</b> 分</li>
                  <li>评级：C → B → A → S → V（Full Combo）→ Φ（All Perfect）</li>
                  <li>单曲 RKS = ((ACC×100 − 55) / 45)² × 谱面定数 × K数因子（ACC ≥ 70%）</li>
                  <li>K数因子：2K=0.35 / 4K=1.00 / 6K=2.20 / 8K=3.50（可在开发者面板调整）</li>
                  <li>综合 RKS = 前 20 首最高单曲 RKS 的平均值（不足 20 首显示 --）</li>
                  <li>谱面定数范围 1.0 ~ 18.0，对应 EZ / NM / HD / IN / AT 五个难度等级</li>
                </ul>
              </div>

              {/* 制作谱面 */}
              <div className="help-card">
                <h2>制作谱面</h2>
                <p>Palab 提供完整的谱面制作流程：</p>
                <ol>
                  <li>在主菜单点击「制作谱面」进入配置面板</li>
                  <li>设置 BPM、拍号、轨道数和难度定数</li>
                  <li>选择音频文件（需同意版权声明）</li>
                  <li>系统将自动分析音频并生成谱面</li>
                  <li>在 Song Panel 调整流速和打击音量后试玩</li>
                  <li>试玩也会记录成绩，完成后可编辑谱面信息并导出 .zip 文件</li>
                </ol>
                <p>谱面支持封面、曲绘、简介等元数据。导出的谱面可以分享给其他玩家。</p>
              </div>

              {/* 谱面库 */}
              <div className="help-card">
                <h2>谱面库</h2>
                <p>谱面库是 Palab 的核心功能之一。您可以导入他人分享的谱面包（.zip 格式），在谱面库中浏览、排序和管理所有谱面。</p>
                <ul>
                  <li>支持按名称、难度、RKS、分数排序</li>
                  <li>每条谱面显示封面、难度标签、定数和最高成绩</li>
                  <li>选中后可查看详细信息和挑战记录</li>
                  <li>支持流速调节和自动演奏模式（不计分）</li>
                  <li>可删除不需要的谱面</li>
                </ul>
              </div>

              {/* 设置 */}
              <div className="help-card">
                <h2>设置说明</h2>
                <ul>
                  <li><b>延迟偏移</b> — 调整音频与判定线的同步，解决蓝牙耳机等延迟问题</li>
                  <li><b>双押提示</b> — 双押音符显示黄色发光特效</li>
                  <li><b>长按音符</b> — 是否启用在谱面中生成 Hold 音符</li>
                  <li><b>实时 ACC</b> — 游戏右上角显示实时准确率</li>
                  <li><b>音频可视化</b> — 游戏时显示频谱动画</li>
                  <li><b>打击音量</b> — 调整敲击反馈音效的音量</li>
                  <li><b>自动演奏</b> — 自动打歌（不计分、不计入 RKS）</li>
                  <li><b>开发者模式</b> — 解锁更多高级选项</li>
                </ul>
              </div>

              {/* 个人信息 */}
              <div className="help-card">
                <h2>个人信息与 RKS 记录</h2>
                <p>点击主菜单右侧的 RKS 胶囊可进入个人记录页面，查看：</p>
                <ul>
                  <li>头像和昵称（点击可编辑）</li>
                  <li>当前综合 RKS 分数</li>
                  <li>前 20 首最佳记录排名</li>
                </ul>
              </div>

              {/* 可视化编辑器 */}
              <div className="help-card">
                <h2>可视化编辑器</h2>
                <p>编辑器提供直观的谱面制作方式，所有音符在时间轴上可视化排列。节拍线左侧标注<b>小节号</b>和<b>对应秒数</b>。</p>
                <ul>
                  <li><b>放置音符</b> — 点击节拍线放置音符（第一次点击选择轨道，第二次确认位置和时长）</li>
                  <li><b>框选</b> — 左键在空白处拖拽可框选多个音符</li>
                  <li><b>拖动移动</b> — 左键拖拽音符上下移动（吸附节拍线）</li>
                  <li><b>批量移动</b> — 选中多个音符后，拖动任意一个即可整体移动</li>
                  <li><b>不吸附移动</b> — 按住 <b>Shift</b> 拖动，跳过节拍吸附</li>
                  <li><b>批量删除</b> — 右键已选中的音符可一键删除全部选中</li>
                  <li><b>单选/多选</b> — 左键点击单选，<b>Shift+点击</b>切换多选</li>
                  <li><b>对齐模式</b> — 支持无吸附 / 1/4拍 / 半拍 / 整拍四种模式</li>
                  <li><b>Hold 音符</b> — 在节拍线上点击不同位置可放置长按音符</li>
                  <li><b>反转滚轮</b> — 勾选后鼠标滚轮方向反转</li>
                </ul>
              </div>

              {/* 准度条 */}
              <div className="help-card">
                <h2>准度条</h2>
                <p>在设置中开启后，游戏底部显示准度条，实时反馈每次打击的偏差。</p>
                <ul>
                  <li>中间白色分隔线 = <b>0ms（完美时机）</b></li>
                  <li>绿色区 = Perfect（±80ms），黄色区 = Good（±160ms），红色区 = Bad/Miss</li>
                  <li>箭头 <b>线性移动</b>，指向当前打击的实际偏差位置</li>
                  <li>左边 = 提前按，右边 = 延后按</li>
                </ul>
              </div>

              {/* 正解音 */}
              <div className="help-card">
                <h2>正解音模式</h2>
                <p>谱面库中开启「正解音」后，打击音效将始终与谱面对齐——无论你按得准不准，听到的都是<b>正确的节奏</b>。计分、判定、Combo 仍为真人操作。</p>
              </div>

              {/* 素材修复 */}
              <div className="help-card">
                <h2>素材修复与个性化</h2>
                <p>设置 → 素材修复 可替换游戏内置资源：</p>
                <ul>
                  <li><b>打击音效</b> — 替换默认的打击反馈音</li>
                  <li><b>看板娘立绘</b> — 替换主菜单角色图</li>
                  <li><b>延迟校准曲</b> — 自定义校准用音频</li>
                </ul>
                <p>设置 → 个性化 可自定义音符贴图：</p>
                <ul>
                  <li><b>Tap 贴图</b> — 替换点击音符的外观（保持比例居中）</li>
                  <li><b>Hold 贴图</b> — 替换长按音符的外观（拉伸填充）</li>
                </ul>
                <p>所有素材存储在浏览器本地，更换后<b>下一局自动生效</b>。</p>
              </div>

              {/* 快捷键 */}
              <div className="help-card">
                <h2>快捷键</h2>
                <table className="help-table">
                  <thead><tr><th>按键</th><th>功能</th></tr></thead>
                  <tbody>
                    <tr><td>Esc</td><td>暂停 / 返回</td></tr>
                    <tr><td>Space</td><td>暂停游戏中</td></tr>
                    <tr><td>D F J K 等</td><td>击打对应轨道音符</td></tr>
                    <tr><td>↑ ↓ 滚轮</td><td>谱面库滚动选歌</td></tr>
                  </tbody>
                </table>
              </div>

              <p style={{ textAlign: 'center', color: '#555', padding: '20px 0', fontSize: 12 }}>
                Palab Alpha 7.3 — Thanks for playing
              </p>
            </>
          ) : (
            <>
              <div className="help-card">
                <h2>Welcome to Palab</h2>
                <p>Palab is a vertical-scrolling rhythm game inspired by Phigros. Press the corresponding keys when notes reach the judgment line to score points.</p>
              </div>
              <div className="help-card">
                <h2>Basic Gameplay</h2>
                <p>Notes fall from the top. Press the matching key when they reach the judgment line.</p>
                <ul>
                  <li><b style={{ color: '#FFD700' }}>Perfect</b> — offset ≤ 80ms</li>
                  <li><b style={{ color: '#4488FF' }}>Good</b> — offset ≤ 160ms</li>
                  <li><b style={{ color: '#FF4444' }}>Bad</b> — large offset</li>
                  <li><b style={{ color: '#888' }}>Miss</b> — not pressed</li>
                </ul>
              </div>
              <div className="help-card">
                <h2>Tracks &amp; Keys</h2>
                <table className="help-table">
                  <thead><tr><th>Tracks</th><th>Keys</th></tr></thead>
                  <tbody><tr><td>2K</td><td>F J</td></tr><tr><td>4K</td><td>D F J K</td></tr><tr><td>6K</td><td>S D F J K L</td></tr><tr><td>8K</td><td>A S D F J K L ;</td></tr></tbody>
                </table>
              </div>
              <div className="help-card">
                <h2>Hold Notes</h2>
                <p>Press and hold the key until the note tail reaches the line. Release early for Bad, hold through for automatic Perfect.</p>
              </div>
              <div className="help-card">
                <h2>RKS System</h2>
                <p>Single-chart RKS = ((ACC×100−55)/45)² × Chart Constant. Overall RKS is the average of your top 20 chart RKS values.</p>
              </div>
              <div className="help-card">
                <h2>Chart Creation</h2>
                <p>Create charts by configuring BPM, track count, and difficulty, then importing an audio file. Play-test your chart (scores not recorded) and export as .zip to share.</p>
              </div>
              <div className="help-card">
                <h2>Chart Library</h2>
                <p>Import .zip chart packages shared by others. Browse, sort, and manage your collection. Adjust speed and use Auto Play for practice.</p>
              </div>
              <div className="help-card">
                <h2>Settings</h2>
                <ul>
                  <li><b>Latency Offset</b> — Sync audio with gameplay</li>
                  <li><b>Hit Volume</b> — Adjust tap sound effect</li>
                  <li><b>Auto Play</b> — Automatic gameplay (no score)</li>
                  <li><b>Developer Mode</b> — Advanced options</li>
                </ul>
              </div>
              <div className="help-card">
                <h2>Visual Editor</h2>
                <p>Place notes visually on the timeline. Beat lines show <b>measure numbers</b> and <b>time in seconds</b> on the left.</p>
                <ul>
                  <li><b>Place notes</b> — Click a beat line (first click picks track, second confirms position)</li>
                  <li><b>Box select</b> — Drag on empty area to select multiple notes</li>
                  <li><b>Drag to move</b> — Drag a note to move it (snaps to beat lines)</li>
                  <li><b>Batch move</b> — Select multiple notes, then drag any of them to move all</li>
                  <li><b>No-snap move</b> — Hold <b>Shift</b> while dragging to bypass beat snapping</li>
                  <li><b>Batch delete</b> — Right-click a selected note to delete all selected</li>
                  <li><b>Multi-select</b> — Click to select one, <b>Shift+Click</b> to toggle</li>
                  <li><b>Snap modes</b> — Off / 1/4 beat / half beat / full beat</li>
                  <li><b>Hold notes</b> — Click at different positions on beat lines for holds</li>
                </ul>
              </div>
              <div className="help-card">
                <h2>Accuracy Bar</h2>
                <p>Enable in Settings to see a real-time accuracy bar at the bottom of the screen.</p>
                <ul>
                  <li>Center divider = <b>0ms (perfect timing)</b></li>
                  <li>Green = Perfect (±80ms), Yellow = Good (±160ms), Red = Bad/Miss</li>
                  <li>The caret moves linearly to show your last hit offset</li>
                  <li>Left = early, Right = late</li>
                </ul>
              </div>
              <div className="help-card">
                <h2>Correct SFX Mode</h2>
                <p>Enable "Correct SFX" in the Chart Library — hit sounds always play at the correct rhythm regardless of your actual timing. Scoring and judgment remain manual.</p>
              </div>
              <div className="help-card">
                <h2>Asset Repair &amp; Personalization</h2>
                <p>Settings → Repair: replace built-in hit sounds, mascot image, and calibration audio.</p>
                <p>Settings → Personalize: customize note skins (Tap = contained, Hold = stretched). All assets stored locally and applied next game.</p>
              </div>
              <p style={{ textAlign: 'center', color: '#555', padding: '20px 0', fontSize: 12 }}>
                Palab Alpha 7.3 — Thanks for playing
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
