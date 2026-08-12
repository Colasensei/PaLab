import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Lang } from '@/utils/lang';
import { parseChartZip } from '@/utils/chartParser';
import { getAllPackages, parseChartMeta, ownedKey, resolveDownloadUrl, SW_CHART_LIBRARY } from '@/utils/lingyanspace';
import type { ChartPackage } from './ChartLibrary';

interface CommunityChart {
  id: string;
  title: string;
  artist: string;
  author: string;
  difficulty: string;
  constant: number;
  desc: string;
  downloads: number;
  fileUrl: string | null;
  fileSize: string;
  createTime: number;
  /** 详情 zip 解压后的谱面包（undefined=未加载 / null=加载失败） */
  pkg?: ChartPackage | null;
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

function fmtSize(s: string) {
  const n = parseInt(s, 10);
  if (!n) return '';
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB';
  return n + ' B';
}

interface Props {
  onClose: () => void;
  onImported: (pkg: ChartPackage) => void;
  /** 本地谱面库（用于标记“已拥有”：标题+曲师+谱师+难度完全匹配） */
  localCharts: ChartPackage[];
  lang: Lang;
}

export const CommunityPanel: React.FC<Props> = ({ onClose, onImported, localCharts, lang }) => {
  const [all, setAll] = useState<CommunityChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [diff, setDiff] = useState('');
  const [sort, setSort] = useState('latest');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [sel, setSel] = useState<CommunityChart | null>(null);
  const [landscape, setLandscape] = useState(window.innerWidth > window.innerHeight);
  const pageSize = 15;
  const listRef = useRef<HTMLDivElement>(null);
  // 详情预览音频：卸载时停止，防止声音残留
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // 横竖屏自适应
  useEffect(() => {
    const onResize = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 已拥有：完全匹配 标题 + 曲师 + 谱师 + 难度
  const ownedKeys = useMemo(
    () => new Set(localCharts.map(c => ownedKey(c.title, c.artist, c.author, c.difficulty))),
    [localCharts],
  );
  const isOwned = useCallback((c: { title: string; artist: string; author: string; difficulty: string }) =>
    ownedKeys.has(ownedKey(c.title, c.artist, c.author, c.difficulty)), [ownedKeys]);

  // 拉取 lingyanspace 谱面库全部版本列表
  useEffect(() => {
    setLoading(true); setError('');
    getAllPackages(SW_CHART_LIBRARY)
      .then(list => {
        setAll(list.map(p => {
          const m = parseChartMeta(p.versionDes);
          return {
            id: p.id,
            title: p.versionNum || '未知谱面',
            artist: m.artist, author: m.author, difficulty: m.difficulty,
            constant: m.constant, desc: m.desc,
            downloads: p.downloadCount || 0,
            fileUrl: p.fileUrl, fileSize: p.fileSize,
            createTime: parseInt(p.createTimeStamp, 10) || 0,
          };
        }));
      })
      .catch(e => setError(e.message || '网络错误'))
      .finally(() => setLoading(false));
  }, []);

  // 客户端搜索 / 筛选 / 排序
  const filtered = useMemo(() => {
    let list = all;
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      list = list.filter(c =>
        c.title.toLowerCase().includes(t) || c.artist.toLowerCase().includes(t) || c.author.toLowerCase().includes(t));
    }
    if (diff) list = list.filter(c => c.difficulty === diff);
    const arr = [...list];
    if (sort === 'downloads') arr.sort((a, b) => b.downloads - a.downloads);
    else if (sort === 'constant') arr.sort((a, b) => b.constant - a.constant);
    else if (sort === 'title') arr.sort((a, b) => a.title.localeCompare(b.title));
    else arr.sort((a, b) => b.createTime - a.createTime);
    return arr;
  }, [all, q, diff, sort]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > pages && pages >= 1) setPage(pages); }, [page, pages]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [page, q, diff, sort]);

  const apply = () => { setPage(1); };

  // 详情：点进后下载 zip 实时解压
  const loadDetail = useCallback((c: CommunityChart) => {
    if (!c.fileUrl) { setSel(prev => prev && prev.id === c.id ? { ...prev, pkg: null } : prev); return; }
    fetch(resolveDownloadUrl(c.fileUrl)!)
      .then(r => { if (!r.ok) throw new Error('下载失败'); return r.blob(); })
      .then(blob => parseChartZip(blob, `${c.title}.zip`))
      .then(pkg => setSel(prev => prev && prev.id === c.id ? { ...prev, pkg } : prev))
      .catch(() => setSel(prev => prev && prev.id === c.id ? { ...prev, pkg: null } : prev));
  }, []);

  const select = useCallback((c: CommunityChart) => {
    if (c.pkg === undefined) { setSel({ ...c, pkg: null }); loadDetail(c); }
    else setSel(c);
  }, [loadDetail]);

  // 导入本地库（用已解压的 pkg，或先下载）
  const download = useCallback(async (c: CommunityChart) => {
    setDownloading(c.id);
    try {
      let pkg = c.pkg ?? null;
      if (!pkg && c.fileUrl) {
        const r = await fetch(resolveDownloadUrl(c.fileUrl)!);
        if (!r.ok) throw new Error('下载失败');
        pkg = await parseChartZip(await r.blob(), `${c.title}.zip`);
      }
      if (!pkg) throw new Error('无法获取谱面');
      onImported(pkg);
      alert(lang === 'zh' ? '已下载并导入谱面库' : 'Downloaded & added to library');
    } catch (e: any) {
      alert((lang === 'zh' ? '导入失败：' : 'Import failed: ') + (e?.message || ''));
    }
    setDownloading(null);
  }, [onImported, lang]);

