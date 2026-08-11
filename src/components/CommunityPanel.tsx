import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Lang } from '@/utils/lang';
import { parseChartZip } from '@/utils/chartParser';
import type { ChartPackage } from './ChartLibrary';

/** 社区服务地址：暂用本地 PalabHub（localhost），内网穿透后再改为公网域名 */
const COMMUNITY_API = 'http://localhost:8787';

interface CommunityChart {
  id: number; title: string; artist: string; author: string;
  difficulty: string; chart_constant: number; description: string;
  size: number; downloads: number; cover_url: string | null;
  illustration_url: string | null; audio_url: string | null;
  file_name: string; created_at: string;
}

const DIFFS = ['EZ', 'NM', 'HD', 'IN', 'AT'];
const DIFF_STYLE: Record<string, { bg: string; fg: string }> = {
  EZ: { bg: '#7EC8E3', fg: '#000' },
  NM: { bg: '#FFFFFF', fg: '#000' },
  HD: { bg: '#FF8C42', fg: '#000' },
  IN: { bg: '#E53E3E', fg: '#fff' },
  AT: { bg: '#1A1A1A', fg: '#fff' },
};
const SORTS = [
  { v: 'latest', labelZh: '最新', labelEn: 'Latest' },
  { v: 'downloads', labelZh: '下载最多', labelEn: 'Most DL' },
  { v: 'constant', labelZh: '定数', labelEn: 'Const' },
  { v: 'title', labelZh: '标题', labelEn: 'Title' },
];
const btnStyle: React.CSSProperties = { cursor: 'pointer', padding: '6px 14px', fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.14)', color: '#ccc', boxShadow: 'none', whiteSpace: 'nowrap' };

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}
const assetUrl = (p: string | null) => (p ? `${COMMUNITY_API}${p}` : '');

interface Props {
  onClose: () => void;
  onImported: (pkg: ChartPackage) => void;
  /** 本地谱面库（用于标记“已拥有”：标题+曲师+谱师+难度完全匹配） */
  localCharts: ChartPackage[];
  lang: Lang;
}

