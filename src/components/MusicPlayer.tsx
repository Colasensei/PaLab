import React, { useState, useEffect } from 'react';
import { Lang, t } from '@/utils/lang';
import { isFav, subscribeFavs } from '@/utils/favStore';
import {
  subscribeMusicPlayer, getMusicPlayerState,
  selectTrack, toggleMusicPlay, nextMusic, prevMusic, seekMusic, cycleMusicMode,
  closeMusicPlayer, setFavOnly, onToggleFav,
} from '@/utils/musicPlayer';
import { CoverThumb } from './CoverThumb';

interface Props {
  lang: Lang;
  uiBlur: boolean;
  onClose: () => void;
}

function fmt(ms: number): string {
  if (!ms || isNaN(ms) || ms <= 0) return '--:--';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export const MusicPlayer: React.FC<Props> = ({ lang, uiBlur, onClose }) => {
  const [, force] = useState(0);
  useEffect(() => subscribeMusicPlayer(() => force(x => x + 1)), []);
  // 喜爱变化（谱面库/播放器切换喜爱）也刷新
  useEffect(() => subscribeFavs(() => force(x => x + 1)), []);
  const st = getMusicPlayerState();

  const { tracks, index, mode, playing, currentTime, duration } = st;
  const current = index >= 0 && index < tracks.length ? tracks[index] : null;

  const handleClose = () => {
    closeMusicPlayer(); // 音乐继续播放
    onClose();
  };

  const modeLabel = mode === 'list' ? t('music.list', lang) : mode === 'single' ? t('music.single', lang) : t('music.shuffle', lang);

  return (
    <div className={`music-player-overlay${uiBlur ? ' mp-blur' : ''}`} onClick={handleClose}>
      <div className="music-player" onClick={e => e.stopPropagation()}>
        {/* 顶部：歌曲列表 */}
        <div className="mp-header">
          <span className="mp-title">{t('music.player.title', lang)}</span>
          <label className="mp-favonly">
            <input type="checkbox" checked={st.favOnly} onChange={e => setFavOnly(e.target.checked)} />
            <span className="mp-favonly-box" />
            <span className="mp-favonly-label">{lang === 'zh' ? '仅喜爱' : 'Fav only'}</span>
          </label>
          <button className="mp-close" onClick={handleClose}>{t('music.close', lang)}</button>
        </div>

        <div className="mp-list">
          {tracks.length === 0 && (
            <div className="mp-empty">{t('music.no.songs', lang)}</div>
          )}
          {tracks.map((tr, i) => (
            <div key={i} className={`mp-item${i === index ? ' active' : ''}`} onClick={() => selectTrack(i)}>
              <div className="mp-item-cover">
                <CoverThumb src={tr.coverUrl} placeholder={<span className="mp-item-ph">{i + 1}</span>} />
              </div>
              <div className="mp-item-info">
                <span className="mp-item-title">{tr.title}</span>
                <span className="mp-item-artist">{tr.artist}</span>
              </div>
              <span className={`mp-fav${isFav(tr.key) ? ' on' : ''}`} onClick={e => { e.stopPropagation(); onToggleFav(tr.key); }} title={lang === 'zh' ? '喜爱' : 'Favorite'}>{isFav(tr.key) ? '★' : '☆'}</span>
              <span className="mp-item-dur">{fmt(tr.duration)}</span>
            </div>
          ))}
        </div>

        {/* 底部：媒体控制 */}
        <div className="mp-controls">
          <div className="mp-now">
            <div className="mp-now-cover">
              {current?.coverUrl ? <img src={current.coverUrl} alt="" /> : <span className="mp-now-ph">♪</span>}
            </div>
            <div className="mp-now-info">
              <span className="mp-now-title">{current?.title ?? '--'}</span>
              <span className="mp-now-artist">{current?.artist ?? ''}</span>
            </div>
          </div>

          <div className="mp-progress">
            <span className="mp-time">{fmt(currentTime)}</span>
            <input
              type="range"
              className="mp-range"
              min={0}
              max={Math.max(1, duration)}
              step={250}
              value={Math.min(currentTime, Math.max(1, duration))}
              onChange={e => seekMusic(parseFloat(e.target.value))}
            />
            <span className="mp-time">{fmt(duration)}</span>
          </div>

          <div className="mp-buttons">
            <button className="mp-mode on" onClick={cycleMusicMode} title={modeLabel}>{modeLabel}</button>
            <button className="mp-btn" onClick={prevMusic} aria-label={lang === 'zh' ? '上一首' : 'Previous'}>«</button>
            <button className="mp-btn mp-btn-play" onClick={toggleMusicPlay} aria-label={playing ? (lang === 'zh' ? '暂停' : 'Pause') : (lang === 'zh' ? '播放' : 'Play')}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="mp-btn" onClick={nextMusic} aria-label={lang === 'zh' ? '下一首' : 'Next'}>»</button>
          </div>
        </div>
      </div>
    </div>
  );
};
