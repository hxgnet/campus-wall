import React from 'react';

// 统一渲染帖子 / 评论 / 私信 / 群聊中的图片、视频、语音
export default function MediaView({ media, images, small = false }) {
  const items = (media && media.length)
    ? media
    : (images || []).map((url) => ({ type: 'image', url }));
  if (!items.length) return null;
  return (
    <div className={`media-grid ${small ? 'media-small' : ''}`} onClick={(e) => e.stopPropagation()}>
      {items.map((m, i) => {
        if (m.type === 'video') {
          return <video key={i} src={m.url} controls preload="metadata" className="media-video" />;
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
          <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="media-image-link">
            <img src={m.url} alt="" loading="lazy" />
          </a>
        );
      })}
    </div>
  );
}
