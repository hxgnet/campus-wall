import { useEffect, useState } from 'react';

export default function PinnedCarousel({ posts = [], onOpen }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= posts.length) setIndex(0);
  }, [posts.length, index]);

  useEffect(() => {
    if (posts.length <= 1) return undefined;
    const timer = setInterval(() => setIndex((v) => (v + 1) % posts.length), 5000);
    return () => clearInterval(timer);
  }, [posts.length]);

  if (!posts.length) return null;
  const post = posts[index] || posts[0];
  const image = post.media?.find((m) => m.type === 'image')?.url || post.images?.[0];

  return (
    <div className="pinned-wrap">
      <button type="button" className="pinned-card" onClick={() => onOpen(post.id)}>
        <span className="pinned-badge">📌 置顶</span>
        {image && <img className="pinned-thumb" src={image} alt="" loading="lazy" />}
        <span className="pinned-body">
          <span className="pinned-text">{post.content || '点击查看置顶帖子'}</span>
          <span className="pinned-meta">{post.nickname} · {post.category}{posts.length > 1 ? ` · ${index + 1}/${posts.length}` : ''}</span>
        </span>
      </button>
      {posts.length > 1 && (
        <div className="pinned-dots">
          {posts.map((p, i) => (
            <span key={p.id} className={`pinned-dot ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)} />
          ))}
        </div>
      )}
    </div>
  );
}
