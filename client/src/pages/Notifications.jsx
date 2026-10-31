import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

const TYPE_TEXT = {
  like: '赞了',
  comment: '评论了',
  comment_reply: '回复了',
  follow: '关注了',
  system: '',
  friend_request: '请求添加你为好友',
  message: '给你发来一条私信',
};
const TYPE_ICON = {
  like: '❤️', comment: '💬', comment_reply: '↩️', follow: '➕',
  system: '📢', friend_request: '👥', message: '✉️',
};

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [requests, setRequests] = useState([]);
  const [conversations, setConversations] = useState([]);

  const loadAll = () => {
    api.getNotifications().then(setList).catch(() => {});
    api.getFriendRequests().then(setRequests).catch(() => {});
    api.getConversations().then(setConversations).catch(() => {});
  };

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadAll();
    // 进入通知页即标记全部已读，并通知 Header 清零徽标
    api.markAllRead()
      .then(() => window.dispatchEvent(new Event('notifications-read')))
      .catch(() => {});
  }, [user, navigate]);

  const accept = async (uid) => {
    try {
      await api.acceptFriend(uid);
      setRequests((prev) => prev.filter((r) => r.uid !== uid));
      loadAll();
    } catch (e) { alert(e.message); }
  };

  const openNotification = (n) => {
    if (n.type === 'message' && n.from_user) { navigate(`/messages/${n.from_user}`); return; }
    if (n.type === 'system' || n.type === 'friend_request') return;
    if (n.post_id) navigate(`/post/${n.post_id}`);
  };

  if (!user) return null;

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">通知</h1>

        {requests.length > 0 && (
          <>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>好友请求</h3>
            {requests.map((r) => (
              <div key={r.uid} className="admin-post">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 22 }}>👥</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}><strong>{r.nickname}</strong> 请求添加你为好友</div>
                    <div className="post-time">{r.created_at}</div>
                  </div>
                  <button className="btn btn-primary" style={{ padding: '6px 14px' }} onClick={() => accept(r.uid)}>同意</button>
                </div>
              </div>
            ))}
          </>
        )}

        {conversations.length > 0 && (
          <>
            <h3 style={{ fontSize: 15, margin: '16px 0 10px' }}>私信</h3>
            {conversations.map((c) => (
              <div key={c.uid} className="admin-post" style={{ cursor: 'pointer' }} onClick={() => navigate(`/messages/${c.uid}`)}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="avatar">{c.avatar ? <img src={c.avatar} alt="" /> : (c.nickname || '?')[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{c.nickname || c.uid}</strong>
                      {c.unread > 0 && <span className="anon-badge">{c.unread} 条未读</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_content}</div>
                  </div>
                  <span className="post-time">{c.last_time}</span>
                </div>
              </div>
            ))}
          </>
        )}

        {list.length === 0 ? (
          <div className="empty"><div className="empty-icon">🔔</div><div>暂无通知</div></div>
        ) : list.map((n) => (
          <div key={n.id} className="admin-post" style={{ cursor: (n.type === 'system' || n.type === 'friend_request' || n.post_id || n.type === 'message') ? 'pointer' : 'default' }} onClick={() => openNotification(n)}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{TYPE_ICON[n.type] || '🔔'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14 }}>
                  <strong>{n.type === 'system' ? '系统通知' : (n.from_nickname || n.from_user || '匿名同学')}</strong>
                  {TYPE_TEXT[n.type] && <span> {TYPE_TEXT[n.type]}</span>}
                  {n.content && <span style={{ color: 'var(--text-light)' }}>：{n.content}</span>}
                </div>
                <div className="post-time">{n.created_at}</div>
              </div>
              {n.type === 'friend_request' && n.from_user && (
                <button className="btn btn-primary" style={{ padding: '6px 14px' }} onClick={(e) => { e.stopPropagation(); accept(n.from_user); }}>同意</button>
              )}
              {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
