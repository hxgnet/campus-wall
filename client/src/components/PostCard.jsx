import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import MediaView from './MediaView.jsx';
import ForwardModal from './ForwardModal.jsx';

export default function PostCard({ post, onLikeChange }) {
  const navigate = useNavigate();
  const [likes, setLikes] = useState(post.likes);
  const [liked, setLiked] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const isSuper = localStorage.getItem('admin_token') && sessionStorage.getItem('admin_role') === 'super';

  const handleLike = async (e) => {
    e.stopPropagation();
    try {
      const r = await api.likePost(post.id);
      setLiked(r.liked);
      setLikes(r.likes);
      if (onLikeChange) onLikeChange(post.id, r.likes);
    } catch (err) { alert(err.message); }
  };

  const superDelete = async (e) => {
    e.stopPropagation();
    const reason = prompt('请填写删除理由（将通知作者，并记入操作记录）：', '违反社区规范');
    if (reason === null) return;
    try {
      await api.adminDeletePost(post.id, reason);
      navigate(0);
    } catch (err) { alert(err.message); }
  };

  const shareLink = (e) => {
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
        {post.activity_signup_required && <span className="anon-badge">需报名</span>}
        <span className="post-time">{post.created_at}</span>
      </div>

      <div className="post-content">{post.content}</div>

      {post.quote_post_id && (
        <div className="quote-card" onClick={(e) => { e.stopPropagation(); navigate(`/post/${post.quote_post_id}`); }}>
          <div className="quote-head">📎 引用 @{post.quote_nickname || '同学'} · {post.quote_category || '帖子'}</div>
          <div className="quote-body">{post.quote_content?.slice(0, 80) || '（原帖内容已删除）'}</div>
        </div>
      )}

      {post.tags && post.tags.length > 0 && (
        <div>{post.tags.map((t, i) => <span key={i} className="tag-chip">#{t}</span>)}</div>
      )}

      <MediaView media={post.media} images={post.images} />

      {post.activity_signup_required && (
        <div className="activity-signup-line">🎫 该活动需报名 · {post.signup_count || 0} 人已报名</div>
      )}

      <div className="post-footer">
        <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike}>
          <span>{liked ? '❤️' : '🤍'}</span><span>{likes}</span>
        </button>
        <span className="post-action"><span>💬</span><span>评论</span></span>
        <span className="post-action"><span>👁️</span><span>{post.views || 0}</span></span>
        <button className="post-action" onClick={shareLink}><span>🔗</span></button>
        <button className="post-action" onClick={(e) => { e.stopPropagation(); setForwarding(true); }}><span>📤</span><span>转发</span></button>
        <button className="post-action" onClick={(e) => { e.stopPropagation(); navigate(`/create?quote=${post.id}`); }}><span>✏️</span><span>引用</span></button>
        {isSuper && <button className="post-action" onClick={superDelete} style={{ color: 'var(--danger)' }}><span>🗑️</span><span>超管删除</span></button>}
        {!post.is_anonymous && post.user_id ? (
          <span className="post-author" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.user_id}`); }}>
            <span className="post-avatar">
              {post.avatar ? <img src={post.avatar} alt="" /> : (post.nickname || '?')[0]}
            </span>
            {post.custom_tag && (
              <span className="user-custom-tag" style={{ color: post.tag_color || 'var(--primary)' }}>{post.custom_tag}</span>
            )}
            <span className="post-nick">@{post.nickname}</span>
          </span>
        ) : (
          <span className="post-nick" style={{ marginLeft: 'auto' }}>🎭 匿名同学</span>
        )}
      </div>

      {forwarding && (
        <ForwardModal share={{ type: 'post', id: post.id }} onClose={() => setForwarding(false)} />
      )}
    </div>
  );
}
