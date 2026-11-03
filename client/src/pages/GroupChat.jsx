import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import MediaView from '../components/MediaView.jsx';
import StickerPicker from '../components/StickerPicker.jsx';
import RecordButton from '../components/RecordButton.jsx';

export default function GroupChat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showSticker, setShowSticker] = useState(false);
  const [showPacket, setShowPacket] = useState(false);
  const [packetTotal, setPacketTotal] = useState('');
  const [packetCount, setPacketCount] = useState('');
  const [packetNote, setPacketNote] = useState('恭喜发财，大吉大利');
  const [coins, setCoins] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const loadMessages = async () => {
    const list = await api.getGroupMessages(id);
    setMessages(list);
    api.markGroupRead(id).catch(() => {});
  };

  const load = async () => {
    setLoading(true);
    try {
      const info = await api.getGroup(id);
      setGroup(info.group);
      setMembers(info.members || []);
      await loadMessages();
      const c = await api.getCoins();
      setCoins(c.coins);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    load();
    // eslint-disable-next-line
  }, [id, user, authLoading]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => { api.getGroupMessages(id).then(setMessages).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [id, user]);

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
    e?.preventDefault();
    if (!input.trim() && pending.length === 0) return;
    try {
      await api.sendGroupMessage(id, input.trim(), pending);
      setInput('');
      setPending([]);
      setShowSticker(false);
      await loadMessages();
    } catch (err) { alert(err.message); }
  };

  const claim = async (packetId) => {
    try {
      const r = await api.claimRedPacket(packetId);
      setCoins(r.coins);
      alert(r.already ? `你已领取过该红包（${r.amount} 鹏币）` : `抢到 ${r.amount} 鹏币！`);
      await loadMessages();
    } catch (e) { alert(e.message); }
  };

  const sendPacket = async (e) => {
    e.preventDefault();
    setError('');
    const total = Number(packetTotal);
    const count = Number(packetCount);
    if (!Number.isInteger(total) || total <= 0) { setError('请输入正确的红包总鹏币'); return; }
    if (!Number.isInteger(count) || count <= 0) { setError('请输入正确的红包个数'); return; }
    try {
      await api.createRedPacket(id, total, count, packetNote);
      setShowPacket(false);
      setPacketTotal('');
      setPacketCount('');
      const c = await api.getCoins();
      setCoins(c.coins);
      await loadMessages();
    } catch (err) { setError(err.message); }
  };

  const leave = async () => {
    if (!confirm('确定退出该群聊吗？')) return;
    try {
      await api.leaveGroup(id);
      navigate('/messages');
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="page"><div className="container"><div className="loading">加载中...</div></div></div>;

  return (
    <div className="page">
      <div className="container">
        <div className="chat-top-links">
          <button className="back-btn" onClick={() => navigate('/messages')}>← 私信中心</button>
          {coins != null && <span className="coin-badge">🪙 {coins} 鹏币</span>}
        </div>
        <div className="chat-header">
          <div className="avatar">{group?.is_all ? '🏫' : '👥'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{group?.name}</div>
            <div className="post-time">{members.length} 位成员 · 群聊</div>
          </div>
          {group?.is_all ? <span className="anon-badge">全体成员</span> : (
            <button className="reply-link" style={{ color: 'var(--danger)' }} onClick={leave}>退出群聊</button>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}
        {!messages.some((m) => m.share_type) && members.length > 0 && (
          <div className="group-members-hint">成员：{members.slice(0, 8).map((m) => m.nickname || m.uid).join('、')}{members.length > 8 ? ' 等' : ''}</div>
        )}

        <div className="chat-box">
          {messages.length === 0 ? <div className="search-hint">还没有消息，快来聊第一句吧～</div> : messages.map((m) => {
            const mine = m.from_uid === user.uid;
            return (
              <div key={m.id} className={`chat-row group-row ${mine ? 'mine' : ''}`}>
                {!mine && (
                  <span className="post-avatar chat-avatar">
                    {m.avatar ? <img src={m.avatar} alt="" /> : (m.nickname || '?')[0]}
                  </span>
                )}
                <div className="chat-bubble-wrap">
                  {!mine && <div className="chat-sender">{m.custom_tag && <span className="user-custom-tag" style={{ color: m.tag_color || 'var(--primary)' }}>{m.custom_tag}</span>} {m.nickname || m.from_uid}</div>}
                  <div className="chat-bubble">
                    {m.content && m.share_type !== 'redpacket' && <div>{m.content}</div>}
                    {m.media && m.media.length > 0 && <MediaView media={m.media} small />}
                    {m.share?.type === 'post' && (
                      <button type="button" className="share-card" onClick={() => navigate(`/post/${m.share.id}`)}>
                        <span className="share-card-icon">📎</span>
                        <span>{m.share.post?.content?.slice(0, 40) || '分享的帖子'}</span>
                        <span className="share-card-go">查看 →</span>
                      </button>
                    )}
                    {m.share?.type === 'profile' && (
                      <button type="button" className="share-card" onClick={() => navigate(`/profile/${m.share.id}`)}>
                        <span className="share-card-icon">👤</span>
                        <span>{m.share.user?.nickname || '分享的个人主页'}</span>
                        <span className="share-card-go">查看 →</span>
                      </button>
                    )}
                    {m.share?.type === 'redpacket' && m.share.packet && (
                      <div className="redpacket-card">
                        <div className="redpacket-icon">🧧</div>
                        <div className="redpacket-note">{m.share.packet.note}</div>
                        <div className="redpacket-meta">
                          {m.share.packet.remaining_count > 0
                            ? `剩余 ${m.share.packet.remaining} 鹏币 / ${m.share.packet.count} 个`
                            : `已抢完（${m.share.packet.count} 个红包）`}
                        </div>
                        {m.share.packet.my_amount != null ? (
                          <div className="redpacket-claimed">已领取 {m.share.packet.my_amount} 鹏币</div>
                        ) : m.share.packet.remaining_count > 0 ? (
                          <button className="btn btn-primary redpacket-btn" onClick={() => claim(m.share.packet.id)}>开红包</button>
                        ) : (
                          <div className="redpacket-claimed">红包已抢光</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="chat-time">{m.created_at}</div>
                </div>
              </div>
            );
          })}
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
          <input className="form-input" placeholder={`发消息到「${group?.name}」...`} value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="button" className="media-btn" onClick={() => setShowPacket(true)} title="发红包">🧧</button>
          <button type="button" className="media-btn" onClick={() => setShowSticker(!showSticker)} title="表情包">🧩</button>
          <label className="media-btn" title="图片 / 视频 / 语音">
            🖼️
            <input type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <RecordButton onRecorded={(f) => uploadFiles([f])} disabled={uploading} />
          <button className="btn btn-primary" type="submit" disabled={uploading || (!input.trim() && pending.length === 0)}>
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

      {showPacket && (
        <div className="modal-overlay" onClick={() => setShowPacket(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">🧧 发群红包</div>
            <div className="modal-sub">从我的鹏币中扣除，群成员可抢</div>
            {error && <div className="form-error">{error}</div>}
            <form onSubmit={sendPacket}>
              <div className="form-group">
                <label className="form-label">总鹏币（当前余额 {coins ?? 0}）</label>
                <input className="form-input" type="number" min="1" value={packetTotal} onChange={(e) => setPacketTotal(e.target.value)} placeholder="例如 100" />
              </div>
              <div className="form-group">
                <label className="form-label">红包个数</label>
                <input className="form-input" type="number" min="1" value={packetCount} onChange={(e) => setPacketCount(e.target.value)} placeholder="例如 5" />
              </div>
              <div className="form-group">
                <label className="form-label">祝福语</label>
                <input className="form-input" value={packetNote} onChange={(e) => setPacketNote(e.target.value)} maxLength={60} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPacket(false)}>取消</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>塞进红包</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
