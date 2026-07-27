import React, { useState, useRef, useCallback } from 'react';
import { t, Lang } from '@/utils/lang';
import { AccountInfo } from '@/types';

interface Props {
  lang: Lang;
  onSave: (info: AccountInfo) => void;
  onClose: () => void;
  initial?: AccountInfo;
}

const AVATAR_SIZE = 128;

/** 将图片裁切为圆形并返回 base64 data URL */
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

      // 圆形裁切
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

export const ProfileModal: React.FC<Props> = ({ lang, onSave, onClose, initial }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatarUrl ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.avatarUrl ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // 先显示裁剪前的预览
      const raw = URL.createObjectURL(file);
      setPreviewUrl(raw);
      // 裁剪为圆形
      const cropped = await cropCircle(file);
      setAvatarUrl(cropped);
      setPreviewUrl(cropped);
      URL.revokeObjectURL(raw);
    } catch {
      // ignore
    }
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), avatarUrl });
  };

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <div className="profile-modal-header">
          <span className="profile-modal-title">{lang === 'zh' ? '个人信息' : 'Profile'}</span>
          <button className="profile-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="profile-modal-body">
          {/* 头像 */}
          <div className="profile-avatar-section">
            <div
              className="profile-avatar"
              onClick={() => fileRef.current?.click()}
              title={lang === 'zh' ? '点击选择头像' : 'Click to select avatar'}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="avatar" className="profile-avatar-img" />
              ) : (
                <span className="profile-avatar-placeholder">+</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
            <p className="profile-avatar-hint">
              {lang === 'zh' ? '点击上方选择头像' : 'Tap to choose avatar'}
            </p>
          </div>

          {/* 昵称 */}
          <div className="profile-name-section">
            <label className="profile-label">
              {lang === 'zh' ? '昵称' : 'Nickname'}
            </label>
            <input
              className="profile-name-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={lang === 'zh' ? '输入你的昵称...' : 'Enter nickname...'}
              maxLength={16}
              autoFocus
            />
          </div>
        </div>

        <div className="profile-modal-footer">
          <button className="btn btn-outline" onClick={onClose} style={{ padding: '8px 20px' }}>
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!name.trim()}
            style={{ padding: '8px 20px' }}
          >
            {t('save', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
