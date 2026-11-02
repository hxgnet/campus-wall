import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function MessagesHub() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [groups, setGroups] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.getGroups().then(setGroups).catch(() => {});
    api.getConversations().then(setConversations).catch(() => {});
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    load();
    // eslint-disable-next-line
  }, [user, authLoading]);

  const createGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) { setError('请输入群名称'); return; }
    setBusy(true);
    setError('');
    try {
      const uids = members.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean);
      const r = await api.createGroup(groupName.trim(), uids);
      setShowCreate(false);
      setGroupName('');
      setMembers('');
      load();
      navigate(`/groups/${r.id}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="page">
      <div className="container">
        <button className="back-btn" onClick={() => navigate(-1)}>← 返回</button>
        <div className="hub-head">
          <h1 className="page-title" style={{ margin: 0 }}>💬 私信中心</h1>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ 创建群聊</button>
        </div>

        <div className="hub-section">
          <div className="hub-section-title">群聊（{groups.length}）</div>
          <div className="hub-list">
            {groups.map((g) => (
              <button key={g.id} className="hub-item" onClick={() => navigate(`/groups/${g.id}`)}>
                <span className="hub-avatar">{g.is_all ? '🏫' : '👥'}</span>
                <span className="hub-body">
                  <span className="hub-name">
                    {g.name}
                    {!!g.unread && <span className="unread-dot">{g.unread > 99 ? '99+' : g.unread}</span>}
                  </span>
                  <span className="hub-meta">
                    {g.last_content || (g.last_share_type ? '[分享内容]' : g.last_media ? '[图片/视频/语音]' : '还没有消息')}
                    {g.member_count ? ` · ${g.member_count} 人` : ''}
                  </span>
                </span>
                <span className="hub-time">{g.last_time || ''}</span>
              </button>
            ))}
            {groups.length === 0 && <div className="muted">暂无群聊</div>}
          </div>
        </div>

        <div className="hub-section">
          <div className="hub-section-title">私信（{conversations.length}）</div>
          <div className="hub-list">
            {conversations.map((c) => (
              <button key={c.uid} className="hub-item" onClick={() => navigate(`/messages/${c.uid}`)}>
                <span className="hub-avatar">
                  {c.avatar ? <img src={c.avatar} alt="" /> : (c.nickname || c.uid || '?')[0]}
                </span>
                <span className="hub-body">
                  <span className="hub-name">
                    {c.nickname || c.uid}
                    {!!c.unread && <span className="unread-dot">{c.unread > 99 ? '99+' : c.unread}</span>}
                  </span>
                  <span className="hub-meta">{c.last_content || '暂无消息'}</span>
                </span>
                <span className="hub-time">{c.last_time || ''}</span>
              </button>
            ))}
            {conversations.length === 0 && <div className="muted">暂无私信，去同学主页发起聊天吧</div>}
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">创建群聊</div>
            <div className="modal-sub">群主默认是你，创建后可在群里发消息、发红包</div>
            {error && <div className="form-error">{error}</div>}
            <form onSubmit={createGroup}>
              <div className="form-group">
                <label className="form-label">群名称</label>
                <input className="form-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={30} placeholder="例如：高三（1）班交流群" />
              </div>
              <div className="form-group">
                <label className="form-label">邀请成员（可选，填写用户 ID，用空格或逗号分隔）</label>
                <input className="form-input" value={members} onChange={(e) => setMembers(e.target.value)} placeholder="用户 ID" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowCreate(false)}>取消</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>{busy ? '创建中...' : '创建'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
