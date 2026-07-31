import React, { useEffect, useState } from 'react';
import { Lang } from '@/utils/lang';
import { checkUpdate, getLocalVersion, UpdateInfo } from '@/utils/updateChecker';

interface Props {
  lang: Lang;
  pendingUpdate?: UpdateInfo | null;
  devMode?: boolean;
}

export const UpdateScreen: React.FC<Props> = ({ lang, pendingUpdate, devMode = false }) => {
  const [info, setInfo] = useState<UpdateInfo | null>(pendingUpdate ?? null);
  const [checking, setChecking] = useState(!pendingUpdate);
  const [errMsg, setErrMsg] = useState('');
  const [debug, setDebug] = useState('');
  const [dlState, setDlState] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [dlPct, setDlPct] = useState(0);
  const [dlSpeed, setDlSpeed] = useState(0);
  const [dlErr, setDlErr] = useState('');
  const localVer = getLocalVersion();

  useEffect(() => {
    if (pendingUpdate) return;
    let cancelled = false;
    checkUpdate().then(r => {
      if (cancelled) return;
      if (r.debug) setDebug(r.debug);
      if (r.error) { setErrMsg(r.error); setChecking(false); return; }
      setInfo(r.update);
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [pendingUpdate]);

  const handleDownload = async () => {
    if (!info) return;
    setDlState('downloading'); setDlPct(0); setDlSpeed(0); setDlErr('');
    try {
      const resp = await fetch(info.fileUrl);
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const contentLength = parseInt(resp.headers.get('content-length') || info.fileSize || '0');
      const reader = resp.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      const t0 = Date.now();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const elapsed = (Date.now() - t0) / 1000;
        setDlSpeed(elapsed > 0 ? received / 1024 / elapsed : 0);
        if (contentLength > 0) setDlPct(Math.round((received / contentLength) * 100));
        else setDlPct(Math.min(99, Math.round(received / 1024)));
      }
      const blob = new Blob(chunks);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = info.fileUrl.split('/').pop() || 'update';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      setDlPct(100);
      setDlState('done');
    } catch (e: any) {
      setDlErr(e?.message || 'Unknown');
      setDlState('error');
    }
  };

  return (
    <div className="screen update-screen">
      <div className="update-container">
        <div className="update-topbar">
          <span className="update-title">{lang === 'zh' ? '检查更新' : 'Check for Updates'}</span>
        </div>

        <div className="update-body">
          {checking ? (
            <p className="update-status">{lang === 'zh' ? '正在检查更新...' : 'Checking...'}</p>
          ) : errMsg ? (
            <>
              <p className="update-status update-error">{lang === 'zh' ? '检查失败' : 'Check failed'}: {errMsg}</p>
              {devMode && debug && <pre className="update-debug">{debug}</pre>}
            </>
          ) : info ? (
            <>
              <div className="update-new-version">
                <b>{info.version}</b>
              </div>
              <p className="update-current">
                {lang === 'zh' ? '当前版本' : 'Current version'} <b>{localVer}</b>
              </p>
              <div className="update-changelog">
                {(info.changelog || '').split('\n').filter(Boolean).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              {dlState === 'downloading' ? (
                <div className="update-progress-wrap">
                  <div className="update-progress-track">
                    <div className="update-progress-fill" style={{ width: `${dlPct}%` }} />
                  </div>
                  <span className="update-progress-text">{dlPct}%</span>
                  <span className="update-progress-speed">{dlSpeed.toFixed(0)} KB/s</span>
                </div>
              ) : dlState === 'done' ? (
                <p className="update-status" style={{ color: '#44BB44' }}>{lang === 'zh' ? '下载完成，文件已保存' : 'Download complete'}</p>
              ) : dlState === 'error' ? (
                <>
                  <p className="update-status update-error">{dlErr || (lang === 'zh' ? '下载失败' : 'Failed')}</p>
                  <button className="btn btn-primary update-download-btn" onClick={handleDownload}>{lang === 'zh' ? '重试' : 'Retry'}</button>
                </>
              ) : (
                <button className="btn btn-primary update-download-btn" onClick={handleDownload}>{lang === 'zh' ? '下载更新' : 'Download Update'}</button>
              )}
            </>
          ) : (
            <p className="update-status">
              {lang === 'zh' ? '已是最新版本' : 'You are up to date'}
              <br />
              <span className="update-current-ver">{localVer}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
