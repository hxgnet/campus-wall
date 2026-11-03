import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import MediaView from '../components/MediaView.jsx';
import StickerPicker from '../components/StickerPicker.jsx';

export default function Messages() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]);
  const [showSticker, setShowSticker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    setLoading(true);
    Promise.all([api.getUser(uid), api.getConversation(uid)])
      .then(([u, list]) => { setPeer(u); setMessages(list); setBlocked(!!u.blocked_by_me); })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [uid, user, navigate, authLoading]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => {
      api.getConversation(uid).then(setMessages).catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, [uid, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const up = await api.uploadMedia(Array.from(files));
      setPending((prev) => [...prev, ...(up.files || [])]);
    } catch (e) { alert(e.message); }
    finally { setUploading(false); }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!input.trim() && pending.length === 0) return;
    try {
      await api.sendMessage(uid, input.trim(), pending);
      setInput('');
      setPending([]);
      setShowSticker(false);
      setMessages(await api.getConversation(uid));
    } catch (err) { alert(err.message); }
  };

  const renderShare = (m) => {
    if (!m.share_type) return null;
    if (m.share_type === 'post') {
      return (
        <button type="button" className="share-card" onClick={() => navigate(`/post/${m.share_id}`)}>
          <span className="share-card-icon">📎</span>
          <span>分享的帖子</span>
          <span className="share-card-go">查看 →</span>
        </button>
      );
    }
    if (m.share_type === 'profile') {
      return (
        <button type="button" className="share-card" onClick={() => navigate(`/profile/${m.share_id}`)}>
          <span className="share-card-icon">👤</span>
          <span>分享的个人主页</span>
          <span className="share-card-go">查看 →</span>
        </button>
      );
    }
    return null;
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
      alert('举报已提交，处理结果与理由会在通知中告知你');
    } catch (err) { alert(err.message); }
  };

  if (!user) return null;

  return (
    <div className="page">
      <div className="container">
        <div className="chat-top-links">
          <button className="back-btn" onClick={() => navigate('/notifications')}>← 返回通知</button>
          <button className="btn-text" onClick={() => navigate('/messages')}>💬 私信中心</button>
        </div>
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
                <div className="chat-bubble">
                  {m.content && <div>{m.content}</div>}
                  {m.media && m.media.length > 0 && <MediaView media={m.media} small />}
                  {renderShare(m)}
                </div>
                <div className="chat-time">
                  {m.created_at}
                  {m.from_uid === user.uid && <span style={{ marginLeft: 6, color: m.read ? 'var(--primary)' : 'var(--text-light)' }}>{m.read ? '已读' : '未读'}</span>}
                </div>
              </div>
            ))
          }
          <div ref={bottomRef} />
        </div>

        {pending.length > 0 && (
          <div className="composer-media">
            {pending.map((m, i) => (
              <div key={i} className="composer-media-item">
                {m.type === 'image' && <img src={m.url} alt="" />}
                {m.type === 'video' && <video src={m.url} muted />}
                {m.type === 'audio' && <span>🎙️ 语音</span>}
                <button type="button" onClick={() => setPending(pending.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}

        <form className="chat-form chat-form-rich" onSubmit={send}>
          <input
            className="form-input"
            placeholder={blocked ? '你已拉黑对方，无法发送私信' : '输入消息...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={blocked}
          />
          <button type="button" className="media-btn" onClick={() => setShowSticker(!showSticker)} title="表情包" disabled={blocked}>🧩</button>
          <label className="media-btn" title="图片 / 视频">
            🖼️
            <input type="file" accept="image/*,video/*" multiple hidden disabled={blocked}
              onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={blocked || uploading || (!input.trim() && pending.length === 0)}>
            {uploading ? '上传中...' : '发送'}
          </button>
        </form>

        {showSticker && (
          <StickerPicker
            onClose={() => setShowSticker(false)}
            onPick={(url) => { setPending((prev) => [...prev, { type: 'image', url }]); setShowSticker(false); }}
          />
        )}
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
