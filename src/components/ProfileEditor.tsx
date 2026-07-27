import React, { useState, useRef, useCallback } from 'react';
import { t, Lang } from '@/utils/lang';
import { AccountInfo } from '@/types';

interface Props {
  lang: Lang;
  account: AccountInfo | null;
  onSave: (info: AccountInfo) => void;
  onBack: () => void;
}

const AVATAR_SIZE = 128;

function cropCircle(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(AVATAR_SIZE / 2, AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
}

export const ProfileEditor: React.FC<Props> = ({ lang, account, onSave, onBack }) => {
  const [name, setName] = useState(account?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(account?.avatarUrl ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(account?.avatarUrl ?? null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = URL.createObjectURL(file);
      setPreviewUrl(raw);
      const cropped = await cropCircle(file);
      setAvatarUrl(cropped);
      setPreviewUrl(cropped);
      URL.revokeObjectURL(raw);
    } catch { /* ignore */ }
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), avatarUrl });
    setSaved(true);
    setTimeout(() => { setSaved(false); onBack(); }, 600);
  };

  const hasAccount = account && account.name;

  return (
    <div className="screen profile-screen">
      <div className="profile-editor">
        {/* 内容 — 顶栏由全局 header 提供 */}
        <div className="profile-editor-body">
          {/* 头像 */}
          <div className="pe-avatar-section">
            <div
              className="pe-avatar"
              onClick={() => fileRef.current?.click()}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : (
                <span className="pe-avatar-empty">+</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
            <p className="pe-avatar-hint">
              {lang === 'zh' ? '点击更换头像' : 'Tap to change avatar'}
            </p>
          </div>

          {/* 昵称 */}
          <div className="pe-field">
            <label className="pe-label">{lang === 'zh' ? '昵称' : 'Nickname'}</label>
            <input
              className="pe-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={lang === 'zh' ? '输入昵称...' : 'Enter nickname...'}
              maxLength={16}
              autoFocus={!hasAccount}
            />
          </div>

          {/* 保存按钮 */}
          <button
            className="pe-save-btn"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {saved ? '✓ ' : ''}{lang === 'zh' ? '保存个人信息' : 'Save Profile'}
          </button>

          {/* 账号状态 */}
          {hasAccount && (
            <p className="pe-status">
              {lang === 'zh' ? '已设置个人信息' : 'Profile configured'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
