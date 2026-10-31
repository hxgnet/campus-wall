import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Messages() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  // 进入会话即拉取记录（服务端会把对方发来的消息标记已读）
  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    setLoading(true);
    Promise.all([api.getUser(uid), api.getConversation(uid)])
      .then(([u, list]) => { setPeer(u); setMessages(list); })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, [uid, user, navigate]);

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

  if (!user) return null;

  return (
    <div className="page">
      <div className="container">
        <button className="back-btn" onClick={() => navigate(-1)}>← 返回</button>
        <div className="chat-header">
          <div className="avatar">{peer?.avatar ? <img src={peer.avatar} alt="" /> : (peer?.nickname || '?')[0]}</div>
          <div>
            <div style={{ fontWeight: 600 }}>{peer?.nickname || uid}</div>
            <div className="post-time">与 TA 的私信</div>
          </div>
        </div>
        <div className="chat-box">
          {loading ? <div className="loading">加载中...</div> :
            messages.length === 0 ? <div className="search-hint">还没有消息，说点什么吧～</div> :
            messages.map((m) => (
              <div key={m.id} className={`chat-row ${m.from_uid === user.uid ? 'mine' : ''}`}>
                <div className="chat-bubble">{m.content}</div>
                <div className="chat-time">{m.created_at}</div>
              </div>
            ))
          }
          <div ref={bottomRef} />
        </div>
        <form className="chat-form" onSubmit={send}>
          <input className="form-input" placeholder="输入消息..." value={input} onChange={(e) => setInput(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={!input.trim()}>发送</button>
        </form>
      </div>
    </div>
  );
}
