import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(api.isAdmin());
  const [password, setPassword] = useState('');
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [modalImg, setModalImg] = useState(null);
  const [tab, setTab] = useState('posts');
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);

  const load = async () => {
    if (tab === 'posts') {
      setLoading(true);
      try {
        const data = await api.getAdminPosts(filter);
        setPosts(data.posts);
      } catch (e) {
        alert(e.message);
        api.adminLogout();
        setLoggedIn(false);
      } finally { setLoading(false); }
    } else if (tab === 'reports') {
      try { setReports(await api.getReports()); } catch (e) { alert(e.message); }
    } else if (tab === 'users') {
      try { setUsers(await api.getUsers()); } catch (e) { alert(e.message); }
    }
  };

  useEffect(() => {
    if (loggedIn) {
      load();
      api.getAdminStats().then(setStats).catch(() => {});
    }
  }, [loggedIn, filter, tab]);

  const login = (e) => {
    e.preventDefault();
    if (api.adminLogin(password)) setLoggedIn(true);
    else alert('密码错误');
  };

  const logout = () => { api.adminLogout(); setLoggedIn(false); setPassword(''); };

  const updateStatus = async (id, status) => {
    try { await api.updatePostStatus(id, status); setPosts((prev) => prev.filter((p) => p.id !== id)); }
    catch (e) { alert(e.message); }
  };

  const del = async (id) => {
    if (!confirm('确定删除该帖子？')) return;
    try { await api.deletePost(id); setPosts((prev) => prev.filter((p) => p.id !== id)); }
    catch (e) { alert(e.message); }
  };

  const delUser = async (id) => {
    if (!confirm('确定删除该用户？')) return;
    try { await api.deleteUser(id); setUsers((prev) => prev.filter((u) => u.id !== id)); }
    catch (e) { alert(e.message); }
  };

  const setUserRole = async (id, role) => {
    try { await api.updateUserRole(id, role); setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u)); }
    catch (e) { alert(e.message); }
  };

  const handleReport = async (id, status) => {
    try { await api.updateReport(id, status); setReports((prev) => prev.filter((r) => r.id !== id)); }
    catch (e) { alert(e.message); }
  };

  if (!loggedIn) {
    return (
      <div className="page">
        <div className="container" style={{ maxWidth: 380, marginTop: 60 }}>
          <div className="detail-card">
            <h2 style={{ textAlign: 'center', marginBottom: 20 }}>🔐 管理员登录</h2>
            <form onSubmit={login}>
              <div className="form-group">
                <input type="password" className="form-input" placeholder="请输入管理员密码" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              </div>
              <button type="submit" className="btn btn-primary btn-block">登录</button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 16 }}>默认密码：admin123</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 className="page-title" style={{ margin: 0 }}>管理后台</h1>
          <button className="btn btn-secondary" onClick={logout}>退出登录</button>
        </div>

        {stats && (
          <div className="admin-stat-cards">
            <div className="stat-card"><div className="stat-num">{stats.totalPosts}</div><div className="stat-label">总帖子</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--warning)' }}>{stats.pendingPosts}</div><div className="stat-label">待审核</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--success)' }}>{stats.approvedPosts}</div><div className="stat-label">已通过</div></div>
            <div className="stat-card"><div className="stat-num">{stats.totalUsers}</div><div className="stat-label">用户数</div></div>
            <div className="stat-card"><div className="stat-num">{stats.totalComments}</div><div className="stat-label">评论数</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--danger)' }}>{stats.pendingReports}</div><div className="stat-label">待处理举报</div></div>
          </div>
        )}

        <div className="cat-tabs" style={{ paddingTop: 0 }}>
          {[
            { k: 'posts', l: '📝 帖子审核' },
            { k: 'reports', l: '🚩 举报处理' },
            { k: 'users', l: '👥 用户管理' },
          ].map((t) => (
            <button key={t.k} className={`cat-tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
          ))}
        </div>

        {tab === 'posts' && (
          <>
            <div className="cat-tabs" style={{ paddingTop: 0 }}>
              {[{ k: 'pending', l: '⏳ 待审核' }, { k: 'approved', l: '✅ 已通过' }, { k: 'rejected', l: '❌ 已拒绝' }, { k: 'all', l: '📋 全部' }].map((t) => (
                <button key={t.k} className={`cat-tab ${filter === t.k ? 'active' : ''}`} onClick={() => setFilter(t.k)}>{t.l}</button>
              ))}
            </div>
            {loading ? <div className="loading">加载中...</div> :
              posts.length === 0 ? (
                <div className="empty"><div className="empty-icon">📭</div><div>暂无帖子</div></div>
              ) : posts.map((p) => (
                <div className="admin-post" key={p.id}>
                  <div className="admin-post-head">
                    <span className={`post-cat cat-${p.category}`}>{p.category}</span>
                    <span className={`status-badge status-${p.status}`}>{p.status === 'pending' ? '待审核' : p.status === 'approved' ? '已通过' : '已拒绝'}</span>
                    <span className="post-time">{p.created_at}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 6 }}>@{p.nickname} · ❤️ {p.likes} · 👁️ {p.views}</div>
                  <div className="post-content">{p.content}</div>
                  {p.tags && p.tags.length > 0 && <div>{p.tags.map((t, i) => <span key={i} className="tag-chip">#{t}</span>)}</div>}
                  {p.images && p.images.length > 0 && (
                    <div className="post-images" style={{ marginTop: 10 }}>
                      {p.images.map((img, i) => (<img key={i} src={img} alt="" style={{ cursor: 'pointer' }} onClick={() => setModalImg(img)} />))}
                    </div>
                  )}
                  <div className="admin-actions">
                    <button className="btn-success" onClick={() => updateStatus(p.id, 'approved')}>通过</button>
                    <button className="btn-warning" onClick={() => updateStatus(p.id, 'rejected')}>拒绝</button>
                    <button className="btn-secondary" onClick={() => updateStatus(p.id, 'pending')}>重审</button>
                    <button className="btn-danger" onClick={() => del(p.id)}>删除</button>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {tab === 'reports' && (
          reports.length === 0 ? (
            <div className="empty"><div className="empty-icon">🚩</div><div>暂无举报</div></div>
          ) : reports.map((r) => (
            <div className="admin-post" key={r.id}>
              <div className="admin-post-head">
                <span className={`status-badge status-${r.status}`}>{r.status === 'pending' ? '待处理' : r.status}</span>
                <span className="post-time">{r.created_at}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>举报原因：</strong>{r.reason}
              </div>
              {r.post_content && (
                <div style={{ fontSize: 13, color: 'var(--text-light)', background: 'var(--bg)', padding: 8, borderRadius: 8 }}>
                  <strong>[{r.post_category}]</strong> {r.post_content}
                </div>
              )}
              <div className="admin-actions">
                <button className="btn-success" onClick={() => handleReport(r.id, 'resolved')}>标记已处理</button>
                <button className="btn-secondary" onClick={() => handleReport(r.id, 'ignored')}>忽略</button>
                {r.post_id && <button className="btn-danger" onClick={() => { if (confirm('删除该帖子？')) { api.deletePost(r.post_id).then(() => handleReport(r.id, 'resolved')); } }}>删除帖子</button>}
              </div>
            </div>
          ))
        )}

        {tab === 'users' && (
          users.length === 0 ? (
            <div className="empty"><div className="empty-icon">👥</div><div>暂无用户</div></div>
          ) : users.map((u) => (
            <div className="admin-post" key={u.id}>
              <div className="admin-post-head">
                <span style={{ fontWeight: 600 }}>{u.nickname} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(@{u.username})</span></span>
                <span className={`status-badge ${u.role === 'admin' ? 'status-approved' : 'status-pending'}`}>{u.role === 'admin' ? '管理员' : '普通用户'}</span>
                <span className="post-time">{u.created_at}</span>
              </div>
              <div className="admin-actions">
                {u.role === 'admin' ? (
                  <button className="btn-secondary" onClick={() => setUserRole(u.id, 'user')}>取消管理员</button>
                ) : (
                  <button className="btn-success" onClick={() => setUserRole(u.id, 'admin')}>设为管理员</button>
                )}
                <button className="btn-danger" onClick={() => delUser(u.id)}>删除用户</button>
              </div>
            </div>
          ))
        )}
      </div>
      {modalImg && <div className="image-modal" onClick={() => setModalImg(null)}><img src={modalImg} alt="" /></div>}
    </div>
  );
}
