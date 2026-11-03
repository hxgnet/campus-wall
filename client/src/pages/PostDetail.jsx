import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, EMOJIS } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import MediaView from '../components/MediaView.jsx';
import StickerPicker from '../components/StickerPicker.jsx';
import ForwardModal from '../components/ForwardModal.jsx';

function Composer({ placeholder, onSubmit, autoFocus = false, compact = false }) {
  const [text, setText] = useState('');
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showSticker, setShowSticker] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  const uploadFiles = async (files) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const up = await api.uploadMedia(Array.from(files).slice(0, 9 - media.length));
      setMedia((prev) => [...prev, ...(up.files || [])].slice(0, 9));
    } catch (e) { alert(e.message); }
    finally { setBusy(false); }
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim() && media.length === 0) return;
    setBusy(true);
    try {
      await onSubmit(text.trim(), media);
      setText('');
      setMedia([]);
      setShowSticker(false);
    } catch (err) { alert(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className={`composer ${compact ? 'composer-compact' : ''}`}>
      {media.length > 0 && (
        <div className="composer-media">
          {media.map((m, i) => (
            <div key={i} className="composer-media-item">
              {m.type === 'image' && <img src={m.url} alt="" />}
              {m.type === 'video' && <video src={m.url} muted />}
              {m.type === 'audio' && <span>🎙️ 语音</span>}
              <button type="button" onClick={() => setMedia(media.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
      <form className="comment-form" onSubmit={send}>
        <input
          type="text"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className="media-btn" onClick={() => setShowEmoji(!showEmoji)} title="表情">😊</button>
        <button type="button" className="media-btn" onClick={() => setShowSticker(!showSticker)} title="表情包">🧩</button>
        <label className="media-btn" title="图片/视频">
          🖼️
          <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || (!text.trim() && media.length === 0)}>
          {busy ? '...' : '发送'}
        </button>
      </form>
      {showEmoji && (
        <div className="emoji-picker">
          {EMOJIS.map((e, i) => (
            <button key={i} type="button" onClick={() => { setText((c) => c + e); setShowEmoji(false); }}>{e}</button>
          ))}
        </div>
      )}
      {showSticker && (
        <StickerPicker
          onClose={() => setShowSticker(false)}
          onPick={(url) => { setMedia((prev) => [...prev, { type: 'image', url }].slice(0, 9)); setShowSticker(false); }}
        />
      )}
    </div>
  );
}

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalImg, setModalImg] = useState(null);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportCommentId, setReportCommentId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [forwarding, setForwarding] = useState(false);
  const isSuper = localStorage.getItem('admin_token') && sessionStorage.getItem('admin_role') === 'super';
  const isAdminLogged = !!localStorage.getItem('admin_token') && ['admin', 'super'].includes(sessionStorage.getItem('admin_role'));

  const canDeleteComment = (c) => {
    if (isAdminLogged) return true;
    if (!user) return false;
    if (c.user_id && c.user_id === user.uid) return true;
    if (post && post.user_id && post.user_id === user.uid) return true;
    return false;
  };

  const deleteComment = async (cid) => {
    if (!confirm('确定删除这条评论吗？')) return;
    try {
      if (isAdminLogged) await api.adminDeleteComment(cid);
      else await api.deleteComment(cid);
      setComments((prev) => prev.filter((c) => c.id !== cid && c.parent_id !== cid));
    } catch (e) { alert(e.message); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPost(id);
      setPost(data.post);
      setComments(data.comments);
      setLiked(data.liked);
      setFavorited(data.favorited);
      setSignedUp(!!data.signedUp);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleLike = async () => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    try {
      const r = await api.likePost(id);
      setLiked(r.liked);
      setPost((p) => ({ ...p, likes: r.likes }));
    } catch (e) { alert(e.message); }
  };

  const handleFavorite = async () => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    try {
      const r = await api.favoritePost(id);
      setFavorited(r.favorited);
    } catch (e) { alert(e.message); }
  };

  const toggleSignup = async () => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    try {
      const r = signedUp ? await api.cancelSignupActivity(id) : await api.signupActivity(id);
      setSignedUp(r.signedUp);
      setPost((p) => ({ ...p, signup_count: r.count }));
    } catch (e) { alert(e.message); }
  };

  const submitComment = async (text, media) => {
    await api.addComment(id, text, null, media);
    load();
  };

  const submitReply = async (parentId, text, media) => {
    await api.addComment(id, text, parentId, media);
    setReplyTo(null);
    load();
  };

  const likeComment = async (cid) => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    try {
      const r = await api.likeComment(cid);
      setComments((prev) => prev.map((c) => c.id === cid ? { ...c, likes: r.likes } : c));
    } catch (e) { alert(e.message); }
  };

  const submitReport = async () => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    if (!reportReason.trim()) { alert('请填写原因'); return; }
    try {
      await api.report(id, reportCommentId, reportReason);
      alert('举报已提交，处理结果与理由会在通知中告知你');
      setShowReport(false);
      setReportReason('');
      setReportCommentId(null);
    } catch (e) { alert(e.message); }
  };

  const superDelete = async () => {
    const reason = prompt('请填写删除理由（将通知作者并记入操作记录）：', '违反社区规范');
    if (reason === null) return;
    try {
      await api.adminDeletePost(id, reason);
      navigate('/');
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="page"><div className="container"><div className="loading">加载中...</div></div></div>;
  if (!post) return <div className="page"><div className="container"><div className="empty">帖子不存在</div></div></div>;

  const topLevel = comments.filter((c) => !c.parent_id || c.parent_id === 0);
  const repliesOf = (cid) => comments.filter((c) => c.parent_id === cid);

  return (
    <div className="page">
      <div className="container">
        <button className="back-btn" onClick={() => navigate(-1)}>← 返回</button>
        <div className="detail-card">
          <div className="post-meta">
            <span className={`post-cat cat-${post.category}`}>{post.category}</span>
            {post.is_staff && (
              <span className="anon-badge" style={{ color: post.staff_role === 'super' ? 'var(--danger)' : 'var(--primary-dark)' }}>
                {post.staff_role === 'super' ? '超级管理员发布' : '管理员发布'}
              </span>
            )}
            {post.is_anonymous && <span className="anon-badge">匿名</span>}
            {post.activity_signup_required && <span className="anon-badge">活动 · 需报名</span>}
            <span className="post-time">{post.created_at}</span>
          </div>
          <div className="post-content" style={{ fontSize: 16 }}>{post.content}</div>

          {post.quote_post_id && (
            <div className="quote-card" onClick={() => navigate(`/post/${post.quote_post_id}`)}>
              <div className="quote-head">📎 引用 @{post.quote_nickname || '同学'} · {post.quote_category || '帖子'}</div>
              <div className="quote-body">{post.quote_content?.slice(0, 160) || '（原帖内容已删除）'}</div>
            </div>
          )}

          {post.tags && post.tags.length > 0 && (
            <div>{post.tags.map((t, i) => <span key={i} className="tag-chip">#{t}</span>)}</div>
          )}

          <MediaView media={post.media} images={post.images} />

          {post.activity_signup_required && (
            <div className="activity-signup-box">
              <div>
                <div className="activity-signup-title">🎫 活动报名</div>
                <div className="activity-signup-meta">
                  {post.signup_count || 0} 人已报名
                  {post.activity_signup_deadline ? ` · 截止 ${post.activity_signup_deadline}` : ''}
                </div>
              </div>
              <button className={`btn ${signedUp ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleSignup}>
                {signedUp ? '取消报名' : '立即报名'}
              </button>
            </div>
          )}

          <div className="post-footer">
            <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike}><span>{liked ? '❤️' : '🤍'}</span><span>{post.likes}</span></button>
            <button className={`post-action ${favorited ? 'liked' : ''}`} onClick={handleFavorite}><span>{favorited ? '⭐' : '☆'}</span><span>{favorited ? '已收藏' : '收藏'}</span></button>
            <span className="post-action"><span>👁️</span><span>{post.views}</span></span>
            <button className="post-action" onClick={() => setForwarding(true)}><span>📤</span><span>转发</span></button>
            <button className="post-action" onClick={() => navigate(`/create?quote=${post.id}`)}><span>✏️</span><span>引用发帖</span></button>
            <button className="post-action" onClick={() => { setReportCommentId(null); setShowReport(true); }}><span>🚩</span><span>举报</span></button>
            {isSuper && <button className="post-action" onClick={superDelete} style={{ color: 'var(--danger)' }}><span>🗑️</span><span>超管删除</span></button>}
            {!post.is_anonymous && post.user_id ? (
              <span className="post-author" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${post.user_id}`)}>
                <span className="post-avatar">
                  {post.avatar ? <img src={post.avatar} alt="" /> : (post.nickname || '?')[0]}
                </span>
                {post.custom_tag && <span className="user-custom-tag" style={{ color: post.tag_color || 'var(--primary)' }}>{post.custom_tag}</span>}
                <span className="post-nick">@{post.nickname}</span>
              </span>
            ) : (
              <span className="post-nick" style={{ marginLeft: 'auto' }}>🎭 匿名同学</span>
            )}
          </div>
        </div>

        <div className="comments-section">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>评论 ({comments.length})</h3>
          {topLevel.length === 0 ? (
            <div style={{ color: 'var(--text-light)', fontSize: 14, padding: '10px 0' }}>还没有评论，来抢沙发吧～</div>
          ) : topLevel.map((c) => (
            <div key={c.id}>
              <div className="comment-item">
                <div className="comment-head">
                  {c.user_id ? (
                    <span className="post-author" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                      onClick={() => navigate(`/profile/${c.user_id}`)}>
                      <span className="post-avatar" style={{ width: 22, height: 22, fontSize: 11 }}>
                        {c.avatar ? <img src={c.avatar} alt="" /> : (c.nickname || '?')[0]}
                      </span>
                      <span className="comment-nick">@{c.nickname}</span>
                    </span>
                  ) : (
                    <span className="comment-nick">@{c.nickname}</span>
                  )}
                  <span className="post-time">{c.created_at}</span>
                </div>
                {c.content && <div className="comment-content">{c.content}</div>}
                <MediaView media={c.media} small />
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button className="reply-link" onClick={() => likeComment(c.id)}>👍 {c.likes}</button>
                  <button className="reply-link" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>回复</button>
                  {canDeleteComment(c) && (
                    <button className="reply-link" style={{ color: 'var(--danger)' }} onClick={() => deleteComment(c.id)}>删除</button>
                  )}
                  <button className="reply-link" onClick={() => { setReportCommentId(c.id); setShowReport(true); }}>举报</button>
                </div>
                {replyTo === c.id && user && (
                  <div className="reply-form reply-composer">
                    <Composer compact placeholder={`回复 @${c.nickname}...`} autoFocus
                      onSubmit={(text, media) => submitReply(c.id, text, media)} />
                  </div>
                )}
                {repliesOf(c.id).length > 0 && (
                  <div className="comment-replies">
                    {repliesOf(c.id).map((r) => (
                      <div className="comment-item" key={r.id}>
                        <div className="comment-head">
                          {r.user_id ? (
                            <span className="post-author" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                              onClick={() => navigate(`/profile/${r.user_id}`)}>
                              <span className="post-avatar" style={{ width: 22, height: 22, fontSize: 11 }}>
                                {r.avatar ? <img src={r.avatar} alt="" /> : (r.nickname || '?')[0]}
                              </span>
                              <span className="comment-nick">@{r.nickname}</span>
                            </span>
                          ) : (
                            <span className="comment-nick">@{r.nickname}</span>
                          )}
                          <span className="post-time">{r.created_at}</span>
                        </div>
                        {r.content && <div className="comment-content">{r.content}</div>}
                        <MediaView media={r.media} small />
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          <button className="reply-link" onClick={() => likeComment(r.id)}>👍 {r.likes}</button>
                          {canDeleteComment(r) && (
                            <button className="reply-link" style={{ color: 'var(--danger)' }} onClick={() => deleteComment(r.id)}>删除</button>
                          )}
                          <button className="reply-link" onClick={() => { setReportCommentId(r.id); setShowReport(true); }}>举报</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <p className="anon-hint" style={{ marginTop: 12 }}>
            {user ? `以「${user.nickname}」的身份评论` : '🔒 登录后即可评论、点赞、收藏'}
          </p>
          {user ? (
            <Composer placeholder="写下你的评论，可发送图片 / 视频 / 语音 / 表情包..." onSubmit={submitComment} />
          ) : (
            <button className="btn btn-secondary btn-block" onClick={() => navigate('/login')}>登录后评论</button>
          )}
        </div>
      </div>

      {modalImg && <div className="image-modal" onClick={() => setModalImg(null)}><img src={modalImg} alt="" /></div>}

      {forwarding && <ForwardModal share={{ type: 'post', id: post.id }} onClose={() => setForwarding(false)} />}

      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>{reportCommentId ? '🚩 举报评论' : '🚩 举报帖子'}</h3>
            <div className="form-group">
              <textarea className="form-textarea" placeholder="请说明举报原因..." value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowReport(false); setReportCommentId(null); }}>取消</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={submitReport}>提交举报</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
