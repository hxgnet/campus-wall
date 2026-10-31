import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, EMOJIS } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [nickname, setNickname] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [modalImg, setModalImg] = useState(null);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPost(id);
      setPost(data.post);
      setComments(data.comments);
      setLiked(data.liked);
      setFavorited(data.favorited);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleLike = async () => {
    try {
      const r = await api.likePost(id);
      setLiked(r.liked);
      setPost((p) => ({ ...p, likes: r.likes }));
    } catch (e) { console.error(e); }
  };

  const handleFavorite = async () => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    try {
      const r = await api.favoritePost(id);
      setFavorited(r.favorited);
    } catch (e) { alert(e.message); }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitLoading(true);
    try {
      await api.addComment(id, comment, nickname);
      setComment('');
      load();
    } catch (e) { alert(e.message); }
    finally { setSubmitLoading(false); }
  };

  const submitReply = async (parentId) => {
    if (!replyText.trim()) return;
    try {
      await api.addComment(id, replyText, user?.nickname || nickname, parentId);
      setReplyTo(null);
      setReplyText('');
      load();
    } catch (e) { alert(e.message); }
  };

  const likeComment = async (cid) => {
    try {
      const r = await api.likeComment(cid);
      setComments((prev) => prev.map((c) => c.id === cid ? { ...c, likes: r.likes } : c));
    } catch (e) { console.error(e); }
  };

  const submitReport = async () => {
    if (!reportReason.trim()) { alert('请填写原因'); return; }
    try {
      await api.report(id, null, reportReason);
      alert('举报已提交');
      setShowReport(false);
      setReportReason('');
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div className="page"><div className="container"><div className="loading">加载中...</div></div></div>;
  if (!post) return <div className="page"><div className="container"><div className="empty">帖子不存在</div></div></div>;

  // Build nested comment tree
  const topLevel = comments.filter((c) => !c.parent_id || c.parent_id === 0);
  const repliesOf = (cid) => comments.filter((c) => c.parent_id === cid);

  return (
    <div className="page">
      <div className="container">
        <button className="back-btn" onClick={() => navigate(-1)}>← 返回</button>
        <div className="detail-card">
          <div className="post-meta">
            <span className={`post-cat cat-${post.category}`}>{post.category}</span>
            <span className="post-time">{post.created_at}</span>
          </div>
          <div className="post-content" style={{ fontSize: 16 }}>{post.content}</div>
          {post.tags && post.tags.length > 0 && (
            <div>{post.tags.map((t, i) => <span key={i} className="tag-chip">#{t}</span>)}</div>
          )}
          {post.images && post.images.length > 0 && (
            <div className="post-images" style={{ marginTop: 14 }}>
              {post.images.map((img, i) => (<img key={i} src={img} alt="" onClick={() => setModalImg(img)} />))}
            </div>
          )}
          <div className="post-footer">
            <button className={`post-action ${liked ? 'liked' : ''}`} onClick={handleLike}><span>{liked ? '❤️' : '🤍'}</span><span>{post.likes}</span></button>
            <button className={`post-action ${favorited ? 'liked' : ''}`} onClick={handleFavorite}><span>{favorited ? '⭐' : '☆'}</span><span>{favorited ? '已收藏' : '收藏'}</span></button>
            <span className="post-action"><span>👁️</span><span>{post.views}</span></span>
            <button className="post-action" onClick={() => setShowReport(true)}><span>🚩</span><span>举报</span></button>
            <span className="post-nick" style={{ marginLeft: 'auto' }}>@{post.nickname}</span>
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
                  <span className="comment-nick">@{c.nickname}</span>
                  <span className="post-time">{c.created_at}</span>
                </div>
                <div className="comment-content">{c.content}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button className="reply-link" onClick={() => likeComment(c.id)}>👍 {c.likes}</button>
                  <button className="reply-link" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>回复</button>
                </div>
                {replyTo === c.id && (
                  <div className="reply-form">
                    <input placeholder={`回复 @${c.nickname}...`} value={replyText} onChange={(e) => setReplyText(e.target.value)} autoFocus />
                    <button className="btn btn-primary" style={{ padding: '6px 14px' }} onClick={() => submitReply(c.id)}>发送</button>
                  </div>
                )}
                {repliesOf(c.id).length > 0 && (
                  <div className="comment-replies">
                    {repliesOf(c.id).map((r) => (
                      <div className="comment-item" key={r.id}>
                        <div className="comment-head">
                          <span className="comment-nick">@{r.nickname}</span>
                          <span className="post-time">{r.created_at}</span>
                        </div>
                        <div className="comment-content">{r.content}</div>
                        <button className="reply-link" onClick={() => likeComment(r.id)}>👍 {r.likes}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <form className="comment-form" onSubmit={submitComment}>
            <input type="text" placeholder="你的昵称（可选）" value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ maxWidth: 140 }} />
            <input type="text" placeholder="写下你的评论..." value={comment} onChange={(e) => setComment(e.target.value)} />
            <button type="button" className="btn btn-secondary" style={{ padding: '0 12px' }} onClick={() => setShowEmoji(!showEmoji)}>😊</button>
            <button className="btn btn-primary" type="submit" disabled={submitLoading || !comment.trim()}>{submitLoading ? '...' : '发送'}</button>
          </form>
          {showEmoji && (
            <div className="emoji-picker">
              {EMOJIS.map((e, i) => (
                <button key={i} type="button" onClick={() => { setComment((c) => c + e); setShowEmoji(false); }}>{e}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalImg && <div className="image-modal" onClick={() => setModalImg(null)}><img src={modalImg} alt="" /></div>}

      {showReport && (
        <div className="modal-overlay" onClick={() => setShowReport(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>🚩 举报帖子</h3>
            <div className="form-group">
              <textarea className="form-textarea" placeholder="请说明举报原因..." value={reportReason} onChange={(e) => setReportReason(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReport(false)}>取消</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={submitReport}>提交举报</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
