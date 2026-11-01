import { useState, useEffect } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(api.isAdmin());
  const [role, setRole] = useState(sessionStorage.getItem('admin_role') || '');
  const isSuper = role === 'super';
  const [password, setPassword] = useState('');
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [modalImg, setModalImg] = useState(null);
  const [tab, setTab] = useState('posts');
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [bans, setBans] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [userDetail, setUserDetail] = useState(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [notifyContent, setNotifyContent] = useState('');
  const [notifyAll, setNotifyAll] = useState(true);
  const [notifyUids, setNotifyUids] = useState('');
  const [notifyResult, setNotifyResult] = useState('');
  const [notifySending, setNotifySending] = useState(false);
  const [msgTarget, setMsgTarget] = useState(null);
  const [msgConvs, setMsgConvs] = useState([]);
  const [msgPeer, setMsgPeer] = useState(null);
  const [msgList, setMsgList] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  // 申请处理
  const [applications, setApplications] = useState([]);
  const [appFilter, setAppFilter] = useState('pending');
  const [appLoading, setAppLoading] = useState(false);
  const [editingApp, setEditingApp] = useState(null); // 当前正在编辑资料的申请
  const [editForm, setEditForm] = useState({});
  const [editGrade, setEditGrade] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [appNote, setAppNote] = useState('');

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
    } else if (tab === 'alerts') {
      try { setAlerts(await api.adminAlerts()); } catch (e) { alert(e.message); }
    } else if (tab === 'bans') {
      try { setBans(await api.adminBans()); } catch (e) { alert(e.message); }
    } else if (tab === 'applications') {
      setAppLoading(true);
      try { setApplications(await api.getAdminApplications(appFilter)); } catch (e) { alert(e.message); }
      finally { setAppLoading(false); }
    }
  };

  useEffect(() => {
    if (!loggedIn) return;
    api.adminWhoami().then((r) => {
      setRole(r.role);
      sessionStorage.setItem('admin_role', r.role);
    }).catch(() => {
      api.adminLogout();
      setLoggedIn(false);
    });
  }, [loggedIn]);

  useEffect(() => {
    if (loggedIn) {
      load();
      api.getAdminStats().then(setStats).catch(() => {});
    }
  }, [loggedIn, filter, tab, appFilter]);

  const login = async (e) => {
    e.preventDefault();
    api.adminLogin(password);
    try {
      const r = await api.adminWhoami();
      setRole(r.role);
      sessionStorage.setItem('admin_role', r.role);
      setTab('posts');
      setLoggedIn(true);
    } catch (err) {
      api.adminLogout();
      setLoggedIn(false);
      alert('密码错误或无管理员权限');
    }
  };

  const logout = () => { api.adminLogout(); setLoggedIn(false); setPassword(''); setRole(''); setTab('posts'); };

  const updateStatus = async (id, status) => {
    try { await api.updatePostStatus(id, status); setPosts((prev) => prev.filter((p) => p.id !== id)); }
    catch (e) { alert(e.message); }
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.getPostAdmin(id);
      setDetail(data);
    } catch (e) { alert(e.message); }
    finally { setDetailLoading(false); }
  };

  const forceDelete = async (id) => {
    if (!confirm('确定强制删除该帖子？此操作不可恢复，将同时清理图片、评论、点赞、收藏、举报与相关通知，并扣除作者 10 点信誉分。')) return;
    try {
      await api.adminDeletePost(id);
      setDetail(null);
      await load();
      api.getAdminStats().then(setStats).catch(() => {});
    } catch (e) { alert(e.message); }
  };

  const delUser = async (id) => {
    if (!confirm('确定删除该用户？此操作不可恢复。')) return;
    try { await api.deleteUser(id); setUsers((prev) => prev.filter((u) => u.uid !== id)); }
    catch (e) { alert(e.message); }
  };

  const setUserRole = async (id, role) => {
    try { await api.updateUserRole(id, role); setUsers((prev) => prev.map((u) => u.uid === id ? { ...u, role } : u)); }
    catch (e) { alert(e.message); }
  };

  const banUser = async (uid) => {
    const input = prompt('请输入封禁原因', '违反社区规范');
    if (input === null) return;
    const reason = input.trim() || '违反社区规范';
    try {
      await api.adminBanUser(uid, reason);
      await load();
    } catch (e) { alert(e.message); }
  };

  const unbanUser = async (uid) => {
    if (!confirm('确定解除该用户的封禁？')) return;
    try {
      await api.adminUnbanUser(uid);
      await load();
    } catch (e) { alert(e.message); }
  };

  // 点击用户 → 展示该用户全部信息（含经纬度、明文密码、历史帖子）
  const openUserDetail = async (uid) => {
    setUserDetailLoading(true);
    try {
      setUserDetail(await api.getUserDetail(uid));
    } catch (e) { alert(e.message); }
    finally { setUserDetailLoading(false); }
  };

  const restoreReputation = async (uid, current) => {
    const input = prompt('请输入要恢复的信誉分（满分 100）', '100');
    if (input === null) return;
    const value = Number(input);
    if (!Number.isFinite(value)) { alert('请输入有效数字'); return; }
    try {
      const r = await api.restoreReputation(uid, value);
      alert(`已恢复该用户信誉分为 ${r.reputation}${r.unbanned ? '，并已自动解封' : ''}`);
      await load();
      if (userDetail && userDetail.user.uid === uid) await openUserDetail(uid);
    } catch (e) { alert(e.message); }
  };

  const openMessages = async (u) => {
    setMsgTarget(u);
    setMsgPeer(null);
    setMsgList([]);
    setMsgConvs([]);
    try { setMsgConvs(await api.adminConversations(u.uid)); }
    catch (e) { alert(e.message); }
  };

  const openPeer = async (peerUid) => {
    if (!msgTarget) return;
    setMsgPeer(peerUid);
    setMsgLoading(true);
    try { setMsgList(await api.adminMessages(msgTarget.uid, peerUid)); }
    catch (e) { alert(e.message); }
    finally { setMsgLoading(false); }
  };

  const markAlertsRead = async () => {
    try {
      await api.adminReadAlerts();
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    } catch (e) { alert(e.message); }
  };

  const sendNotify = async (e) => {
    e.preventDefault();
    if (!notifyContent.trim()) { alert('请输入通知内容'); return; }
    const uids = notifyUids.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!notifyAll && uids.length === 0) { alert('请输入接收用户 uid'); return; }
    setNotifySending(true);
    try {
      const r = await api.notifyUsers(
        notifyAll ? { all: true, content: notifyContent.trim() } : { all: false, uids, content: notifyContent.trim() }
      );
      setNotifyResult(`已发送给 ${r.sent} 位用户`);
      setNotifyContent('');
      if (!notifyAll) setNotifyUids('');
    } catch (err) { alert(err.message); }
    finally { setNotifySending(false); }
  };

  const handleReport = async (id, status) => {
    try { await api.updateReport(id, status); setReports((prev) => prev.filter((r) => r.id !== id)); }
    catch (e) { alert(e.message); }
  };

  // 打开申请者资料编辑
  const openEditApplicant = (app) => {
    setEditingApp(app);
    setEditForm({
      nickname: app.nickname || '',
      real_name: app.real_name || '',
      class_name: app.class_name || '',
      address: app.address || '',
      email: app.email || '',
      wechat: app.wechat || '',
      qq: app.qq || '',
      phone: app.phone || '',
      bio: app.bio || '',
    });
    setEditGrade(app.grade != null ? String(app.grade) : '');
    setEditTag(app.tag || '');
    setAppNote(app.admin_note || '');
  };

  const saveApplicantProfile = async () => {
    if (!editingApp) return;
    setEditSaving(true);
    try {
      const payload = { ...editForm };
      if (editGrade.trim() !== '') payload.grade = Number(editGrade);
      else payload.grade = null;
      if (editTag) payload.tag = editTag;
      await api.adminUpdateUserProfile(editingApp.uid, payload);
      alert('资料已更新');
      // 刷新列表
      const list = await api.getAdminApplications(appFilter);
      setApplications(list);
      const updated = list.find((a) => a.id === editingApp.id);
      if (updated) setEditingApp(updated);
    } catch (e) { alert(e.message); }
    finally { setEditSaving(false); }
  };

  const processApplication = async (app, status) => {
    try {
      await api.updateApplication(app.id, { status, admin_note: appNote });
      alert(status === 'approved' ? '已通过申请' : '已驳回申请');
      setEditingApp(null);
      load();
    } catch (e) { alert(e.message); }
  };

  const userQuery = userSearch.trim().toLowerCase();
  const filteredUsers = userQuery
    ? users.filter((u) =>
        (u.username || '').toLowerCase().includes(userQuery) ||
        (u.nickname || '').toLowerCase().includes(userQuery) ||
        (u.uid || '').toLowerCase().includes(userQuery))
    : users;

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
            <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 16 }}>管理员 / 超级管理员口令登录</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 className="page-title" style={{ margin: 0 }}>管理后台{isSuper ? ' · 超级管理员' : ''}</h1>
          <button className="btn btn-secondary" onClick={logout}>退出登录</button>
        </div>

        {isSuper && stats && (
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
            ...(isSuper ? [
              { k: 'applications', l: '📨 申请处理' },
              { k: 'users', l: '👥 用户管理' },
              { k: 'alerts', l: '🛡️ 安全告警' },
              { k: 'bans', l: '⛔ 封禁名单' },
              { k: 'notify', l: '📢 通知群发' },
            ] : []),
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
                    {p.is_anonymous && <span className="anon-badge">匿名</span>}
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
                    <button className="btn-secondary" onClick={() => openDetail(p.id)} disabled={detailLoading}>详情</button>
                    <button className="btn-success" onClick={() => updateStatus(p.id, 'approved')}>通过</button>
                    <button className="btn-warning" onClick={() => updateStatus(p.id, 'rejected')}>拒绝</button>
                    <button className="btn-secondary" onClick={() => updateStatus(p.id, 'pending')}>重审</button>
                    {isSuper && <button className="btn-danger" onClick={() => forceDelete(p.id)}>强制删除</button>}
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
                {r.post_id && isSuper && <button className="btn-danger" onClick={() => { if (confirm('删除该帖子？将扣除作者 10 点信誉分。')) { api.adminDeletePost(r.post_id).then(() => handleReport(r.id, 'resolved')); } }}>删除帖子</button>}
              </div>
            </div>
          ))
        )}

        {isSuper && tab === 'applications' && (
          <>
            <div className="cat-tabs" style={{ paddingTop: 0 }}>
              {[{ k: 'pending', l: '⏳ 待处理' }, { k: 'approved', l: '✅ 已通过' }, { k: 'rejected', l: '❌ 已驳回' }, { k: 'all', l: '📋 全部' }].map((t) => (
                <button key={t.k} className={`cat-tab ${appFilter === t.k ? 'active' : ''}`} onClick={() => setAppFilter(t.k)}>{t.l}</button>
              ))}
            </div>
            {appLoading ? <div className="loading">加载中...</div> :
              applications.length === 0 ? (
                <div className="empty"><div className="empty-icon">📨</div><div>暂无申请</div></div>
              ) : applications.map((a) => (
                <div className="admin-post" key={a.id}>
                  <div className="admin-post-head">
                    <span style={{ fontWeight: 600 }}>{a.nickname} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(@{a.username})</span></span>
                    <span className={`status-badge status-${a.status}`}>{a.status === 'pending' ? '待处理' : a.status === 'approved' ? '已通过' : '已驳回'}</span>
                    <span className="post-time">{a.created_at}</span>
                  </div>
                  <div className="post-time" style={{ marginBottom: 6 }}>
                    UID: {a.uid}
                    {a.real_name && ` · 姓名：${a.real_name}`}
                    {a.class_name && ` · 班级：${a.class_name}`}
                    {a.grade != null && ` · ${a.grade}级`}
                    {a.tag && ` · ${a.tag === 'graduate' ? '🎓 毕业生' : '📚 在校生'}`}
                  </div>
                  <div className="post-content" style={{ whiteSpace: 'pre-wrap' }}>{a.content}</div>
                  {a.images && a.images.length > 0 && (
                    <div className="post-images" style={{ marginTop: 8 }}>
                      {a.images.map((img, i) => (<img key={i} src={img} alt="" style={{ cursor: 'pointer' }} onClick={() => setModalImg(img)} />))}
                    </div>
                  )}
                  {a.admin_note && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-light)' }}><strong>管理员备注：</strong>{a.admin_note}</div>
                  )}
                  <div className="admin-actions">
                    <button className="btn-primary" onClick={() => openEditApplicant(a)}>处理申请</button>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {tab === 'users' && isSuper && (
          <>
            <div className="form-group">
              <input className="form-input" placeholder="搜索昵称 / 用户名 / UID" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            </div>
            {filteredUsers.length === 0 ? (
              <div className="empty"><div className="empty-icon">👥</div><div>暂无用户</div></div>
            ) : filteredUsers.map((u) => (
              <div className="admin-post" key={u.uid}>
                <div className="admin-post-head" style={{ cursor: 'pointer' }} onClick={() => openUserDetail(u.uid)} title="点击查看该用户全部信息">
                  <span style={{ fontWeight: 600 }}>{u.nickname} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(@{u.username})</span></span>
                  <span className={`status-badge ${u.role === 'super' ? 'status-rejected' : u.role === 'admin' ? 'status-approved' : 'status-pending'}`}>{u.role === 'super' ? '超级管理员' : u.role === 'admin' ? '管理员' : '普通用户'}</span>
                  {u.banned && <span className="status-badge status-rejected">已封禁</span>}
                  <span className="post-time">{u.created_at}</span>
                  <span style={{ fontSize: 12, color: 'var(--primary)' }}>查看详情 →</span>
                </div>
                <div className="post-time" style={{ marginBottom: 4 }}>UID: {u.uid} · 信誉分：{u.reputation != null ? u.reputation : '—'}</div>
                {(u.grade != null || u.tag) && (
                  <div className="post-time" style={{ marginBottom: 4 }}>
                    {u.grade != null && `${u.grade}级`}
                    {u.grade != null && u.tag && ' · '}
                    {u.tag === 'graduate' ? '🎓 毕业生' : u.tag === 'student' ? '📚 在校生' : ''}
                    {u.grade_set_by_admin && ' · 年级已由管理员设置'}
                  </div>
                )}
                {isSuper && (u.latitude != null || u.longitude != null) && (
                  <div className="post-time" style={{ marginBottom: 4, color: 'var(--warning)' }}>📍 经纬度：{u.latitude}, {u.longitude}</div>
                )}
                {(u.real_name || u.class_name || u.address || u.email || u.wechat || u.qq || u.phone || u.bio) && (
                  <div className="post-time" style={{ marginBottom: 4, fontSize: 12, lineHeight: 1.7 }}>
                    {u.real_name && <div>真实姓名：{u.real_name}</div>}
                    {u.class_name && <div>班级：{u.class_name}</div>}
                    {u.address && <div>住址：{u.address}</div>}
                    {u.email && <div>邮箱：{u.email}</div>}
                    {u.wechat && <div>微信：{u.wechat}</div>}
                    {u.qq && <div>QQ：{u.qq}</div>}
                    {u.phone && <div>手机号：{u.phone}</div>}
                    {u.bio && <div>签名：{u.bio}</div>}
                  </div>
                )}
                {u.banned && u.banned_reason && (
                  <div className="post-time" style={{ marginBottom: 4, color: 'var(--danger)' }}>封禁原因：{u.banned_reason} · {u.banned_at || ''}</div>
                )}
                <div className="admin-actions">
                  {u.banned ? (
                    <button className="btn-success" onClick={() => unbanUser(u.uid)}>解封</button>
                  ) : (
                    <button className="btn-danger" onClick={() => banUser(u.uid)}>封禁</button>
                  )}
                  <button className="btn-success" onClick={() => restoreReputation(u.uid, u.reputation)}>恢复信誉分</button>
                  {u.role === 'super' ? (
                    <button className="btn-secondary" onClick={() => setUserRole(u.uid, 'user')}>取消超管</button>
                  ) : (
                    <button className="btn-secondary" onClick={() => setUserRole(u.uid, 'super')}>设为超管</button>
                  )}
                  {u.role === 'admin' ? (
                    <button className="btn-secondary" onClick={() => setUserRole(u.uid, 'user')}>取消管理员</button>
                  ) : (
                    <button className="btn-success" onClick={() => setUserRole(u.uid, 'admin')}>设为管理员</button>
                  )}
                  <button className="btn-secondary" onClick={() => openMessages(u)}>查看私信</button>
                  <button className="btn-danger" onClick={() => delUser(u.uid)}>删除用户</button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'alerts' && isSuper && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 15, margin: 0 }}>🛡️ 安全告警</h3>
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={markAlertsRead}>全部标为已读</button>
            </div>
            {alerts.length === 0 ? (
              <div className="empty"><div className="empty-icon">🛡️</div><div>暂无安全告警</div></div>
            ) : alerts.map((a) => (
              <div className="admin-post" key={a.id}>
                <div className="admin-post-head">
                  <span className={`status-badge ${a.read ? 'status-approved' : 'status-pending'}`}>{a.read ? '已读' : '未读'}</span>
                  <span className="post-time">{a.created_at}</span>
                </div>
                <div className="post-content" style={{ fontSize: 14 }}>{a.content}</div>
              </div>
            ))}
          </>
        )}

        {tab === 'bans' && isSuper && (
          bans.length === 0 ? (
            <div className="empty"><div className="empty-icon">⛔</div><div>封禁名单为空</div></div>
          ) : bans.map((u) => (
            <div className="admin-post" key={u.uid}>
              <div className="admin-post-head">
                <span style={{ fontWeight: 600 }}>{u.nickname} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(@{u.username})</span></span>
                <span className="status-badge status-rejected">已封禁</span>
                <span className="post-time">{u.banned_at || ''}</span>
              </div>
              <div className="post-time" style={{ marginBottom: 4 }}>UID: {u.uid} · 信誉分：{u.reputation != null ? u.reputation : '—'}</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}><strong>封禁原因：</strong>{u.banned_reason || '—'}</div>
              <div className="admin-actions">
                <button className="btn-success" onClick={() => unbanUser(u.uid)}>解封</button>
                <button className="btn-secondary" onClick={() => openMessages(u)}>查看私信</button>
              </div>
            </div>
          ))
        )}

        {isSuper && tab === 'notify' && (
          <form className="admin-post" onSubmit={sendNotify}>
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>📢 发送通知</h3>
            <div className="form-group">
              <textarea className="form-textarea" placeholder="输入通知内容..." value={notifyContent} onChange={(e) => setNotifyContent(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 10, fontSize: 14 }}>
              <label className="anon-toggle">
                <input type="radio" checked={notifyAll} onChange={() => setNotifyAll(true)} />
                <span>全部用户</span>
              </label>
              <label className="anon-toggle">
                <input type="radio" checked={!notifyAll} onChange={() => setNotifyAll(false)} />
                <span>指定用户</span>
              </label>
            </div>
            {!notifyAll && (
              <div className="form-group">
                <input className="form-input" placeholder="输入 uid，逗号或空格分隔" value={notifyUids} onChange={(e) => setNotifyUids(e.target.value)} />
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={notifySending}>{notifySending ? '发送中...' : '发送'}</button>
            {notifyResult && <p className="anon-hint" style={{ color: 'var(--success)' }}>{notifyResult}</p>}
          </form>
        )}
      </div>
      {modalImg && <div className="image-modal" onClick={() => setModalImg(null)}><img src={modalImg} alt="" /></div>}

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal-box admin-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>帖子详情 #{detail.post.id}</h3>
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>关闭</button>
            </div>

            <div className="admin-detail-section">
              <h4>帖子信息</h4>
              <div className="admin-detail-grid">
                <div className="admin-detail-item"><span className="admin-detail-label">分类</span><span>{detail.post.category}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">状态</span><span>{detail.post.status}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">匿名发布</span><span>{detail.is_anonymous ? '是' : '否'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">评论 / 点赞</span><span>{detail.stats.comments} / {detail.stats.likes}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">发布时间</span><span>{detail.post.created_at}</span></div>
              </div>
              <div className="admin-detail-content">{detail.post.content}</div>
            </div>

            <div className="admin-detail-section">
              <h4>发布者信息</h4>
              {detail.author ? (
                <div className="admin-detail-grid">
                  <div className="admin-detail-item"><span className="admin-detail-label">用户名</span><span>@{detail.author.username}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">昵称</span><span>{detail.author.nickname || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">真实姓名</span><span>{detail.author.real_name || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">班级</span><span>{detail.author.class_name || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">住址</span><span>{detail.author.address || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">邮箱</span><span>{detail.author.email || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">微信</span><span>{detail.author.wechat || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">QQ</span><span>{detail.author.qq || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">手机号</span><span>{detail.author.phone || '—'}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">注册时间</span><span>{detail.author.created_at}</span></div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-light)', fontSize: 13 }}>发布者账号已注销或不存在</p>
              )}
            </div>

            <div className="admin-detail-section">
              <h4>网络信息</h4>
              <div className="admin-detail-grid">
                <div className="admin-detail-item"><span className="admin-detail-label">IP</span><span>{detail.client_ip || '—'}</span></div>
                <div className="admin-detail-item admin-detail-wide"><span className="admin-detail-label">UA</span><span className="admin-detail-ua">{detail.user_agent || '—'}</span></div>
              </div>
            </div>

            <div className="admin-detail-actions">
              {isSuper && <button className="btn btn-danger" onClick={() => forceDelete(detail.post.id)}>强制删除</button>}
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {userDetailLoading && (
        <div className="modal-overlay"><div className="modal-box admin-detail-box"><div className="loading">加载中...</div></div></div>
      )}

      {userDetail && (
        <div className="modal-overlay" onClick={() => setUserDetail(null)}>
          <div className="modal-box admin-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>用户详情 · {userDetail.user.nickname} (@{userDetail.user.username})</h3>
              <button className="btn btn-secondary" onClick={() => setUserDetail(null)}>关闭</button>
            </div>

            <div className="admin-detail-section">
              <h4>账号信息</h4>
              <div className="admin-detail-grid">
                <div className="admin-detail-item"><span className="admin-detail-label">UID</span><span>{userDetail.user.uid}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">用户名</span><span>@{userDetail.user.username}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">昵称</span><span>{userDetail.user.nickname || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">角色</span><span>{userDetail.user.role === 'super' ? '超级管理员' : userDetail.user.role === 'admin' ? '管理员' : '普通用户'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">信誉分</span><span>{userDetail.user.reputation != null ? userDetail.user.reputation : '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">注册时间</span><span>{userDetail.user.created_at || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">协议同意时间</span><span>{userDetail.user.agreed_at || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">ID 公开</span><span>{userDetail.user.show_uid ? '是' : '否'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">封禁状态</span><span>{userDetail.user.banned ? `已封禁（${userDetail.user.banned_reason || '无原因'} · ${userDetail.user.banned_at || ''}）` : '正常'}</span></div>
              </div>
            </div>

            <div className="admin-detail-section">
              <h4>账号密码</h4>
              {userDetail.password_plain ? (
                <div className="admin-detail-grid">
                  <div className="admin-detail-item admin-detail-wide">
                    <span className="admin-detail-label">明文密码</span>
                    <span style={{ color: 'var(--danger)', fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>{userDetail.password_plain}</span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-light)', fontSize: 13 }}>
                  该账号注册时未保存可还原的密码（bcrypt 哈希不可逆），无法展示明文。
                </p>
              )}
            </div>

            <div className="admin-detail-section">
              <h4>个人资料</h4>
              <div className="admin-detail-grid">
                <div className="admin-detail-item"><span className="admin-detail-label">真实姓名</span><span>{userDetail.user.real_name || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">班级</span><span>{userDetail.user.class_name || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">住址</span><span>{userDetail.user.address || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">邮箱</span><span>{userDetail.user.email || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">微信</span><span>{userDetail.user.wechat || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">QQ</span><span>{userDetail.user.qq || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">手机号</span><span>{userDetail.user.phone || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">个性签名</span><span>{userDetail.user.bio || '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">入学年份</span><span>{userDetail.user.grade != null ? `${userDetail.user.grade}级` : '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">身份标签</span><span>{userDetail.user.tag === 'graduate' ? '🎓 毕业生' : userDetail.user.tag === 'student' ? '📚 在校生' : '—'}{userDetail.user.grade_set_by_admin ? '（管理员确认）' : ''}</span></div>
              </div>
            </div>

            <div className="admin-detail-section">
              <h4>网络信息</h4>
              <div className="admin-detail-grid">
                <div className="admin-detail-item admin-detail-wide">
                  <span className="admin-detail-label">经纬度</span>
                  <span style={{ color: 'var(--warning)' }}>
                    {userDetail.user.latitude != null || userDetail.user.longitude != null
                      ? `${userDetail.user.latitude}, ${userDetail.user.longitude}`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="admin-detail-section">
              <h4>历史帖子（{userDetail.posts.length}）</h4>
              {userDetail.posts.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: 13 }}>该用户暂无帖子</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {userDetail.posts.map((p) => (
                    <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-light)', marginBottom: 4 }}>
                        <span>#{p.id} · {p.category}</span>
                        <span className={`status-badge status-${p.status}`}>{p.status === 'pending' ? '待审核' : p.status === 'approved' ? '已通过' : '已驳回'}</span>
                        {p.is_anonymous && <span>匿名</span>}
                        <span>{p.created_at}</span>
                        <span>👍 {p.likes} · 👁 {p.views}</span>
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{p.content}</div>
                      {p.images && p.images.length > 0 && (
                        <div className="post-images" style={{ marginTop: 6 }}>
                          {p.images.map((img, i) => (<img key={i} src={img} alt="" style={{ width: 56, height: 56, objectFit: 'cover', marginRight: 4, cursor: 'pointer' }} onClick={() => setModalImg(img)} />))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-detail-actions">
              <button className="btn btn-success" onClick={() => restoreReputation(userDetail.user.uid, userDetail.user.reputation)}>恢复信誉分</button>
              {userDetail.user.banned ? (
                <button className="btn btn-success" onClick={() => { unbanUser(userDetail.user.uid); }}>解封</button>
              ) : (
                <button className="btn btn-danger" onClick={() => { banUser(userDetail.user.uid); }}>封禁</button>
              )}
              <button className="btn btn-secondary" onClick={() => setUserDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {editingApp && (
        <div className="modal-overlay" onClick={() => setEditingApp(null)}>
          <div className="modal-box admin-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>处理申请 · {editingApp.nickname} (@{editingApp.username})</h3>
              <button className="btn btn-secondary" onClick={() => setEditingApp(null)}>关闭</button>
            </div>

            <div className="admin-detail-section">
              <h4>申请内容</h4>
              <div className="admin-detail-content" style={{ whiteSpace: 'pre-wrap' }}>{editingApp.content}</div>
              {editingApp.images && editingApp.images.length > 0 && (
                <div className="post-images" style={{ marginTop: 8 }}>
                  {editingApp.images.map((img, i) => (<img key={i} src={img} alt="" style={{ cursor: 'pointer' }} onClick={() => setModalImg(img)} />))}
                </div>
              )}
            </div>

            <div className="admin-detail-section">
              <h4>申请者资料（可修改）</h4>
              <div className="admin-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  { k: 'nickname', l: '昵称' },
                  { k: 'real_name', l: '真实姓名' },
                  { k: 'class_name', l: '班级' },
                  { k: 'address', l: '住址' },
                  { k: 'email', l: '邮箱' },
                  { k: 'wechat', l: '微信' },
                  { k: 'qq', l: 'QQ' },
                  { k: 'phone', l: '手机号' },
                ].map((f) => (
                  <div className="form-group" key={f.k} style={{ margin: '4px 0' }}>
                    <label style={{ fontSize: 12, color: 'var(--text-light)' }}>{f.l}</label>
                    <input className="form-input" style={{ fontSize: 13 }} value={editForm[f.k] || ''} onChange={(e) => setEditForm((p) => ({ ...p, [f.k]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group" style={{ gridColumn: '1 / -1', margin: '4px 0' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-light)' }}>个人简介</label>
                  <textarea className="form-textarea" style={{ fontSize: 13 }} rows={2} value={editForm.bio || ''} onChange={(e) => setEditForm((p) => ({ ...p, bio: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="admin-detail-section">
              <h4>年级与身份标签</h4>
              <div className="admin-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group" style={{ margin: '4px 0' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-light)' }}>入学年份（如 2022）</label>
                  <input className="form-input" style={{ fontSize: 13 }} type="number" value={editGrade} onChange={(e) => setEditGrade(e.target.value)} placeholder="留空则清除" />
                </div>
                <div className="form-group" style={{ margin: '4px 0' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-light)' }}>身份标签（手动设置）</label>
                  <select className="form-input" style={{ fontSize: 13 }} value={editTag} onChange={(e) => setEditTag(e.target.value)}>
                    <option value="">（由年级自动判定）</option>
                    <option value="student">📚 在校生</option>
                    <option value="graduate">🎓 毕业生</option>
                  </select>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-light)', margin: '6px 0 0' }}>
                {editingApp.grade_set_by_admin ? '✓ 年级由管理员设置，每年9月1日后若超过3年将自动标记为毕业生' : '年级尚未由管理员设置'}
              </p>
            </div>

            {isSuper && (editingApp.latitude != null || editingApp.longitude != null) && (
              <div className="admin-detail-section">
                <h4>📍 经纬度（仅超级管理员可见）</h4>
                <div className="admin-detail-grid">
                  <div className="admin-detail-item"><span className="admin-detail-label">纬度</span><span>{editingApp.latitude}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">经度</span><span>{editingApp.longitude}</span></div>
                </div>
              </div>
            )}

            <div className="admin-detail-section">
              <h4>审核备注</h4>
              <textarea className="form-textarea" rows={2} placeholder="可填写处理意见（用户可见）" value={appNote} onChange={(e) => setAppNote(e.target.value)} />
            </div>

            <div className="admin-detail-actions">
              <button className="btn btn-primary" onClick={saveApplicantProfile} disabled={editSaving}>{editSaving ? '保存中...' : '保存资料修改'}</button>
              <button className="btn btn-success" onClick={() => processApplication(editingApp, 'approved')}>通过申请</button>
              <button className="btn btn-warning" onClick={() => processApplication(editingApp, 'rejected')}>驳回申请</button>
              <button className="btn btn-secondary" onClick={() => setEditingApp(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {msgTarget && (
        <div className="modal-overlay" onClick={() => setMsgTarget(null)}>
          <div className="modal-box admin-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>私信查看 · {msgTarget.nickname} (@{msgTarget.username})</h3>
              <button className="btn btn-secondary" onClick={() => setMsgTarget(null)}>关闭</button>
            </div>
            <div className="admin-detail-section">
              <h4>会话列表</h4>
              {msgConvs.length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: 13 }}>暂无会话</p>
              ) : msgConvs.map((c) => (
                <button
                  key={c.uid}
                  className="admin-post"
                  style={{ width: '100%', textAlign: 'left', border: '1px solid var(--border)', background: msgPeer === c.uid ? 'var(--primary-light)' : 'var(--card)' }}
                  onClick={() => openPeer(c.uid)}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nickname || c.uid}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{c.last_content} · {c.last_time}</div>
                </button>
              ))}
            </div>
            {msgPeer && (
              <div className="admin-detail-section">
                <h4>完整会话</h4>
                {msgLoading ? (
                  <div className="loading">加载中...</div>
                ) : msgList.length === 0 ? (
                  <p style={{ color: 'var(--text-light)', fontSize: 13 }}>暂无消息</p>
                ) : (
                  <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {msgList.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          alignSelf: m.from_uid === msgTarget.uid ? 'flex-start' : 'flex-end',
                          background: m.from_uid === msgTarget.uid ? 'var(--bg)' : 'var(--primary-light)',
                          padding: '8px 10px', borderRadius: 10, maxWidth: '82%', fontSize: 13,
                        }}
                      >
                        <div>{m.content}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{m.from_uid === msgTarget.uid ? '该用户' : '对方'} · {m.created_at}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
