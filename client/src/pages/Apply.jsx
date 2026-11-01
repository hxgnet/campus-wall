import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Apply() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [myApps, setMyApps] = useState([]);

  useEffect(() => {
    if (user) api.getMyApplications().then(setMyApps).catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="page">
        <div className="container" style={{ textAlign: 'center', marginTop: 80 }}>
          <div className="empty-icon" style={{ fontSize: 48 }}>🔐</div>
          <p style={{ margin: '12px 0' }}>请先登录后再提交申请</p>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>去登录</button>
        </div>
      </div>
    );
  }

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    const remaining = 9 - images.length;
    const newImgs = files.slice(0, remaining).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    setImages((prev) => [...prev, ...newImgs]);
  };

  const removeImage = (idx) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!content.trim()) { alert('请填写申请内容'); return; }
    setLoading(true);
    try {
      await api.submitApplication(content, images.map((i) => i.file));
      alert('申请已提交，管理员会尽快处理');
      setContent('');
      setImages([]);
      api.getMyApplications().then(setMyApps).catch(() => {});
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const statusText = (s) => ({ pending: '待处理', approved: '已通过', rejected: '已驳回' }[s] || s);

  return (
    <div className="page">
      <div className="container">
        <h2 style={{ marginBottom: 16 }}>📝 提交申请</h2>
        <div className="detail-card" style={{ marginBottom: 16 }}>
          <textarea
            className="form-textarea"
            placeholder="请描述你的申请内容（如修改资料、认证身份等）..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={img.url} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
                <button
                  onClick={() => removeImage(i)}
                  style={{ position: 'absolute', top: -6, right: -6, background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12 }}
                >×</button>
              </div>
            ))}
            {images.length < 9 && (
              <label style={{ width: 72, height: 72, border: '2px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-light)', fontSize: 24 }}>
                +
                <input type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
              </label>
            )}
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={submit} disabled={loading}>
            {loading ? '提交中...' : '提交申请'}
          </button>
        </div>

        <h3 style={{ marginBottom: 12 }}>我的申请记录</h3>
        {myApps.length === 0 ? (
          <div className="empty"><div className="empty-icon">📭</div><div>暂无申请</div></div>
        ) : myApps.map((a) => (
          <div className="detail-card" key={a.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="post-time">{a.created_at}</span>
              <span className={`cat-tab ${a.status === 'pending' ? '' : 'active'}`} style={{ padding: '2px 10px', fontSize: 12 }}>
                {statusText(a.status)}
              </span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{a.content}</div>
            {a.images && a.images.length > 0 && (
              <div className="post-images" style={{ marginTop: 8 }}>
                {a.images.map((img, i) => <img key={i} src={img} alt="" />)}
              </div>
            )}
            {a.admin_note && (
              <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 13 }}>
                <strong>管理员回复：</strong>{a.admin_note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
