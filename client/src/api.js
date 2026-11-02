const BASE = import.meta.env.VITE_API_BASE || '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // GET 请求加时间戳戳绕开任何缓存；所有请求统一 no-store
  const method = (options.method || 'GET').toUpperCase();
  let finalUrl = url;
  if (method === 'GET') {
    const sep = url.includes('?') ? '&' : '?';
    finalUrl = `${url}${sep}_t=${Date.now()}`;
  }
  const res = await fetch(BASE + finalUrl, { headers, cache: 'no-store', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export const api = {
  // Auth
  register: (username, password, nickname, geo) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username, password, nickname,
        agreement: true,
        latitude: geo ? geo.latitude : null,
        longitude: geo ? geo.longitude : null,
      }),
    }),
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
  deleteAccount: () => request('/auth/account', { method: 'DELETE' }),
  requestAccountDeletion: (files, note = '') => {
    const fd = new FormData();
    fd.append('note', note);
    for (const f of files) fd.append('images', f);
    return fetch(BASE + '/auth/account/request', {
      method: 'POST',
      body: fd,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '提交失败'); return d; });
  },
  getMyDeletionRequests: () => request('/auth/account/request'),
  updateProfile: (data) =>
    request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getUser: (id) => request(`/users/${id}`),
  searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
  followUser: (id) => request(`/users/${id}/follow`, { method: 'POST' }),

  // Categories（板块由超级管理员动态管理）
  getCategories: () => request('/categories'),

  // Posts
  getPosts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/posts?${q}`);
  },
  getHotPosts: () => request('/posts/hot'),
  getPost: (id) => request(`/posts/${id}`),
  getMyPosts: () => request('/my/posts'),
  createPost: (formData) =>
    fetch(BASE + '/posts', {
      method: 'POST',
      body: formData,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '发布失败');
      return d;
    }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  likePost: (id) => request(`/posts/${id}/like`, { method: 'POST' }),
  favoritePost: (id) => request(`/posts/${id}/favorite`, { method: 'POST' }),
  getFavorites: () => request('/favorites'),
  signupActivity: (id) => request(`/posts/${id}/signup`, { method: 'POST' }),
  cancelSignupActivity: (id) => request(`/posts/${id}/signup`, { method: 'DELETE' }),

  // Comments
  addComment: (id, content, parentId, media = []) =>
    request(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content, parentId, media }) }),
  likeComment: (id) => request(`/comments/${id}/like`, { method: 'POST' }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
  adminDeleteComment: (id) =>
    request(`/comments/${id}`, { method: 'DELETE', headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),

  // Reports
  report: (postId, commentId, reason) =>
    request('/reports', { method: 'POST', body: JSON.stringify({ postId, commentId, reason }) }),
  reportUser: (reportedUid, reason) =>
    request('/reports', { method: 'POST', body: JSON.stringify({ reportedUid, reason }) }),

  // Blocks
  getBlocks: () => request('/blocks'),
  blockUser: (uid) => request(`/blocks/${uid}`, { method: 'POST' }),

  // Notifications
  getNotifications: () => request('/notifications'),
  getUnreadCount: () => request('/notifications/unread'),
  markAllRead: () => request('/notifications/read', { method: 'POST' }),

  // Friends
  getFriends: () => request('/friends'),
  getFriendRequests: () => request('/friends/requests'),
  requestFriend: (uid) => request(`/friends/request/${uid}`, { method: 'POST' }),
  acceptFriend: (uid) => request(`/friends/accept/${uid}`, { method: 'POST' }),
  removeFriend: (uid) => request(`/friends/${uid}`, { method: 'DELETE' }),

  // Messages
  getConversations: () => request('/messages/conversations'),
  getConversation: (uid) => request(`/messages/${uid}`),
  sendMessage: (to, content, media = [], share = null) =>
    request('/messages', {
      method: 'POST',
      body: JSON.stringify({
        to, content, media,
        shareType: share ? share.type : null,
        shareId: share ? share.id : null,
      }),
    }),
  markMessageRead: (uid) => request(`/messages/read/${uid}`, { method: 'POST' }),

  // Upload（图片 / 视频 / 语音 / GIF）
  uploadMedia: (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return fetch(BASE + '/upload/media', {
      method: 'POST',
      body: fd,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '上传失败'); return d; });
  },
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return fetch(BASE + '/upload/avatar', {
      method: 'POST',
      body: fd,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; });
  },

  // Stickers（自定义 GIF 表情包）
  getStickers: () => request('/stickers'),
  addSticker: (url, name = '') =>
    request('/stickers', { method: 'POST', body: JSON.stringify({ url, name }) }),
  deleteSticker: (id) => request(`/stickers/${id}`, { method: 'DELETE' }),

  // Coins（金币）
  getCoins: () => request('/coins'),
  transferCoins: (to, amount, note = '') =>
    request('/coins/transfer', { method: 'POST', body: JSON.stringify({ to, amount, note }) }),

  // Groups（群聊）
  getGroups: () => request('/groups'),
  createGroup: (name, memberUids = []) =>
    request('/groups', { method: 'POST', body: JSON.stringify({ name, memberUids }) }),
  getGroup: (id) => request(`/groups/${id}`),
  joinGroup: (id) => request(`/groups/${id}/join`, { method: 'POST' }),
  leaveGroup: (id) => request(`/groups/${id}/leave`, { method: 'POST' }),
  getGroupMessages: (id) => request(`/groups/${id}/messages`),
  sendGroupMessage: (id, content, media = [], share = null) =>
    request(`/groups/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content, media,
        shareType: share ? share.type : null,
        shareId: share ? share.id : null,
      }),
    }),
  markGroupRead: (id) => request(`/groups/${id}/read`, { method: 'POST' }),
  createRedPacket: (groupId, total, count, note = '') =>
    request(`/groups/${groupId}/redpacket`, { method: 'POST', body: JSON.stringify({ total, count, note }) }),
  claimRedPacket: (id) => request(`/redpackets/${id}/claim`, { method: 'POST' }),
  getRedPackets: (groupId) => request(`/groups/${groupId}/redpackets`),
  getVersion: () => request('/version'),

  // Applications
  submitApplication: (content, images) => {
    const fd = new FormData();
    fd.append('content', content);
    for (const f of images) fd.append('images', f);
    return fetch(BASE + '/applications', {
      method: 'POST',
      body: fd,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; });
  },
  getMyApplications: () => request('/applications'),
  getAdminApplications: (status = 'all') =>
    request(`/admin/applications?status=${status}`, { headers: adminHeaders() }),
  updateApplication: (id, data) =>
    request(`/admin/applications/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: adminHeaders() }),
  adminUpdateUserProfile: (uid, data) =>
    request(`/admin/users/${uid}/profile`, { method: 'PUT', body: JSON.stringify(data), headers: adminHeaders() }),

  // Admin
  adminLogin: (password) => {
    localStorage.setItem('admin_token', password);
    return true;
  },
  isAdmin: () => !!localStorage.getItem('admin_token'),
  adminLogout: () => {
    localStorage.removeItem('admin_token');
    sessionStorage.removeItem('admin_role');
  },
  adminWhoami: () => request('/admin/whoami', { headers: adminHeaders() }),
  getAdminPosts: (status = 'all', page = 1, pageSize = 50) =>
    request(`/admin/posts?status=${status}&page=${page}&pageSize=${pageSize}`, { headers: adminHeaders() }),
  getPostAdmin: (id) => request(`/admin/posts/${id}`, { headers: adminHeaders() }),
  updatePostStatus: (id, status, note = '') =>
    request(`/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify({ status, note }), headers: adminHeaders() }),
  setPostHot: (id, isHot) =>
    request(`/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify({ is_hot: isHot }), headers: adminHeaders() }),
  adminDeletePost: (id, reason = '') =>
    fetch(BASE + `/admin/posts/${id}`, {
      method: 'DELETE',
      headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '删除失败'); return d; }),
  getAdminStats: () => request('/admin/stats', { headers: adminHeaders() }),
  getReports: (status = 'pending') =>
    request(`/admin/reports?status=${status}`, { headers: adminHeaders() }),
  updateReport: (id, status, note = '') =>
    request(`/admin/reports/${id}`, { method: 'PUT', body: JSON.stringify({ status, note }), headers: adminHeaders() }),
  getUsers: () => request('/admin/users', { headers: adminHeaders() }),
  getUserDetail: (uid) => request(`/admin/users/${uid}/detail`, { headers: adminHeaders() }),
  restoreReputation: (uid, reputation = 100) =>
    request(`/admin/users/${uid}/reputation`, { method: 'POST', body: JSON.stringify({ reputation }), headers: adminHeaders() }),
  updateUserRole: (id, role) =>
    request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role }), headers: adminHeaders() }),
  deleteUser: (id) =>
    request(`/admin/users/${id}`, { method: 'DELETE', headers: adminHeaders() }),
  adminBans: () => request('/admin/bans', { headers: adminHeaders() }),
  adminBanUser: (uid, reason) =>
    request(`/admin/users/${uid}/ban`, { method: 'POST', body: JSON.stringify({ reason }), headers: adminHeaders() }),
  adminUnbanUser: (uid) =>
    request(`/admin/users/${uid}/unban`, { method: 'POST', headers: adminHeaders() }),
  adminAlerts: () => request('/admin/alerts', { headers: adminHeaders() }),
  adminReadAlerts: () => request('/admin/alerts/read', { method: 'POST', headers: adminHeaders() }),
  adminConversations: (uid) => request(`/admin/conversations/${uid}`, { headers: adminHeaders() }),
  adminMessages: (uid, peerUid) => request(`/admin/messages/${uid}/${peerUid}`, { headers: adminHeaders() }),
  notifyUsers: (payload) => request('/admin/notify', { method: 'POST', body: JSON.stringify(payload), headers: adminHeaders() }),
  uploadAdminImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(BASE + '/admin/upload', { method: 'POST', body: fd, headers: adminHeaders() })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || '上传失败'); return d; });
  },

  // 板块管理
  getAdminCategories: () => request('/admin/categories', { headers: adminHeaders() }),
  createCategory: (data) =>
    request('/admin/categories', { method: 'POST', body: JSON.stringify(data), headers: adminHeaders() }),
  updateCategory: (id, data) =>
    request(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: adminHeaders() }),
  deleteCategory: (id) =>
    request(`/admin/categories/${id}`, { method: 'DELETE', headers: adminHeaders() }),

  // 操作记录 / 注销审批 / 帖子访问数据 / 用户名 / 标签
  getAdminLogs: (limit = 200) => request(`/admin/logs?limit=${limit}`, { headers: adminHeaders() }),
  getDeletionRequests: (status = 'pending') =>
    request(`/admin/deletion-requests?status=${status}`, { headers: adminHeaders() }),
  updateDeletionRequest: (id, status, admin_note = '') =>
    request(`/admin/deletion-requests/${id}`, { method: 'PUT', body: JSON.stringify({ status, admin_note }), headers: adminHeaders() }),
  getPostAnalytics: (id) => request(`/admin/posts/${id}/analytics`, { headers: adminHeaders() }),
  updateUsername: (uid, username) =>
    request(`/admin/users/${uid}/username`, { method: 'PUT', body: JSON.stringify({ username }), headers: adminHeaders() }),
  updateUserTags: (uid, custom_tag, tag_color) =>
    request(`/admin/users/${uid}/tags`, { method: 'PUT', body: JSON.stringify({ custom_tag, tag_color }), headers: adminHeaders() }),
};

function adminHeaders() {
  return { 'x-admin-token': localStorage.getItem('admin_token') };
}

export const CATEGORIES = [
  { name: '表白墙', icon: '💕' },
  { name: '失物招领', icon: '🔍' },
  { name: '二手交易', icon: '🛒' },
  { name: '吐槽', icon: '💬' },
  { name: '问答', icon: '❓' },
  { name: '求助', icon: '🆘' },
  { name: '活动', icon: '🎉', is_activity: true },
  { name: '其他', icon: '📝' },
];

export const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','😬','🙃','😉','👍','👎','👏','🙏','💪','❤️','💔','💕','💖','✨','🔥','🎉','🎊','💯','⭐','🌟','💫','🌈','☀️','🌙','💧','🍀','🎁','📱','💻','📚','✏️','🎓','🏫','🍜','🍔','🍕','☕','🍺','🎮','🎵','🎬','📷','🏠','🚗','✈️','🏠'];
