import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, CATEGORIES, EMOJIS } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function CreatePost() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState(CATEGORIES[0].name);
  const [content, setContent] = useState('');
  const [nickname, setNickname] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

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

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    const remaining = 9 - images.length;
    files.slice(0, remaining).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setImages((prev) => [...prev, { url: reader.result, file }]);
      reader.readAsDataURL(file);
    });
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput('');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) { alert('请输入内容'); return; }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('category', category);
      fd.append('content', content);
      fd.append('nickname', nickname || user.nickname);
      fd.append('anonymous', anonymous ? 'true' : 'false');
      fd.append('tags', JSON.stringify(tags));
      images.forEach((img) => fd.append('images', img.file));
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
              {CATEGORIES.map((c) => (
                <button type="button" key={c.name} className={`cat-tab ${category === c.name ? 'active' : ''}`} onClick={() => setCategory(c.name)}>{c.icon} {c.name}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">内容 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <textarea className="form-textarea" placeholder="说点什么吧..." value={content} onChange={(e) => setContent(e.target.value)} maxLength={3000} />
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
            <label className="form-label">图片（最多9张，可选）</label>
            <div className="image-preview">
              {images.map((img, i) => (
                <div className="image-preview-item" key={i}>
                  <img src={img.url} alt="" />
                  <button type="button" className="image-preview-remove" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {images.length < 9 && (
                <label className="upload-btn">
                  <span style={{ fontSize: 24 }}>+</span><span>上传图片</span>
                  <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
                </label>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">昵称（默认使用你的账号昵称）</label>
            <input className="form-input" placeholder={user.nickname} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
          </div>

          <div className="form-group">
            <label className="anon-toggle">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <span>匿名发布（管理员仍可见真实身份）</span>
            </label>
            <p className="anon-hint">开启后其他同学只会看到「匿名同学」，看不到你的昵称与主页入口；管理员仍可核查真实身份。</p>
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? '发布中...' : '发布帖子'}</button>
          <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 12 }}>发布后需管理员审核通过才会显示</p>
        </form>
      </div>
    </div>
  );
}
