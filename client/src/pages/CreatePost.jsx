import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, CATEGORIES, EMOJIS } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

function kindOf(mime) {
  if (/^image\//.test(mime)) return 'image';
  if (/^video\//.test(mime)) return 'video';
  if (/^audio\//.test(mime)) return 'audio';
  return null;
}

export default function CreatePost() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [categories, setCategories] = useState(CATEGORIES);
  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mentionList, setMentionList] = useState([]);
  const [mentionPos, setMentionPos] = useState(null);
  const [quote, setQuote] = useState(null);
  const [signupRequired, setSignupRequired] = useState(false);
  const [signupDeadline, setSignupDeadline] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    api.getCategories().then((list) => {
      if (Array.isArray(list) && list.length) {
        setCategories(list);
        setCategory((cur) => (list.some((c) => c.name === cur) ? cur : list[0].name));
      }
    }).catch(() => {});
  }, []);

  // 从帖子卡片「引用」进入时，加载原帖信息
  useEffect(() => {
    const qid = searchParams.get('quote');
    if (qid) {
      api.getPost(qid).then((d) => {
        const p = d.post || d;
        setQuote({ id: Number(qid), content: p.content, nickname: p.nickname, category: p.category });
      }).catch(() => {});
    }
  }, [searchParams]);

  if (!user) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', marginTop: 80 }}>
          <div className="empty-icon" style={{ fontSize: 48 }}>🔐</div>
          <p style={{ margin: '12px 0' }}>请先登录后再发帖</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>去登录</button>
        </div>
      </div>
    );
  }

  const currentCat = categories.find((c) => c.name === category);
  const isActivity = !!currentCat?.is_activity || category === '活动';

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    const remaining = 9 - media.length;
    files.slice(0, remaining).forEach((file) => {
      const type = kindOf(file.type);
      if (!type) return;
      const reader = new FileReader();
      reader.onload = () => setMedia((prev) => [...prev, { url: reader.result, file, type }]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  const handleContentChange = (e) => {
    const val = e.target.value;
    setContent(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@([a-zA-Z0-9_\u4e00-\u9fa5]{0,20})$/);
    if (match) {
      const q = match[1];
      if (q.length > 0) {
        api.searchUsers(q).then(setMentionList).catch(() => {});
        const ta = textareaRef.current;
        if (ta) {
          const rect = ta.getBoundingClientRect();
          setMentionPos({ top: rect.top - 120, left: rect.left });
        }
      } else {
        setMentionList([]);
      }
    } else {
      setMentionList([]);
    }
  };

  const insertMention = (username) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart;
    const before = content.slice(0, cursor);
    const after = content.slice(cursor);
    const newBefore = before.replace(/@([a-zA-Z0-9_\u4e00-\u9fa5]{0,20})$/, `@${username} `);
    setContent(newBefore + after);
    setMentionList([]);
    setTimeout(() => {
      ta.focus();
      const pos = newBefore.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  useEffect(() => {
    const close = () => setMentionList([]);
    if (mentionList.length > 0) {
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [mentionList]);

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim() && media.length === 0) { alert('请输入内容或添加图片/视频/语音'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('content', content);
      fd.append('anonymous', anonymous ? 'true' : 'false');
      fd.append('tags', JSON.stringify(tags));
      media.forEach((m) => fd.append('media', m.file));
      if (quote) fd.append('quotePostId', String(quote.id));
      if (isActivity) {
        fd.append('activitySignupRequired', signupRequired ? 'true' : 'false');
        if (signupDeadline) fd.append('activitySignupDeadline', signupDeadline);
      }
      const res = await api.createPost(fd);
      alert(res.message || '发布成功，等待审核');
      navigate('/');
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">发布新帖</h1>
        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">选择分类</label>
            <div className="cat-tabs" style={{ paddingTop: 0 }}>
              {categories.map((c) => (
                <button type="button" key={c.name} className={`cat-tab ${category === c.name ? 'active' : ''}`} onClick={() => setCategory(c.name)}>{c.icon} {c.name}</button>
              ))}
            </div>
          </div>

          {quote && (
            <div className="quote-card">
              <div className="quote-head">
                📎 引用 @{quote.nickname || '同学'} · {quote.category || '帖子'}
                <button type="button" className="btn-text" onClick={() => setQuote(null)}>取消引用</button>
              </div>
              <div className="quote-body">{quote.content?.slice(0, 100) || '（无文字内容）'}</div>
            </div>
          )}

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">内容</label>
            <textarea
              ref={textareaRef}
              className="form-textarea"
              placeholder="说点什么吧... 输入 @ 可提及其他用户"
              value={content}
              onChange={handleContentChange}
              maxLength={3000}
            />
            {mentionList.length > 0 && mentionPos && (
              <div className="mention-dropdown" style={{ top: mentionPos.top, left: mentionPos.left }} onClick={(e) => e.stopPropagation()}>
                {mentionList.map((u) => (
                  <div key={u.uid} className="mention-item" onClick={() => insertMention(u.username)}>
                    <span className="post-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
                      {u.avatar ? <img src={u.avatar} alt="" /> : (u.nickname || '?')[0]}
                    </span>
                    <span>@{u.username}</span>
                    <span style={{ color: 'var(--text-light)', fontSize: 12 }}>{u.nickname}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <button type="button" className="reply-link" onClick={() => setShowEmoji(!showEmoji)}>😊 表情</button>
              <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{content.length}/3000</span>
            </div>
            {showEmoji && (
              <div className="emoji-picker">
                {EMOJIS.map((e, i) => (<button key={i} type="button" onClick={() => { setContent((c) => c + e); }}>{e}</button>))}
              </div>
            )}
          </div>

          {isActivity && (
            <div className="form-group activity-form">
              <label className="form-label">🎉 活动设置</label>
              <label className="anon-toggle">
                <input type="checkbox" checked={signupRequired} onChange={(e) => setSignupRequired(e.target.checked)} />
                <span>该活动需要报名（用户可在活动帖下点击报名）</span>
              </label>
              {signupRequired && (
                <div style={{ marginTop: 8 }}>
                  <label className="form-label">报名截止时间（可选）</label>
                  <input type="datetime-local" className="form-input" value={signupDeadline} onChange={(e) => setSignupDeadline(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">标签（最多5个，可选）</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" placeholder="输入标签后回车" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
              <button type="button" className="btn btn-secondary" onClick={addTag}>添加</button>
            </div>
            {tags.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {tags.map((t, i) => (
                  <span key={i} className="tag-chip" style={{ cursor: 'pointer' }} onClick={() => setTags(tags.filter((_, j) => j !== i))}>#{t} ×</span>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">图片 / 视频 / 语音（最多9个，可选）</label>
            <div className="image-preview">
              {media.map((m, i) => (
                <div className="image-preview-item" key={i}>
                  {m.type === 'image' && <img src={m.url} alt="" />}
                  {m.type === 'video' && <video src={m.url} muted />}
                  {m.type === 'audio' && <div className="preview-audio">🎙️ 语音</div>}
                  <button type="button" className="image-preview-remove" onClick={() => setMedia(media.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {media.length < 9 && (
                <label className="upload-btn">
                  <span style={{ fontSize: 24 }}>+</span><span>上传媒体</span>
                  <input type="file" accept="image/*,video/*,audio/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
                </label>
              )}
            </div>
            <p className="anon-hint">支持图片、视频与语音（单个文件最大 40MB）</p>
          </div>

          <div className="form-group">
            <p style={{ fontSize: 13, color: 'var(--text-light)', margin: '4px 0' }}>发帖昵称将使用你当前的昵称「{user.nickname}」</p>
            <label className="anon-toggle">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <span>匿名发布（管理员仍可见真实身份）</span>
            </label>
            <p className="anon-hint">开启后其他同学只会看到「匿名同学」，看不到你的昵称、头像与主页入口；管理员仍可核查真实身份。</p>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? '发布中...' : '发布帖子'}</button>
          <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 12 }}>发布后需管理员审核通过才会显示</p>
        </form>
      </div>
    </div>
  );
}
