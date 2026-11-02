import { useEffect, useState } from 'react';
import { api } from '../api.js';

// 将帖子 / 主页转发到私信或群聊
export default function ForwardModal({ share, onClose, onDone }) {
  const [groups, setGroups] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getGroups().then(setGroups).catch(() => {});
    api.getConversations().then(setConversations).catch(() => {});
  }, []);

  const sendToGroup = async (group) => {
    setBusy(true);
    setError('');
    try {
      await api.sendGroupMessage(group.id, '', [], share);
      alert(`已转发到群聊「${group.name}」`);
      onDone?.();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const sendToUser = async (targetUid, nickname) => {
    const to = String(targetUid || '').trim();
    if (!to) { setError('请输入对方用户 ID'); return; }
    setBusy(true);
    setError('');
    try {
      await api.sendMessage(to, '', [], share);
      alert(`已转发给${nickname ? ` ${nickname}` : '对方'}`);
      onDone?.();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card forward-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">转发{share?.type === 'profile' ? '主页' : '帖子'}</div>
        <div className="modal-sub">选择一个群聊或私信发送</div>
        {error && <div className="form-error">{error}</div>}

        <div className="forward-section-title">群聊</div>
        <div className="forward-list">
          {groups.map((g) => (
            <button key={g.id} type="button" className="forward-item" disabled={busy} onClick={() => sendToGroup(g)}>
              <span className="forward-avatar">{g.is_all ? '🏫' : '👥'}</span>
              <span>{g.name}</span>
              <span className="forward-meta">{g.member_count} 人</span>
            </button>
          ))}
          {groups.length === 0 && <div className="muted">暂无群聊</div>}
        </div>

        <div className="forward-section-title">最近私信</div>
        <div className="forward-list">
          {conversations.map((c) => (
            <button key={c.uid} type="button" className="forward-item" disabled={busy}
              onClick={() => sendToUser(c.uid, c.nickname)}>
              <span className="forward-avatar">{c.avatar ? <img src={c.avatar} alt="" /> : (c.nickname || '?')[0]}</span>
              <span>{c.nickname || c.uid}</span>
            </button>
          ))}
          {conversations.length === 0 && <div className="muted">暂无最近私信</div>}
        </div>

        <div className="forward-section-title">输入用户 ID 转发</div>
        <div className="forward-uid-row">
          <input className="form-input" placeholder="对方用户 ID（个人主页可复制）" value={uid} onChange={(e) => setUid(e.target.value)} />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => sendToUser(uid)}>发送</button>
        </div>

        <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>取消</button>
      </div>
    </div>
  );
}
