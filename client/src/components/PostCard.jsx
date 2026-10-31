import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function PostCard({ post, onLikeChange }) {
  const navigate = useNavigate();
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(false);

  const handleLike = async (e) => {
    e.stopPropagation();
    try {
      const r = await api.likePost(post.id);
      setLiked(r.liked);
      setLikes(r.likes);
      if (onLikeChange) onLikeChange(post.id, r.likes);
    } catch (err) { console.error(err); }
  };

  const share = (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(url).then(() => alert('链接已复制：' + url)).catch(() => prompt('复制链接', url));
  };

  return (
    <div className="post-card" onClick={() => navigate(`/post/${post.id}`)}>
      <div className="post-meta">
        <span className={`post-cat cat-${post.category}`}>{post.category}</span>
        {post.is_anonymous && <span className="anon-badge">匿名</span>}
        <span className="post-time">{post.created_at}</span>
      </div>
      <div className="post-content">{post.content}</div>
      {post.tags && post.tags.length > 0 && (
        <div>{post.tags.map((t, i) => <span key={i} className="tag-chip">#{t}</span>)}</div>
      )}
      {post.images && post.images.length > 0 && (
        <div className="post-images">
          {post.images.slice(0, 9).map((img, i) => (
            <img key={i} src={img} alt="" />
          ))}
        </div>
      )}
      <div className="post-footer">
        <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike}>
          <span>{liked ? '❤️' : '🤍'}</span><span>{likes}</span>
        </button>
        <span className="post-action"><span>💬</span><span>评论</span></span>
        <span className="post-action"><span>👁️</span><span>{post.views || 0}</span></span>
        <button className="post-action" onClick={share}><span>🔗</span></button>
        <span className="post-nick" style={{ marginLeft: 'auto' }}>{post.is_anonymous ? '🎭 匿名同学' : `@${post.nickname}`}</span>
      </div>
    </div>
  );
}