export const CommunityPanel: React.FC<Props> = ({ onClose, onImported, localCharts, lang }) => {
  const [items, setItems] = useState<CommunityChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [diff, setDiff] = useState('');
  const [sort, setSort] = useState('latest');
  const [downloading, setDownloading] = useState<number | null>(null);
  const [detail, setDetail] = useState<CommunityChart | null>(null);
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);
  const pageSize = 15;
  const listRef = useRef<HTMLDivElement>(null);

  // 横竖屏自适应
  useEffect(() => {
    const onResize = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 已拥有：完全匹配 标题 + 曲师 + 谱师 + 难度
  const ownedKeys = useMemo(
    () => new Set(localCharts.map(c => `${c.title}||${c.artist}||${c.author}||${c.difficulty}`)),
    [localCharts],
  );
  const isOwned = useCallback((c: { title: string; artist: string; author: string; difficulty: string }) =>
    ownedKeys.has(`${c.title}||${c.artist}||${c.author}||${c.difficulty}`), [ownedKeys]);

  const load = useCallback((p = page) => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(p), size: String(pageSize), sort });
    if (q.trim()) params.set('q', q.trim());
    if (diff) params.set('diff', diff);
    fetch(`${COMMUNITY_API}/api/charts?${params}`)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { setItems(d.items || []); setTotal(d.total || 0); setPage(d.page || 1); })
      .catch(e => setError(e.message || '网络错误'))
      .finally(() => setLoading(false));
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [page, q, diff, sort]);

  useEffect(() => { load(); }, [load]);

  const apply = () => { setPage(1); };

  const download = async (id: number) => {
    setDownloading(id);
    try {
      const resp = await fetch(`${COMMUNITY_API}/api/charts/${id}/download`);
      if (!resp.ok) throw new Error('下载失败');
      const blob = await resp.blob();
      const pkg = await parseChartZip(blob, `community-${id}.zip`);
      onImported(pkg);
      alert(lang === 'zh' ? '已下载并导入谱面库' : 'Downloaded & added to library');
    } catch (e: any) {
      alert((lang === 'zh' ? '导入失败：' : 'Import failed: ') + (e?.message || ''));
    }
    setDownloading(null);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const panel = (
    <div className={`cp-overlay${landscape ? ' cp-landscape' : ''}`}>
      <div className="cp-top">
        <button className="btn btn-primary cp-back" onClick={onClose} style={btnStyle}>
          {lang === 'zh' ? '返回' : 'Back'}
        </button>
        <h3 className="cp-title">{lang === 'zh' ? '社区谱面' : 'Community Charts'}</h3>
        <span className="cp-hint">{lang === 'zh' ? '仅浏览与下载 · 不上传' : 'Browse & download only'}</span>
      </div>

      <div className="cp-toolbar">
        <input className="cp-input" placeholder={lang === 'zh' ? '搜索标题 / 曲师 / 谱师' : 'Search title / artist / author'}
          value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') apply(); }} />
        <select className="cp-input cp-select" value={diff} onChange={e => { setDiff(e.target.value); }}>
          <option value="">{lang === 'zh' ? '全部难度' : 'All'}</option>
          {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="cp-sort">
          {SORTS.map(s => (
            <button key={s.v} className={`cp-sort-btn${sort === s.v ? ' active' : ''}`} onClick={() => { setSort(s.v); }}>
              {lang === 'zh' ? s.labelZh : s.labelEn}
            </button>
          ))}
        </div>
        <button className="btn btn-primary cp-search" onClick={apply} style={btnStyle}>
          {lang === 'zh' ? '搜索' : 'Search'}
        </button>
      </div>

      <div className="cp-list" ref={listRef}>
        {loading ? (
          <div className="cp-empty">{lang === 'zh' ? '加载中...' : 'Loading...'}</div>
        ) : error ? (
          <div className="cp-empty cp-error">
            <p>{lang === 'zh' ? '无法连接社区服务' : 'Cannot reach community service'}</p>
            <p style={{ fontSize: 11, opacity: 0.6 }}>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="cp-empty">{lang === 'zh' ? '暂无社区谱面' : 'No community charts'}</div>
        ) : (
          items.map(c => {
            const ds = DIFF_STYLE[c.difficulty] || { bg: 'rgba(255,255,255,0.15)', fg: '#fff' };
            const owned = isOwned(c);
            return (
              <div className="cp-item" key={c.id} onClick={() => setDetail(c)}>
                {c.cover_url ? <img className="cp-cover" src={assetUrl(c.cover_url)} alt="" /> : <div className="cp-cover" />}
                <div className="cp-info">
                  <div className="cp-item-title">
                    {c.title}
                    {owned && <span className="cp-owned">{lang === 'zh' ? '已拥有' : 'Owned'}</span>}
                  </div>
                  <div className="cp-item-meta">
                    {c.artist || (lang === 'zh' ? '未知曲师' : 'Unknown')}<span className="cp-sep">/</span>
                    {c.author || (lang === 'zh' ? '未知谱师' : 'Unknown')}
                    <span className="cp-diff" style={{ background: ds.bg, color: ds.fg }}>{c.difficulty}</span>
                    <span style={{ opacity: 0.5 }}>{c.chart_constant.toFixed(1)}</span>
                  </div>
                  <div className="cp-item-sub">{lang === 'zh' ? '下载' : 'DL'} {c.downloads} · {fmtSize(c.size)}</div>
                </div>
                <button className="btn btn-primary cp-dl" disabled={downloading !== null || owned}
                  onClick={e => { e.stopPropagation(); download(c.id); }} style={btnStyle}>
                  {owned ? (lang === 'zh' ? '已拥有' : 'Owned')
                    : downloading === c.id ? (lang === 'zh' ? '导入中...' : '...')
                    : (lang === 'zh' ? '下载导入' : 'Get')}
                </button>
              </div>
            );
          })
        )}
      </div>

      {!loading && !error && items.length > 0 && (
        <div className="cp-pager">
          <button className="btn btn-primary" disabled={page <= 1} onClick={() => setPage(page - 1)} style={btnStyle}>{lang === 'zh' ? '上一页' : 'Prev'}</button>
          <span className="cp-page-num">{page} / {pages}</span>
          <button className="btn btn-primary" disabled={page >= pages} onClick={() => setPage(page + 1)} style={btnStyle}>{lang === 'zh' ? '下一页' : 'Next'}</button>
        </div>
      )}

      {/* 详情覆盖层 */}
      {detail && (
        <div className={`cp-detail${landscape ? ' cp-landscape' : ''}`}>
          <div className="cp-detail-head">
            <button className="btn btn-primary cp-back" onClick={() => setDetail(null)} style={btnStyle}>{lang === 'zh' ? '← 返回列表' : '← Back'}</button>
          </div>
          <div className="cp-detail-body">
            <div className="cp-detail-coverwrap">
              {detail.illustration_url || detail.cover_url ? (
                <img className="cp-detail-cover" src={assetUrl(detail.illustration_url || detail.cover_url)} alt="" />
              ) : (
                <div className="cp-detail-cover cp-detail-cover-empty" />
              )}
            </div>
            <div className="cp-detail-info">
              <h2 className="cp-detail-title">{detail.title}</h2>
              <div className="cp-detail-meta">{lang === 'zh' ? '曲师' : 'Artist'}：{detail.artist || '—'} · {lang === 'zh' ? '谱师' : 'Mapper'}：{detail.author || '—'}</div>
              <div className="cp-detail-meta">
                <span className="cp-diff" style={{ background: (DIFF_STYLE[detail.difficulty] || { bg: 'rgba(255,255,255,0.15)' }).bg, color: (DIFF_STYLE[detail.difficulty] || { fg: '#fff' }).fg }}>{detail.difficulty}</span>
                <span style={{ marginLeft: 8 }}>{lang === 'zh' ? '定数' : 'Const'} {detail.chart_constant.toFixed(1)}</span>
              </div>
              <div className="cp-detail-sub">{lang === 'zh' ? '下载' : 'DL'} {detail.downloads} · {fmtSize(detail.size)} · {detail.created_at}</div>
              {detail.description && <p className="cp-detail-desc">{detail.description}</p>}
              {detail.audio_url && <audio controls preload="none" src={assetUrl(detail.audio_url)} className="cp-audio" />}
              <div className="cp-detail-actions">
                <button className="btn btn-primary cp-dl" disabled={downloading !== null || isOwned(detail)} onClick={() => download(detail.id)} style={btnStyle}>
                  {isOwned(detail) ? (lang === 'zh' ? '已拥有' : 'Owned')
                    : downloading === detail.id ? (lang === 'zh' ? '导入中...' : '...')
                    : (lang === 'zh' ? '下载并导入' : 'Get & Import')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 用 Portal 渲染到 body：脱离 .screen-layer 的 stacking context（transform），
  // 保证盖住全局顶栏（z-index 220），点“返回”只关闭面板而非返回主界面
  return createPortal(panel, document.body);
};