  // 详情内容（横屏右侧面板 / 竖屏全屏共用）：基于已解压的 zip 预览
  const renderDetail = (c: CommunityChart) => {
    const ds = DIFF_STYLE[c.difficulty] || { bg: 'rgba(255,255,255,0.15)', fg: '#fff' };
    const owned = isOwned(c);
    const pkg = c.pkg;
    const loadingDetail = pkg === null;
    const cover = pkg ? (pkg.illustrationUrl || pkg.coverUrl) : null;
    return (
      <div className="cp-detail-inner">
        <div className="cp-detail-coverwrap">
          {cover ? (
            <img className="cp-detail-cover" src={cover} alt="" />
          ) : (
            <div className="cp-detail-cover cp-detail-cover-empty">{loadingDetail ? (lang === 'zh' ? '加载中...' : 'Loading...') : ''}</div>
          )}
        </div>
        <div className="cp-detail-info">
          <h2 className="cp-detail-title">{c.title}</h2>
          <div className="cp-detail-meta">{lang === 'zh' ? '曲师' : 'Artist'}：{c.artist || '—'} · {lang === 'zh' ? '谱师' : 'Mapper'}：{c.author || '—'}</div>
          <div className="cp-detail-meta">
            {c.difficulty && <span className="cp-diff" style={{ background: ds.bg, color: ds.fg }}>{c.difficulty}</span>}
            {c.constant > 0 && <span style={{ marginLeft: 8 }}>{lang === 'zh' ? '定级' : 'Const'} {c.constant.toFixed(1)}</span>}
          </div>
          <div className="cp-detail-sub">{lang === 'zh' ? '下载' : 'DL'} {c.downloads}{c.fileSize ? ` · ${fmtSize(c.fileSize)}` : ''}</div>
          {(pkg?.description || c.desc) && <p className="cp-detail-desc">{pkg?.description || c.desc}</p>}
          {pkg?.songUrl && <audio ref={audioRef} controls preload="none" src={pkg.songUrl} className="cp-audio" />}
          <div className="cp-detail-actions">
            <button className="btn btn-primary cp-dl" disabled={downloading !== null || owned || loadingDetail} onClick={() => download(c)} style={btnStyle}>
              {owned ? (lang === 'zh' ? '已拥有' : 'Owned')
                : loadingDetail ? (lang === 'zh' ? '加载中...' : '...')
                : downloading === c.id ? (lang === 'zh' ? '导入中...' : '...')
                : (lang === 'zh' ? '下载并导入' : 'Get & Import')}
            </button>
          </div>
        </div>
      </div>
    );
  };

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

      <div className="cp-body">
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
              <div className={`cp-item${sel && sel.id === c.id ? ' selected' : ''}`} key={c.id} onClick={() => select(c)}>
                <div className="cp-info">
                  <div className="cp-item-title">
                    {c.title}
                    {owned && <span className="cp-owned">{lang === 'zh' ? '已拥有' : 'Owned'}</span>}
                  </div>
                  <div className="cp-item-meta">
                    {c.artist || (lang === 'zh' ? '未知曲师' : 'Unknown')}<span className="cp-sep">/</span>
                    {c.author || (lang === 'zh' ? '未知谱师' : 'Unknown')}
                    {c.difficulty && <span className="cp-diff" style={{ background: ds.bg, color: ds.fg }}>{c.difficulty}</span>}
                    {c.constant > 0 && <span style={{ opacity: 0.5 }}>{c.constant.toFixed(1)}</span>}
                  </div>
                  <div className="cp-item-sub">{lang === 'zh' ? '下载' : 'DL'} {c.downloads}{c.fileSize ? ` · ${fmtSize(c.fileSize)}` : ''}</div>
                </div>
                <button className="btn btn-primary cp-dl" disabled={downloading !== null || owned}
                  onClick={e => { e.stopPropagation(); download(c); }} style={btnStyle}>
                  {owned ? (lang === 'zh' ? '已拥有' : 'Owned')
                    : downloading === c.id ? (lang === 'zh' ? '导入中...' : '...')
                    : (lang === 'zh' ? '下载导入' : 'Get')}
                </button>
              </div>
            );
          })
        )}
      </div>
      {landscape && (
        <div className="cp-detail-pane">
          {sel ? renderDetail(sel) : <div className="cp-empty cp-detail-empty">{lang === 'zh' ? '选择左侧谱面' : 'Select a chart'}</div>}
        </div>
      )}
      </div>

      {!loading && !error && items.length > 0 && (
        <div className="cp-pager">
          <button className="btn btn-primary" disabled={page <= 1} onClick={() => setPage(page - 1)} style={btnStyle}>{lang === 'zh' ? '上一页' : 'Prev'}</button>
          <span className="cp-page-num">{page} / {pages}</span>
          <button className="btn btn-primary" disabled={page >= pages} onClick={() => setPage(page + 1)} style={btnStyle}>{lang === 'zh' ? '下一页' : 'Next'}</button>
        </div>
      )}

      {/* 竖屏：全屏详情覆盖层 */}
      {!landscape && sel && (
        <div className="cp-detail-fs">
          <div className="cp-detail-head">
            <button className="btn btn-primary cp-back" onClick={() => setSel(null)} style={btnStyle}>{lang === 'zh' ? '← 返回列表' : '← Back'}</button>
          </div>
          {renderDetail(sel)}
        </div>
      )}
    </div>
  );

  // 用 Portal 渲染到 body：脱离 .screen-layer 的 stacking context（transform），
  // 保证盖住全局顶栏（z-index 220），点“返回”只关闭面板而非返回主界面
  return createPortal(panel, document.body);
};
