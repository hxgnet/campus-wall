import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const TYPE_TEXT = { like: '赞了', comment: '评论了', comment_reply: '回复了', follow: '关注了' };
const TYPE_ICON = { like: '❤️', comment: '💬', comment_reply: '↩️', follow: '➕' };

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState([]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.getNotifications().then(setList).catch(() => {});
    api.markAllRead().catch(() => {});
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">通知</h1>
        {list.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔔</div><div>暂无通知</div></div>
        ) : list.map((n) => (
          <div key={n.id} className="admin-post" style={{ cursor: n.post_id ? 'pointer' : 'default' }} onClick={() => n.post_id && navigate(`/post/${n.post_id}`)}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{TYPE_ICON[n.type] || '🔔'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>
                  <strong>{n.from_user}</strong> {TYPE_TEXT[n.type] || n.type}
                  {n.content && <span style={{ color: 'var(--text-light)' }}>：{n.content}</span>}
                </div>
                <div className="post-time">{n.created_at}</div>
              </div>
              {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
