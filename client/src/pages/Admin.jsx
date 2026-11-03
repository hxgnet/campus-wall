import { useState, useEffect } from 'react';
import { api } from '../api.js';
import MediaView from '../components/MediaView.jsx';

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
  const [coinStats, setCoinStats] = useState(null);
  const [coinForm, setCoinForm] = useState({ uid: '', amount: '', reason: '' });
  const [coinBusy, setCoinBusy] = useState(false);
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

  // 举报状态筛选
  const [reportStatus, setReportStatus] = useState('pending');
  // 板块管理
  const [categories, setCategories] = useState([]);
  const [catForm, setCatForm] = useState({ name: '', icon: '📝', sort_order: 0, is_activity: false });
  // 操作记录
  const [logs, setLogs] = useState([]);
  // 注销审批
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [delFilter, setDelFilter] = useState('pending');
  // 帖子访问数据
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // 超管改名 / 标签
  const [userEdit, setUserEdit] = useState({ uid: null, username: '', custom_tag: '', tag_color: '' });
  // 超级通知
  const [notifyImage, setNotifyImage] = useState('');
  const [notifyBadge, setNotifyBadge] = useState('');
  const [notifyBadgeColor, setNotifyBadgeColor] = useState('#ff3b30');

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
      try { setReports(await api.getReports(reportStatus)); } catch (e) { alert(e.message); }
    } else if (tab === 'categories') {
      try { setCategories(await api.getAdminCategories()); } catch (e) { alert(e.message); }
    } else if (tab === 'logs') {
      try { setLogs(await api.getAdminLogs()); } catch (e) { alert(e.message); }
    } else if (tab === 'deletion') {
      try { setDeletionRequests(await api.getDeletionRequests(delFilter)); } catch (e) { alert(e.message); }
    } else if (tab === 'users') {
      try { setUsers(await api.getUsers()); } catch (e) { alert(e.message); }
    } else if (tab === 'alerts') {
      try { setAlerts(await api.adminAlerts()); } catch (e) { alert(e.message); }
    } else if (tab === 'bans') {
      try { setBans(await api.adminBans()); } catch (e) { alert(e.message); }
    } else if (tab === 'coins') {
      try { setCoinStats(await api.getAdminCoinStats()); } catch (e) { alert(e.message); }
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
  }, [loggedIn, filter, tab, appFilter, reportStatus, delFilter]);

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
    const input = status === 'rejected'
      ? prompt('请填写驳回理由（用户会在通知与「我的帖子」中看到）', '')
      : prompt('可填写审核备注（留空则不带理由，选填）', '');
    if (input === null) return;
    const note = input.trim();
    if (status === 'rejected' && !note) { alert('驳回必须填写处理理由'); return; }
    try {
      await api.updatePostStatus(id, status, note);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setDetail((d) => (d && d.post.id === id ? { ...d, post: { ...d.post, status, review_note: note || d.post.review_note } } : d));
    } catch (e) { alert(e.message); }
  };

  // 设置 / 取消热门帖（管理员与超管均可用）
  const toggleHot = async (post) => {
    try {
      const next = !post.is_hot;
      await api.setPostHot(post.id, next);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_hot: next } : p)));
      setDetail((d) => (d && d.post.id === post.id ? { ...d, post: { ...d.post, is_hot: next } } : d));
    } catch (e) { alert(e.message); }
  };

  // 超管置顶 / 取消置顶（多个置顶帖会在首页轮播位循环播放）
  const togglePin = async (post) => {
    try {
      const next = !post.is_pinned;
      await api.setPostPin(post.id, next);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_pinned: next } : p)));
      setDetail((d) => (d && d.post.id === post.id ? { ...d, post: { ...d.post, is_pinned: next } } : d));
    } catch (e) { alert(e.message); }
  };

  // 超管发放 / 收回鹏币
  const adjustCoins = async (uid, rawAmount, reason, sign = 1) => {
    const amount = Number(rawAmount);
    if (!uid) { alert('请输入用户 UID'); return; }
    if (!Number.isInteger(amount) || amount <= 0) { alert('请输入正整数数量'); return; }
    if (!reason.trim()) { alert('必须填写理由'); return; }
    setCoinBusy(true);
    try {
      const r = await api.adminAdjustCoins(uid.trim(), sign * amount, reason.trim());
      alert(`操作成功，${sign > 0 ? '发放' : '收回'} ${Math.abs(r.delta)} 鹏币，当前余额 ${r.coins}`);
      setCoinForm({ uid: '', amount: '', reason: '' });
      if (tab === 'coins') setCoinStats(await api.getAdminCoinStats());
      if (userDetail && userDetail.user.uid === uid.trim()) await openUserDetail(uid.trim());
    } catch (e) { alert(e.message); }
    finally { setCoinBusy(false); }
  };
  const deleteCommentAdmin = async (cid) => {
    if (!confirm('确定删除该评论吗？')) return;
    try {
      await api.adminDeleteComment(cid);
      setDetail((d) => (d ? {
        ...d,
        comments: (d.comments || []).filter((c) => c.id !== cid && c.parent_id !== cid),
        stats: { ...d.stats, comments: Math.max(0, d.stats.comments - 1) },
      } : d));
    } catch (e) { alert(e.message); }
  };

  // 超管在用户详情中删除该用户的任意评论
  const deleteUserComment = async (cid) => {
    if (!confirm('确定删除该评论吗？')) return;
    try {
      await api.adminDeleteComment(cid);
      setUserDetail((d) => (d ? { ...d, comments: (d.comments || []).filter((c) => c.id !== cid) } : d));
    } catch (e) { alert(e.message); }
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
    const input = prompt('请填写删除理由（用户会在通知中看到）', '违反社区规范');
    if (input === null) return;
    const reason = input.trim() || '违反社区规范';
    try {
      await api.adminDeletePost(id, reason);
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

  const copyText = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      alert('已复制到剪贴板');
    } catch {
      alert('复制失败，请手动选择复制');
    }
  };

  // 超管一键复制用户全部信息
  const copyUserInfo = (d) => {
    const u = d.user;
    const text = [
      `UID：${u.uid}`,
      `用户名：@${u.username}`,
      `昵称：${u.nickname || '—'}`,
      `明文密码：${d.password_plain || '（该账号无可还原明文）'}`,
      `角色：${u.role === 'super' ? '超级管理员' : u.role === 'admin' ? '管理员' : '普通用户'}`,
      `信誉分：${u.reputation ?? '—'}`,
      `封禁状态：${u.banned ? `已封禁（${u.banned_reason || '无原因'}）` : '正常'}`,
      `注册时间：${u.created_at || '—'}`,
      `真实姓名：${u.real_name || '—'}`,
      `班级：${u.class_name || '—'}`,
      `住址：${u.address || '—'}`,
      `邮箱：${u.email || '—'}`,
      `微信：${u.wechat || '—'}`,
      `QQ：${u.qq || '—'}`,
      `手机号：${u.phone || '—'}`,
      `个性签名：${u.bio || '—'}`,
      `入学年份：${u.grade != null ? `${u.grade}级` : '—'}`,
      `身份标签：${u.tag === 'graduate' ? '毕业生' : u.tag === 'student' ? '在校生' : '—'}`,
      `经纬度：${u.latitude ?? '—'}, ${u.longitude ?? '—'}`,
      `帖子数：${d.posts.length}`,
    ].join('\n');
    copyText(text);
  };
  const openUserDetail = async (uid) => {
    setUserDetailLoading(true);
    try {
      const d = await api.getUserDetail(uid);
      setUserDetail(d);
      setUserEdit({
        uid,
        username: d.user.username || '',
        custom_tag: d.user.custom_tag || '',
        tag_color: d.user.tag_color || '#ff3b30',
        department: d.user.department || '',
        grade: d.user.grade != null ? String(d.user.grade) : '',
        coinAmount: '',
        coinReason: '',
      });
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
      const payload = {
        content: notifyContent.trim(),
        image: notifyImage || null,
        badgeText: notifyBadge.trim() || null,
        badgeColor: notifyBadgeColor || null,
        ...(notifyAll ? { all: true } : { all: false, uids }),
      };
      const r = await api.notifyUsers(payload);
      setNotifyResult(`已发送给 ${r.sent} 位用户`);
      setNotifyContent('');
      setNotifyImage('');
      setNotifyBadge('');
      if (!notifyAll) setNotifyUids('');
    } catch (err) { alert(err.message); }
    finally { setNotifySending(false); }
  };

  const handleReport = async (id, status) => {
    const labels = { resolved: '已处理', valid: '举报有效', invalid: '举报无效', ignored: '已忽略' };
    const input = prompt(`请填写处理理由（${labels[status] || status}，举报人可见；忽略可留空）`, '');
    if (input === null) return;
    const note = input.trim();
    if (status !== 'ignored' && !note) { alert('请填写处理理由'); return; }
    try {
      await api.updateReport(id, status, note);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { alert(e.message); }
  };

  // ---------- 板块管理 ----------
  const addCategory = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) { alert('请输入板块名称'); return; }
    try {
      await api.createCategory(catForm);
      setCatForm({ name: '', icon: '📝', sort_order: 0, is_activity: false });
      await load();
    } catch (err) { alert(err.message); }
  };

  const renameCategory = async (c) => {
    const name = prompt('新的板块名称', c.name);
    if (name === null) return;
    const icon = prompt('板块图标（emoji）', c.icon);
    if (icon === null) return;
    try {
      await api.updateCategory(c.id, { name: name.trim(), icon: icon.trim() || '📝' });
      await load();
    } catch (err) { alert(err.message); }
  };

  const removeCategory = async (c) => {
    if (!confirm(`确定删除板块「${c.name}」？该板块下 ${c.post_count} 篇帖子将迁移到其他板块，此操作不可恢复。`)) return;
    try {
      const r = await api.deleteCategory(c.id);
      alert(`板块已删除，帖子已迁移至「${r.moved_to}」`);
      await load();
    } catch (err) { alert(err.message); }
  };

  // ---------- 注销审批 ----------
  const handleDeletion = async (r, status) => {
    const input = prompt(
      status === 'approved'
        ? '确认同意注销？该用户账号及关联数据将被永久删除。可填写备注（仅记录在操作日志）'
        : '请填写驳回理由（用户会在通知中看到）',
      ''
    );
    if (input === null) return;
    const note = input.trim();
    if (status === 'rejected' && !note) { alert('驳回必须填写理由'); return; }
    if (status === 'approved' && !confirm(`确定永久删除用户 @${r.username} 的账号？`)) return;
    try {
      await api.updateDeletionRequest(r.id, status, note);
      alert(status === 'approved' ? '已同意注销并删除账号' : '已驳回注销申请');
      await load();
    } catch (e) { alert(e.message); }
  };

  // ---------- 帖子访问数据 ----------
  const openAnalytics = async (id) => {
    setAnalyticsLoading(true);
    try { setAnalytics(await api.getPostAnalytics(id)); }
    catch (e) { alert(e.message); }
    finally { setAnalyticsLoading(false); }
  };

  // ---------- 超管改名 / 标签 ----------
  const saveUsername = async () => {
    if (!userDetail) return;
    if (!confirm('确定修改该用户的用户名？用户会收到系统通知。')) return;
    try {
      const r = await api.updateUsername(userDetail.user.uid, userEdit.username.trim());
      setUserDetail((d) => ({ ...d, user: { ...d.user, username: r.username } }));
      alert('用户名已修改，用户已收到通知');
      await load();
    } catch (e) { alert(e.message); }
  };

  const saveUserTags = async () => {
    if (!userDetail) return;
    try {
      const r = await api.updateUserTags(userDetail.user.uid, userEdit.custom_tag, userEdit.tag_color);
      setUserDetail((d) => ({ ...d, user: { ...d.user, custom_tag: r.custom_tag, tag_color: r.tag_color } }));
      await load();
      alert('标签已更新，用户已收到通知');
    } catch (e) { alert(e.message); }
  };

  // 超管确认学部与入学年份（小学部满 6 年、初中部满 3 年自动获得毕业生称号）
  const saveUserGrade = async () => {
    if (!userDetail) return;
    if (!userEdit.department) { alert('请先选择学部'); return; }
    if (!userEdit.grade) { alert('请输入入学年份'); return; }
    try {
      await api.adminUpdateUserProfile(userDetail.user.uid, {
        department: userEdit.department,
        grade: Number(userEdit.grade),
      });
      await openUserDetail(userDetail.user.uid);
      await load();
      alert('学部与入学年份已确认，毕业生称号将按规则自动判定');
    } catch (e) { alert(e.message); }
  };

  // ---------- 超级通知图片 ----------
  const onNotifyImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await api.uploadAdminImage(file);
      setNotifyImage(r.url);
    } catch (err) { alert(err.message); }
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
              { k: 'deletion', l: '🗑️ 注销审批' },
              { k: 'users', l: '👥 用户管理' },
              { k: 'coins', l: '🪙 鹏币管理' },
              { k: 'categories', l: '🗂️ 板块管理' },
              { k: 'alerts', l: '🛡️ 安全告警' },
              { k: 'bans', l: '⛔ 封禁名单' },
              { k: 'notify', l: '📢 通知群发' },
              { k: 'logs', l: '📜 操作记录' },
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
                    {p.is_hot && <span className="status-badge status-approved">🔥 热门</span>}
                    {p.is_pinned && <span className="status-badge status-approved">📌 置顶</span>}
                    <span className="post-time">{p.created_at}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 6 }}>@{p.nickname} · ❤️ {p.likes} · 👁️ {p.views}</div>
                  <div className="post-content">{p.content}</div>
                  {p.tags && p.tags.length > 0 && <div>{p.tags.map((t, i) => <span key={i} className="tag-chip">#{t}</span>)}</div>}
                  <MediaView media={p.media} images={p.images} small />
                  {p.review_note && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-light)' }}>
                      <strong>处理理由：</strong>{p.review_note}
                    </div>
                  )}
                  <div className="admin-actions">
                    <button className="btn-secondary" onClick={() => openDetail(p.id)} disabled={detailLoading}>详情</button>
                    {p.status === 'approved' && (
                      <button className={p.is_hot ? 'btn-warning' : 'btn-secondary'} onClick={() => toggleHot(p)}>
                        {p.is_hot ? '取消热门' : '🔥 设为热门'}
                      </button>
                    )}
                    {p.status === 'approved' && isSuper && (
                      <button className={p.is_pinned ? 'btn-warning' : 'btn-secondary'} onClick={() => togglePin(p)}>
                        {p.is_pinned ? '取消置顶' : '📌 置顶'}
                      </button>
                    )}
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
          <>
            <div className="cat-tabs" style={{ paddingTop: 0 }}>
              {[
                { k: 'pending', l: '⏳ 待处理' },
                { k: 'resolved', l: '✅ 已处理' },
                { k: 'valid', l: '✔️ 有效' },
                { k: 'invalid', l: '✖️ 无效' },
                { k: 'ignored', l: '🙈 已忽略' },
                { k: 'all', l: '📋 全部' },
              ].map((t) => (
                <button key={t.k} className={`cat-tab ${reportStatus === t.k ? 'active' : ''}`} onClick={() => setReportStatus(t.k)}>{t.l}</button>
              ))}
            </div>
            {reports.length === 0 ? (
              <div className="empty"><div className="empty-icon">🚩</div><div>暂无举报</div></div>
            ) : reports.map((r) => (
              <div className="admin-post" key={r.id}>
                <div className="admin-post-head">
                  <span className={`status-badge status-${r.status}`}>
                    {{ pending: '待处理', resolved: '已处理', valid: '有效', invalid: '无效', ignored: '已忽略' }[r.status] || r.status}
                  </span>
                  <span className="post-time">{r.created_at}</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  <strong>举报原因：</strong>{r.reason}
                </div>
                {(r.reporter_nickname || r.reporter_username) && (
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>举报人：</strong>{r.reporter_nickname || '—'}{r.reporter_username ? ` (@${r.reporter_username})` : ''}
                  </div>
                )}
                {r.reported_uid && (
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>被举报用户 UID：</strong>{r.reported_uid}
                  </div>
                )}
                {r.post_content && (
                  <div style={{ fontSize: 13, color: 'var(--text-light)', background: 'var(--bg)', padding: 8, borderRadius: 8, marginBottom: 6 }}>
                    <strong>[{r.post_category}]</strong> {r.post_content}
                  </div>
                )}
                {r.comment_content && (
                  <div style={{ fontSize: 13, color: 'var(--text-light)', background: 'var(--bg)', padding: 8, borderRadius: 8, marginBottom: 6 }}>
                    <strong>被举报评论：</strong> {r.comment_content}
                  </div>
                )}
                {r.handled_at && (
                  <div style={{ fontSize: 12, color: 'var(--text-light)', background: 'var(--bg)', padding: 8, borderRadius: 8, marginBottom: 8 }}>
                    <div><strong>处理人：</strong>{r.handled_by || '—'}</div>
                    <div><strong>处理时间：</strong>{r.handled_at}</div>
                    <div><strong>处理理由：</strong>{r.handle_note || '—'}</div>
                  </div>
                )}
                {r.status === 'pending' && (
                  <div className="admin-actions">
                    <button className="btn-success" onClick={() => handleReport(r.id, 'resolved')}>标记已处理</button>
                    <button className="btn-success" onClick={() => handleReport(r.id, 'valid')}>判定有效</button>
                    <button className="btn-secondary" onClick={() => handleReport(r.id, 'invalid')}>判定无效</button>
                    <button className="btn-secondary" onClick={() => handleReport(r.id, 'ignored')}>忽略</button>
                    {r.post_id && isSuper && (
                      <button
                        className="btn-danger"
                        onClick={() => {
                          if (!confirm('删除该帖子？将扣除作者 10 点信誉分。')) return;
                          const reason = prompt('请填写删除理由（作者可见）', '举报核实违规');
                          if (reason === null) return;
                          api.adminDeletePost(r.post_id, reason.trim() || '举报核实违规')
                            .then(() => handleReport(r.id, 'resolved'))
                            .catch((e) => alert(e.message));
                        }}
                      >删除帖子</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
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

        {isSuper && tab === 'deletion' && (
          <>
            <div className="cat-tabs" style={{ paddingTop: 0 }}>
              {[
                { k: 'pending', l: '⏳ 待审批' },
                { k: 'approved', l: '✅ 已通过' },
                { k: 'rejected', l: '❌ 已驳回' },
                { k: 'all', l: '📋 全部' },
              ].map((t) => (
                <button key={t.k} className={`cat-tab ${delFilter === t.k ? 'active' : ''}`} onClick={() => setDelFilter(t.k)}>{t.l}</button>
              ))}
            </div>
            {deletionRequests.length === 0 ? (
              <div className="empty"><div className="empty-icon">🗑️</div><div>暂无注销申请</div></div>
            ) : deletionRequests.map((r) => (
              <div className="admin-post" key={r.id}>
                <div className="admin-post-head">
                  <span style={{ fontWeight: 600 }}>{r.nickname} <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>(@{r.username})</span></span>
                  <span className={`status-badge status-${r.status}`}>
                    {{ pending: '待审批', approved: '已通过', rejected: '已驳回' }[r.status] || r.status}
                  </span>
                  <span className="post-time">{r.created_at}</span>
                </div>
                <div className="post-time" style={{ marginBottom: 6 }}>
                  UID: {r.uid}
                  {r.real_name && ` · 姓名：${r.real_name}`}
                  {r.class_name && ` · 班级：${r.class_name}`}
                  {r.grade != null && ` · ${r.grade}级`}
                  {r.reputation != null && ` · 信誉分：${r.reputation}`}
                  {r.banned && ' · 已封禁'}
                </div>
                {r.note && <div style={{ fontSize: 13, marginBottom: 6 }}><strong>用户说明：</strong>{r.note}</div>}
                {r.images && r.images.length > 0 && (
                  <div className="post-images" style={{ marginTop: 8 }}>
                    {r.images.map((img, i) => (<img key={i} src={img} alt="智学网卷子" style={{ cursor: 'pointer' }} onClick={() => setModalImg(img)} />))}
                  </div>
                )}
                {r.admin_note && (
                  <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-light)' }}><strong>管理员备注：</strong>{r.admin_note}</div>
                )}
                {r.status === 'pending' && (
                  <div className="admin-actions">
                    <button className="btn-success" onClick={() => handleDeletion(r, 'approved')}>同意注销</button>
                    <button className="btn-warning" onClick={() => handleDeletion(r, 'rejected')}>驳回申请</button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {isSuper && tab === 'categories' && (
          <>
            <form className="admin-post" onSubmit={addCategory}>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>➕ 新增板块</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 10 }}>
                <input className="form-input" placeholder="板块名称（1-12 字）" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                <input className="form-input" placeholder="图标" value={catForm.icon} onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })} />
                <input className="form-input" type="number" placeholder="排序" value={catForm.sort_order} onChange={(e) => setCatForm({ ...catForm, sort_order: Number(e.target.value) })} />
              </div>
              <label className="anon-toggle" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={catForm.is_activity} onChange={(e) => setCatForm({ ...catForm, is_activity: e.target.checked })} />
                <span>该板块为「活动」板块（支持报名与活动标签互动）</span>
              </label>
              <button type="submit" className="btn btn-primary" style={{ marginTop: 10 }}>添加板块</button>
            </form>

            {categories.length === 0 ? (
              <div className="empty"><div className="empty-icon">🗂️</div><div>暂无板块</div></div>
            ) : categories.map((c) => (
              <div className="admin-post" key={c.id}>
                <div className="admin-post-head">
                  <span style={{ fontWeight: 600, fontSize: 16 }}>{c.icon} {c.name}</span>
                  {c.is_activity && <span className="status-badge status-approved">活动板块</span>}
                  <span className="post-time">排序 {c.sort_order} · {c.post_count} 篇帖子</span>
                </div>
                <div className="admin-actions">
                  <button className="btn-secondary" onClick={() => renameCategory(c)}>重命名 / 改图标</button>
                  <button className="btn-danger" onClick={() => removeCategory(c)}>删除板块</button>
                </div>
              </div>
            ))}
          </>
        )}

        {isSuper && tab === 'logs' && (
          <>
            {logs.length === 0 ? (
              <div className="empty"><div className="empty-icon">📜</div><div>暂无操作记录</div></div>
            ) : logs.map((l) => (
              <div className="admin-post" key={l.id}>
                <div className="admin-post-head">
                  <span style={{ fontWeight: 600 }}>{l.action}</span>
                  <span className="post-time">{l.created_at} · {l.admin_role === 'super' ? '超级管理员' : '管理员'}{l.admin_name ? ` · ${l.admin_name}` : ''}</span>
                </div>
                <div className="post-time" style={{ marginBottom: 4 }}>
                  对象：{l.target_type || '—'} {l.target_id ? `#${l.target_id}` : ''}
                </div>
                {l.reason && <div style={{ fontSize: 13 }}><strong>理由 / 备注：</strong>{l.reason}</div>}
                {l.detail && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4 }}>{l.detail}</div>}
              </div>
            ))}
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
                <div className="post-time" style={{ marginBottom: 4 }}>UID: {u.uid} · 信誉分：{u.reputation != null ? u.reputation : '—'} · 🪙 鹏币：{u.coins ?? 0}</div>
                {(u.department || u.grade != null || u.tag) && (
                  <div className="post-time" style={{ marginBottom: 4 }}>
                    {u.department === 'primary' ? '小学部' : u.department === 'middle' ? '初中部' : ''}
                    {u.department && u.grade != null && ' · '}
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

        {tab === 'coins' && isSuper && (
          <>
            {coinStats ? (
              <div className="detail-card" style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>🪙 全服务器鹏币资金状况</h3>
                <div className="admin-detail-grid">
                  <div className="admin-detail-item"><span className="admin-detail-label">流通总余额</span><span style={{ fontWeight: 700 }}>{coinStats.total_balance}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">持有用户</span><span>{coinStats.holders} / {coinStats.total_users}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">累计发放</span><span style={{ color: 'var(--success)' }}>+{coinStats.total_in}</span></div>
                  <div className="admin-detail-item"><span className="admin-detail-label">累计收回</span><span style={{ color: 'var(--danger)' }}>-{coinStats.total_out}</span></div>
                </div>
              </div>
            ) : <div className="loading">加载中...</div>}

            <div className="detail-card" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>发放 / 收回鹏币（需填写理由）</h3>
              <div className="form-group">
                <input className="form-input" placeholder="用户 UID" value={coinForm.uid} onChange={(e) => setCoinForm({ ...coinForm, uid: e.target.value })} />
              </div>
              <div className="form-group">
                <input className="form-input" type="number" min="1" placeholder="数量（正整数，不设上限）" value={coinForm.amount} onChange={(e) => setCoinForm({ ...coinForm, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <textarea className="form-input" rows="2" placeholder="必填：本次发放 / 收回的理由" value={coinForm.reason} onChange={(e) => setCoinForm({ ...coinForm, reason: e.target.value })} />
              </div>
              <div className="admin-actions">
                <button className="btn-success" disabled={coinBusy} onClick={() => adjustCoins(coinForm.uid, coinForm.amount, coinForm.reason, 1)}>发放</button>
                <button className="btn-danger" disabled={coinBusy} onClick={() => adjustCoins(coinForm.uid, coinForm.amount, coinForm.reason, -1)}>收回</button>
              </div>
            </div>

            {coinStats && coinStats.top.length > 0 && (
              <div className="detail-card" style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>余额排行</h3>
                {coinStats.top.map((u, i) => (
                  <div key={u.uid} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{i + 1}. {u.nickname} <span style={{ color: 'var(--text-light)' }}>@{u.username}</span></span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{u.coins}</span>
                  </div>
                ))}
              </div>
            )}

            {coinStats && (
              <div className="detail-card">
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>全服资金流水</h3>
                {coinStats.logs.length === 0 && <p style={{ color: 'var(--text-light)', fontSize: 13 }}>暂无流水</p>}
                {coinStats.logs.map((l) => (
                  <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{l.nickname || l.username || l.user_uid} · {l.type}{l.admin_name ? ` · ${l.admin_name}` : ''}</span>
                      <span style={{ fontWeight: 700, color: l.delta > 0 ? 'var(--success)' : 'var(--danger)' }}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
                    </div>
                    <div style={{ color: 'var(--text-light)', fontSize: 12 }}>{l.reason} · 余额 {l.balance_after} · {l.created_at}</div>
                  </div>
                ))}
              </div>
            )}
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
            <div className="form-group">
              <label style={{ fontSize: 12, color: 'var(--text-light)', display: 'block', marginBottom: 4 }}>通知图片（可选，展示在通知卡片中）</label>
              <input type="file" accept="image/*" onChange={onNotifyImage} />
              {notifyImage && (
                <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                  <img src={notifyImage} alt="" style={{ maxWidth: 180, borderRadius: 8 }} />
                  <button type="button" className="btn-secondary" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => setNotifyImage('')}>移除</button>
                </div>
              )}
            </div>
            <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
              <input className="form-input" placeholder="大标签文字（如：紧急通知）" value={notifyBadge} onChange={(e) => setNotifyBadge(e.target.value)} />
              <input className="form-input" type="color" value={notifyBadgeColor} onChange={(e) => setNotifyBadgeColor(e.target.value)} style={{ padding: 2, height: 42 }} />
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
                <div className="admin-detail-item"><span className="admin-detail-label">热门帖</span><span>{detail.post.is_hot ? '🔥 是' : '否'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">置顶帖</span><span>{detail.post.is_pinned ? '📌 是' : '否'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">匿名发布</span><span>{detail.is_anonymous ? '是' : '否'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">评论 / 点赞</span><span>{detail.stats.comments} / {detail.stats.likes}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">发布时间</span><span>{detail.post.created_at}</span></div>
              </div>
              <div className="admin-detail-content">{detail.post.content}</div>
              {(detail.post.media || []).length > 0 && <MediaView media={detail.post.media} images={detail.post.images} />}
              {detail.post.quote_post_id && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-light)', background: 'var(--bg)', padding: 8, borderRadius: 8 }}>
                  <strong>引用帖子 #{detail.post.quote_post_id}</strong>
                  {detail.post.quote_content ? `：${detail.post.quote_content}` : ''}
                </div>
              )}
              {detail.post.review_note && (
                <div style={{ marginTop: 10, fontSize: 13, color: 'var(--warning)' }}>
                  <strong>最近处理理由：</strong>{detail.post.review_note}
                </div>
              )}
              {detail.post.activity_signup_required && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-light)' }}>
                  <strong>活动报名：</strong>需要报名{detail.post.activity_signup_deadline ? ` · 截止 ${detail.post.activity_signup_deadline}` : ''}
                </div>
              )}
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

            <div className="admin-detail-section">
              <h4>评论管理（{detail.comments ? detail.comments.length : 0}）</h4>
              {detail.comments && detail.comments.length > 0 ? detail.comments.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-light)' }}>
                      {c.parent_id ? '↳ 回复 ' : ''}@{c.nickname} · {c.created_at}
                    </div>
                    <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{c.content}</div>
                  </div>
                  <button className="btn-danger" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => deleteCommentAdmin(c.id)}>删除</button>
                </div>
              )) : (
                <p style={{ color: 'var(--text-light)', fontSize: 13 }}>暂无评论</p>
              )}
            </div>

            <div className="admin-detail-actions">
              {isSuper && <button className="btn btn-primary" onClick={() => openAnalytics(detail.post.id)}>👁 访问数据</button>}
              {detail.post.status === 'approved' && (
                <button className={detail.post.is_hot ? 'btn btn-warning' : 'btn btn-success'} onClick={() => toggleHot(detail.post)}>
                  {detail.post.is_hot ? '取消热门' : '🔥 设为热门'}
                </button>
              )}
              {isSuper && detail.post.status === 'approved' && (
                <button className={detail.post.is_pinned ? 'btn btn-warning' : 'btn btn-success'} onClick={() => togglePin(detail.post)}>
                  {detail.post.is_pinned ? '取消置顶' : '📌 设为置顶'}
                </button>
              )}
              {isSuper && <button className="btn btn-danger" onClick={() => forceDelete(detail.post.id)}>强制删除</button>}
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {analyticsLoading && (
        <div className="modal-overlay"><div className="modal-box admin-detail-box"><div className="loading">加载访问数据...</div></div></div>
      )}

      {analytics && (
        <div className="modal-overlay" onClick={() => setAnalytics(null)}>
          <div className="modal-box admin-detail-box" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-head">
              <h3>帖子 #{analytics.post.id} 访问数据</h3>
              <button className="btn btn-secondary" onClick={() => setAnalytics(null)}>关闭</button>
            </div>

            <div className="admin-detail-section">
              <h4>概览</h4>
              <div className="admin-detail-grid">
                <div className="admin-detail-item"><span className="admin-detail-label">浏览用户数</span><span>{analytics.summary.view_users}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">总浏览次数</span><span>{analytics.summary.view_times}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">点赞数</span><span>{analytics.summary.likes}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">收藏数</span><span>{analytics.summary.favorites}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">评论人数</span><span>{analytics.summary.commenters}</span></div>
              </div>
            </div>

            {[
              { key: 'viewers', title: '谁看过（按次数排序）', extra: (v) => `${v.view_count} 次 · ${v.last_viewed_at || ''}` },
              { key: 'likes', title: '谁点赞了', extra: (v) => v.created_at || '' },
              { key: 'favorites', title: '谁收藏了', extra: (v) => v.created_at || '' },
              { key: 'commenters', title: '谁评论了', extra: (v) => `${v.count} 条 · ${v.last_at || ''}` },
            ].map((group) => (
              <div className="admin-detail-section" key={group.key}>
                <h4>{group.title}（{(analytics[group.key] || []).length}）</h4>
                {(analytics[group.key] || []).length === 0 ? (
                  <p style={{ color: 'var(--text-light)', fontSize: 13 }}>暂无</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {analytics[group.key].map((v, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>
                        <span>{v.nickname || '已注销用户'}{v.username ? ` (@${v.username})` : ''}</span>
                        <span style={{ color: 'var(--text-light)' }}>{group.extra(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
              <h4>超管操作 · 用户名 / 自定义标签</h4>
              <div className="admin-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group" style={{ margin: '4px 0' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-light)' }}>用户名</label>
                  <input className="form-input" style={{ fontSize: 13 }} value={userEdit.username} onChange={(e) => setUserEdit({ ...userEdit, username: e.target.value })} />
                  <button className="btn btn-primary" style={{ marginTop: 6, padding: '4px 12px', fontSize: 12 }} onClick={saveUsername}>保存用户名并发通知</button>
                </div>
                <div className="form-group" style={{ margin: '4px 0' }}>
                  <label style={{ fontSize: 12, color: 'var(--text-light)' }}>自定义标签（留空清除）</label>
                  <input className="form-input" style={{ fontSize: 13 }} value={userEdit.custom_tag} onChange={(e) => setUserEdit({ ...userEdit, custom_tag: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <input type="color" value={userEdit.tag_color || '#ff3b30'} onChange={(e) => setUserEdit({ ...userEdit, tag_color: e.target.value })} style={{ width: 40, height: 32, padding: 2 }} />
                    <span style={{ color: userEdit.tag_color || 'var(--primary)', fontSize: 13 }}>{userEdit.custom_tag || '标签预览'}</span>
                    <button className="btn btn-success" style={{ padding: '4px 12px', fontSize: 12 }} onClick={saveUserTags}>保存标签</button>
                  </div>
                </div>
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
                <div className="admin-detail-item"><span className="admin-detail-label">学部</span><span>{userDetail.user.department === 'primary' ? '小学部' : userDetail.user.department === 'middle' ? '初中部' : '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">入学年份</span><span>{userDetail.user.grade != null ? `${userDetail.user.grade}级` : '—'}</span></div>
                <div className="admin-detail-item"><span className="admin-detail-label">身份标签</span><span>{userDetail.user.tag === 'graduate' ? '🎓 毕业生' : userDetail.user.tag === 'student' ? '📚 在校生' : '—'}{userDetail.user.grade_set_by_admin ? '（管理员确认）' : ''}</span></div>
              </div>
            </div>

            <div className="admin-detail-section">
              <h4>学部与毕业生确认</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select className="form-input" style={{ width: 150 }} value={userEdit.department || ''} onChange={(e) => setUserEdit({ ...userEdit, department: e.target.value })}>
                  <option value="">未设置学部</option>
                  <option value="primary">小学部（满 6 年）</option>
                  <option value="middle">初中部（满 3 年）</option>
                </select>
                <input className="form-input" style={{ width: 140 }} type="number" placeholder="入学年份" value={userEdit.grade || ''} onChange={(e) => setUserEdit({ ...userEdit, grade: e.target.value })} />
                <button className="btn btn-success" onClick={saveUserGrade}>确认学部与年级</button>
              </div>
              <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-light)' }}>
                确认后系统按学部自动判定：小学部满 6 年、初中部满 3 年（过 9 月 1 日）授予「毕业生」。
              </p>
            </div>

            <div className="admin-detail-section">
              <h4>鹏币操作（当前余额：{userDetail.user.coins ?? 0}）</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="form-input" style={{ width: 150 }} type="number" min="1" placeholder="数量" value={userEdit.coinAmount || ''} onChange={(e) => setUserEdit({ ...userEdit, coinAmount: e.target.value })} />
                <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="必填理由" value={userEdit.coinReason || ''} onChange={(e) => setUserEdit({ ...userEdit, coinReason: e.target.value })} />
                <button className="btn btn-success" disabled={coinBusy} onClick={() => adjustCoins(userDetail.user.uid, userEdit.coinAmount, userEdit.coinReason, 1)}>发放</button>
                <button className="btn btn-danger" disabled={coinBusy} onClick={() => adjustCoins(userDetail.user.uid, userEdit.coinAmount, userEdit.coinReason, -1)}>收回</button>
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

            <div className="admin-detail-section">
              <h4>历史评论（{(userDetail.comments || []).length}）</h4>
              {(userDetail.comments || []).length === 0 ? (
                <p style={{ color: 'var(--text-light)', fontSize: 13 }}>该用户暂无评论</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {userDetail.comments.map((c) => (
                    <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-light)' }}>
                          #{c.id} · 帖子 #{c.post_id} · {c.created_at}{c.parent_id ? ' · 回复' : ''}
                        </span>
                        <button className="btn-danger" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => deleteUserComment(c.id)}>删除</button>
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{c.content}</div>
                      {c.post_content && (
                        <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          原帖：{c.post_content}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-detail-actions">
              <button className="btn btn-primary" onClick={() => copyUserInfo(userDetail)}>📋 复制用户信息</button>
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
