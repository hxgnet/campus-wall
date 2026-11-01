import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Messages() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState('');
  const bottomRef = useRef(null);

  // 进入会话即拉取记录（服务端会把对方发来的消息标记已读）
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    setLoading(true);
    Promise.all([api.getUser(uid), api.getConversation(uid)])
      .then(([u, list]) => { setPeer(u); setMessages(list); setBlocked(!!u.blocked_by_me); })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [uid, user, navigate]);

  // 轮询刷新：对方看过后我的消息会变成「已读」
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => {
      api.getConversation(uid).then(setMessages).catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, [uid, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      await api.sendMessage(uid, input.trim());
      setInput('');
      setMessages(await api.getConversation(uid));
    } catch (err) { alert(err.message); }
  };

  const toggleBlock = async () => {
    try {
      const r = await api.blockUser(uid);
      setBlocked(r.blocked);
      alert(r.blocked ? '已拉黑该用户，双方将无法发送私信' : '已取消拉黑');
    } catch (e) { alert(e.message); }
  };

  const submitReport = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    try {
      await api.reportUser(uid, reason.trim());
      setShowReport(false);
      setReason('');
      alert('举报已提交，管理员会尽快处理');
    } catch (err) { alert(err.message); }
  };

  if (!user) return null;

  return (
    <div className="page">
      <div className="container">
        <button className="back-btn" onClick={() => navigate(-1)}>← 返回</button>
        <div className="chat-header">
          <div className="avatar">{peer?.avatar ? <img src={peer.avatar} alt="" /> : (peer?.nickname || '?')[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{peer?.nickname || uid}</div>
            <div className="post-time">与 TA 的私信</div>
          </div>
          <button className="reply-link" onClick={() => setShowReport(true)}>🚩 举报</button>
          <button className="reply-link" onClick={toggleBlock} style={{ color: 'var(--danger)' }}>
            {blocked ? '取消拉黑' : '拉黑'}
          </button>
        </div>
        <div className="chat-box">
          {loading ? <div className="loading">加载中...</div> :
            messages.length === 0 ? <div className="search-hint">还没有消息，说点什么吧～</div> :
            messages.map((m) => (
              <div key={m.id} className={`chat-row ${m.from_uid === user.uid ? 'mine' : ''}`}>
                <div className="chat-bubble">{m.content}</div>
                <div className="chat-time">
                  {m.created_at}
                  {m.from_uid === user.uid && <span style={{ marginLeft: 6, color: m.read ? 'var(--primary)' : 'var(--text-light)' }}>{m.read ? '已读' : '未读'}</span>}
                </div>
              </div>
            ))
          }
          <div ref={bottomRef} />
        </div>
        <form className="chat-form" onSubmit={send}>
          <input
            className="form-input"
            placeholder={blocked ? '你已拉黑对方，无法发送私信' : '输入消息...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={blocked}
          />
          <button className="btn btn-primary" type="submit" disabled={!input.trim() || blocked}>发送</button>
        </form>
      </div>

      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>🚩 举报用户</h3>
            <p className="anon-hint">举报对象：{peer?.nickname || uid}</p>
            <form onSubmit={submitReport}>
              <textarea
                className="form-input"
                rows={4}
                placeholder="请描述举报原因（如骚扰、诈骗、违规内容等）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowReport(false)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={!reason.trim()}>提交举报</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
