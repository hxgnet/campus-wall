import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function PostCard({ post, onLikeChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(false);
  const isSuper = localStorage.getItem('admin_token') && sessionStorage.getItem('admin_role') === 'super';

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    try {
      const r = await api.likePost(post.id);
      setLiked(r.liked);
      setLikes(r.likes);
      if (onLikeChange) onLikeChange(post.id, r.likes);
    } catch (err) { alert(err.message); }
  };

  const superDelete = async (e) => {
    e.stopPropagation();
    if (!confirm('确定以超级管理员身份删除该帖子？作者将被扣除 10 点信誉分，此操作不可恢复。')) return;
    try {
      await api.adminDeletePost(post.id);
      navigate(0);
    } catch (err) { alert(err.message); }
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
        {post.is_staff && (
          <span className="anon-badge" style={{ color: post.staff_role === 'super' ? 'var(--danger)' : 'var(--primary-dark)' }}>
            {post.staff_role === 'super' ? '超级管理员发布' : '管理员发布'}
          </span>
        )}
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
        {isSuper && <button className="post-action" onClick={superDelete} style={{ color: 'var(--danger)' }}><span>🗑️</span><span>超管删除</span></button>}
        {!post.is_anonymous && post.user_id ? (
          <span className="post-author" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>
            <span className="post-avatar">
              {post.avatar ? <img src={post.avatar} alt="" /> : (post.nickname || '?')[0]}
            </span>
            <span className="post-nick">@{post.nickname}</span>
          </span>
        ) : (
          <span className="post-nick" style={{ marginLeft: 'auto' }}>🎭 匿名同学</span>
        )}
      </div>
    </div>
  );
}
