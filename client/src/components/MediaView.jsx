import React, { useState } from 'react';

// 统一渲染帖子 / 评论 / 私信 / 群聊中的图片、视频、语音
export default function MediaView({ media, images, small = false }) {
  const [preview, setPreview] = useState(null);
  const items = (media && media.length)
    ? media
    : (images || []).map((url) => ({ type: 'image', url }));
  if (!items.length) return null;

  const saveMedia = (e, url, type) => {
    e.preventDefault();
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = url;
    a.download = `pengshan-${Date.now()}.${type === 'video' ? 'mp4' : 'jpg'}`;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <>
      <div className={`media-grid ${small ? 'media-small' : ''}`} onClick={(e) => e.stopPropagation()}>
        {items.map((m, i) => {
          if (m.type === 'video') {
            return (
              <div key={i} className="media-video-wrap">
                <video src={m.url} controls preload="metadata" className="media-video" />
                <button type="button" className="media-save" onClick={(e) => saveMedia(e, m.url, 'video')}>⬇ 保存</button>
              </div>
            );
          }
          if (m.type === 'audio') {
            return (
              <div key={i} className="media-audio">
                <span className="media-audio-icon">🎙️</span>
                <audio src={m.url} controls preload="metadata" />
              </div>
            );
          }
          return (
            <a
              key={i}
              href={m.url}
              className="media-image-link"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPreview(m.url); }}
            >
              <img src={m.url} alt="" loading="lazy" />
              <button type="button" className="media-save" onClick={(e) => saveMedia(e, m.url, 'image')}>⬇ 保存</button>
            </a>
          );
        })}
      </div>
      {preview && (
        <div
          className="image-modal"
          onClick={(e) => { e.stopPropagation(); setPreview(null); }}
        >
          <img src={preview} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="media-save image-modal-save" onClick={(e) => saveMedia(e, preview, 'image')}>⬇ 保存图片</button>
        </div>
      )}
    </>
  );
}
