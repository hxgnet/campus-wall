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
  const [submitLoading, setSubmitLoading] = useState(false);
  const [modalImg, setModalImg] = useState(null);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportCommentId, setReportCommentId] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const isSuper = localStorage.getItem('admin_token') && sessionStorage.getItem('admin_role') === 'super';
  const isAdminLogged = !!localStorage.getItem('admin_token') && ['admin', 'super'].includes(sessionStorage.getItem('admin_role'));

  // 评论者本人 / 帖主 / 管理员可删除评论
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

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    if (!comment.trim()) return;
    setSubmitLoading(true);
    try {
      await api.addComment(id, comment);
      setComment('');
      load();
    } catch (e) { alert(e.message); }
    finally { setSubmitLoading(false); }
  };

  const submitReply = async (parentId) => {
    if (!user) { alert('请先登录'); navigate('/login'); return; }
    if (!replyText.trim()) return;
    try {
      await api.addComment(id, replyText, parentId);
      setReplyTo(null);
      setReplyText('');
      load();
    } catch (e) { alert(e.message); }
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
      alert('举报已提交');
      setShowReport(false);
      setReportReason('');
      setReportCommentId(null);
    } catch (e) { alert(e.message); }
  };

  const superDelete = async () => {
    if (!confirm('确定以超级管理员身份删除该帖子？作者将被扣除 10 点信誉分，此操作不可恢复。')) return;
    try {
      await api.adminDeletePost(id);
      navigate('/');
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
            {post.is_staff && (
              <span className="anon-badge" style={{ color: post.staff_role === 'super' ? 'var(--danger)' : 'var(--primary-dark)' }}>
                {post.staff_role === 'super' ? '超级管理员发布' : '管理员发布'}
              </span>
            )}
            {post.is_anonymous && <span className="anon-badge">匿名</span>}
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
            <button className="post-action" onClick={() => { setReportCommentId(null); setShowReport(true); }}><span>🚩</span><span>举报</span></button>
            {isSuper && <button className="post-action" onClick={superDelete} style={{ color: 'var(--danger)' }}><span>🗑️</span><span>超管删除</span></button>}
            {!post.is_anonymous && post.user_id ? (
              <span className="post-author" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${post.user_id}`)}>
                <span className="post-avatar">
                  {post.avatar ? <img src={post.avatar} alt="" /> : (post.nickname || '?')[0]}
                </span>
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
                <div className="comment-content">{c.content}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                  <button className="reply-link" onClick={() => likeComment(c.id)}>👍 {c.likes}</button>
                  <button className="reply-link" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>回复</button>
                  {canDeleteComment(c) && (
                    <button className="reply-link" style={{ color: 'var(--danger)' }} onClick={() => deleteComment(c.id)}>删除</button>
                  )}
                  <button className="reply-link" onClick={() => { setReportCommentId(c.id); setShowReport(true); }}>举报</button>
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
                        <div className="comment-content">{r.content}</div>
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
          <form className="comment-form" onSubmit={submitComment}>
            <input type="text" placeholder={user ? '写下你的评论...' : '请先登录后再评论'} value={comment} onChange={(e) => setComment(e.target.value)} />
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
