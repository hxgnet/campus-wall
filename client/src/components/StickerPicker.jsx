import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 用户自定义 GIF 表情包选择器，可用于评论与私信
export default function StickerPicker({ onPick, onClose }) {
  const [stickers, setStickers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.getStickers().then(setStickers).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const addGif = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const up = await api.uploadMedia([file]);
      const item = up.files?.[0];
      if (!item) throw new Error('上传失败');
      await api.addSticker(item.url, file.name.replace(/\.[^.]+$/, ''));
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const remove = async (id, e) => {
    e.stopPropagation();
    await api.deleteSticker(id).catch(() => {});
    load();
  };

  return (
    <div className="sticker-panel" onClick={(e) => e.stopPropagation()}>
      <div className="sticker-head">
        <span>我的表情包</span>
        <button type="button" className="btn-text" onClick={onClose}>关闭</button>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="sticker-grid">
        {stickers.map((s) => (
          <div key={s.id} className="sticker-item">
            <img src={s.url} alt={s.name} onClick={() => onPick(s.url)} />
            <button type="button" className="sticker-del" onClick={(e) => remove(s.id, e)}>×</button>
          </div>
        ))}
        {stickers.length === 0 && <div className="sticker-empty">还没有表情包，上传一个 GIF 吧</div>}
      </div>
      <label className="btn btn-secondary btn-block sticker-add">
        {uploading ? '上传中...' : '＋ 添加 GIF 表情包'}
        <input type="file" accept="image/gif,image/*" hidden onChange={addGif} disabled={uploading} />
      </label>
    </div>
  );
}
