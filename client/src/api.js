const BASE = import.meta.env.VITE_API_BASE || '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + url, { headers, ...options });
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
  updateProfile: (data) =>
    request('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getUser: (id) => request(`/users/${id}`),
  searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
  followUser: (id) => request(`/users/${id}/follow`, { method: 'POST' }),

  // Posts
  getPosts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/posts?${q}`);
  },
  getHotPosts: () => request('/posts/hot'),
  getPost: (id) => request(`/posts/${id}`),
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

  // Comments
  addComment: (id, content, parentId) =>
    request(`/posts/${id}/comments`, { method: 'POST', body: JSON.stringify({ content, parentId }) }),
  likeComment: (id) => request(`/comments/${id}/like`, { method: 'POST' }),

  // Reports
  report: (postId, commentId, reason) =>
    request('/reports', { method: 'POST', body: JSON.stringify({ postId, commentId, reason }) }),

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
  sendMessage: (to, content) =>
    request('/messages', { method: 'POST', body: JSON.stringify({ to, content }) }),

  // Upload
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return fetch(BASE + '/upload/avatar', {
      method: 'POST',
      body: fd,
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; });
  },

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
    request(`/admin/applications?status=${status}`, { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  updateApplication: (id, data) =>
    request(`/admin/applications/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminUpdateUserProfile: (uid, data) =>
    request(`/admin/users/${uid}/profile`, { method: 'PUT', body: JSON.stringify(data), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),

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
  adminWhoami: () =>
    request('/admin/whoami', { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  getAdminPosts: (status = 'all', page = 1, pageSize = 50) =>
    request(`/admin/posts?status=${status}&page=${page}&pageSize=${pageSize}`, {
      headers: { 'x-admin-token': localStorage.getItem('admin_token') },
    }),
  getPostAdmin: (id) =>
    request(`/admin/posts/${id}`, { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  updatePostStatus: (id, status) =>
    request(`/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify({ status }), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  setPostHot: (id, isHot) =>
    request(`/admin/posts/${id}`, { method: 'PUT', body: JSON.stringify({ is_hot: isHot }), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminDeletePost: (id) =>
    request(`/admin/posts/${id}`, { method: 'DELETE', headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  getAdminStats: () => request('/admin/stats', { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  getReports: () => request('/admin/reports', { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  updateReport: (id, status) =>
    request(`/admin/reports/${id}`, { method: 'PUT', body: JSON.stringify({ status }), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  getUsers: () => request('/admin/users', { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  getUserDetail: (uid) =>
    request(`/admin/users/${uid}/detail`, { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  restoreReputation: (uid, reputation = 100) =>
    request(`/admin/users/${uid}/reputation`, { method: 'POST', body: JSON.stringify({ reputation }), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  updateUserRole: (id, role) =>
    request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ role }), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  deleteUser: (id) =>
    request(`/admin/users/${id}`, { method: 'DELETE', headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminBans: () => request('/admin/bans', { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminBanUser: (uid, reason) =>
    request(`/admin/users/${uid}/ban`, { method: 'POST', body: JSON.stringify({ reason }), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminUnbanUser: (uid) =>
    request(`/admin/users/${uid}/unban`, { method: 'POST', headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminAlerts: () => request('/admin/alerts', { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminReadAlerts: () =>
    request('/admin/alerts/read', { method: 'POST', headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminConversations: (uid) =>
    request(`/admin/conversations/${uid}`, { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  adminMessages: (uid, peerUid) =>
    request(`/admin/messages/${uid}/${peerUid}`, { headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
  notifyUsers: (payload) =>
    request('/admin/notify', { method: 'POST', body: JSON.stringify(payload), headers: { 'x-admin-token': localStorage.getItem('admin_token') } }),
};

export const CATEGORIES = [
  { name: '表白墙', icon: '💕' },
  { name: '失物招领', icon: '🔍' },
  { name: '二手交易', icon: '🛒' },
  { name: '吐槽', icon: '💬' },
  { name: '问答', icon: '❓' },
  { name: '求助', icon: '🆘' },
  { name: '其他', icon: '📝' },
];

export const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','😬','🙃','😉','👍','👎','👏','🙏','💪','❤️','💔','💕','💖','✨','🔥','🎉','🎊','💯','⭐','🌟','💫','🌈','☀️','🌙','💧','🍀','🎁','📱','💻','📚','✏️','🎓','🏫','🍜','🍔','🍕','☕','🍺','🎮','🎵','🎬','📷','🏠','🚗','✈️','🏠'];
