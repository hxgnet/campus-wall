const express = require('express');
require('dotenv').config();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const config = require('./config');
const { containsSensitive } = require('./services/sensitiveWords');
const fileStorage = require('./services/storage');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = config.jwtSecret;
const ADMIN_PASSWORD = config.adminPassword;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 安全：全局限流，防止暴力攻击
const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: '请求过于频繁，请稍后再试' } });
app.use('/api', limiter);
// 登录/注册更严格限流
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: '尝试次数过多，请15分钟后再试' } });
app.use('/api/auth', authLimiter);

const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  },
});

// ---------- Auth middleware ----------
function auth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

function getCurrentUser(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token === ADMIN_PASSWORD) return next();
  const user = getCurrentUser(req);
  if (user && user.role === 'admin') return next();
  res.status(401).json({ error: '无管理员权限' });
}

// ---------- Helper: notify ----------
async function notify(userId, type, fromUser, postId, content) {
  if (!userId) return;
  await db.prepare(
    `INSERT INTO notifications (user_id, type, from_user, post_id, content) VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).run(userId, type, fromUser, postId, content);
}

// ---------- Auth routes ----------
app.post('/api/auth/register', async (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: '用户名需3-20位' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  const exists = await db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (exists) return res.status(400).json({ error: '用户名已被注册' });
  const hash = await bcrypt.hash(password, 10);
  const result = await db.prepare(
    `INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?) RETURNING id`
  ).run(username, hash, nickname || username);
  const token = jwt.sign({ id: result.lastInsertRowid, username, nickname: nickname || username, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: result.lastInsertRowid, username, nickname: nickname || username, role: 'user' } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const user = await db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, nickname: user.nickname, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, role: user.role } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.prepare(`SELECT id, username, nickname, avatar, bio, role, created_at FROM users WHERE id = ?`).get(req.user.id);
  res.json(user);
});

app.put('/api/auth/profile', auth, async (req, res) => {
  const { nickname, bio, avatar } = req.body;
  await db.prepare(`UPDATE users SET nickname = COALESCE(?, nickname), bio = COALESCE(?, bio), avatar = COALESCE(?, avatar) WHERE id = ?`)
    .run(nickname || null, bio || null, avatar || null, req.user.id);
  res.json({ ok: true });
});

// User profile (public)
app.get('/api/users/:id', async (req, res) => {
  const user = await db.prepare(`SELECT id, username, nickname, avatar, bio, created_at FROM users WHERE id = ?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const postCount = (await db.prepare(`SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = 'approved'`).get(req.params.id)).c;
  res.json({ ...user, postCount });
});

// Follow / unfollow
app.post('/api/users/:id/follow', auth, async (req, res) => {
  if (req.user.id == req.params.id) return res.status(400).json({ error: '不能关注自己' });
  const result = await db.prepare(`INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING id`)
    .run(req.user.id, req.params.id);
  if (result.changes > 0) return res.json({ followed: true });
  await db.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(req.user.id, req.params.id);
  res.json({ followed: false });
});

// ---------- Posts ----------
app.get('/api/posts', async (req, res) => {
  const { category, page = 1, pageSize = 20, sort = 'new', q, userId } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  let where = "WHERE p.status = 'approved'";
  const params = [];
  if (category && category !== 'all') { where += ' AND p.category = ?'; params.push(category); }
  if (userId) { where += ' AND p.user_id = ?'; params.push(userId); }
  let orderBy = 'p.id DESC';
  if (sort === 'hot') orderBy = '(p.likes + p.views * 0.1) DESC';

  let sql;
  if (q) {
    // 使用 ILIKE，保持 SQLite LIKE 的大小写不敏感语义（中文搜索不受影响）
    where += ' AND (p.content ILIKE ? OR p.tags ILIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql = `SELECT p.* FROM posts p ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  params.push(Number(pageSize), offset);

  const totalSql = `SELECT COUNT(*) as c FROM posts p ${where}`;
  const total = (await db.prepare(totalSql).get(...params.slice(0, -2))).c;

  const posts = await db.prepare(sql).all(...params);
  posts.forEach(p => { p.images = p.images ? JSON.parse(p.images) : []; p.tags = p.tags ? JSON.parse(p.tags) : []; });
  res.json({ total, posts });
});

app.get('/api/posts/hot', async (req, res) => {
  const posts = await db.prepare(
    `SELECT id, category, content, nickname, likes, views FROM posts WHERE status = 'approved' ORDER BY (likes + views * 0.1) DESC LIMIT 10`
  ).all();
  posts.forEach(p => { p.images = []; });
  res.json(posts);
});

app.get('/api/posts/:id', async (req, res) => {
  const post = await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  post.images = post.images ? JSON.parse(post.images) : [];
  post.tags = post.tags ? JSON.parse(post.tags) : [];
  await db.prepare(`UPDATE posts SET views = views + 1 WHERE id = ?`).run(req.params.id);
  post.views += 1;

  const comments = await db.prepare(
    `SELECT c.*, u.nickname as user_nickname, u.avatar FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.id ASC`
  ).all(req.params.id);

  const user = getCurrentUser(req);
  const liked = user ? !!(await db.prepare(`SELECT id FROM likes WHERE post_id = ? AND user_id = ?`).get(req.params.id, user.id)) : false;
  const favorited = user ? !!(await db.prepare(`SELECT id FROM favorites WHERE post_id = ? AND user_id = ?`).get(req.params.id, user.id)) : false;

  res.json({ post, comments, liked, favorited });
});

app.post('/api/posts', auth, upload.array('images', 9), async (req, res) => {
  const { category, content, nickname, tags } = req.body;
  if (!category || !content || !content.trim()) return res.status(400).json({ error: '分类和内容不能为空' });
  if (content.length > 3000) return res.status(400).json({ error: '内容不能超过3000字' });
  // 敏感词检测
  if (containsSensitive(content)) {
    return res.status(400).json({ error: '内容包含违规词汇，请修改后再发布' });
  }
  // 图片处理：上传到云端存储，未配置则存本地
  let images = [];
  try {
    for (const f of req.files || []) {
      images.push(await fileStorage.saveFile(f.path, `posts/${Date.now()}-${f.filename}`));
    }
  } catch (e) {
    console.error('图片上传失败:', e.message);
    return res.status(500).json({ error: '图片上传失败' });
  }
  const tagArr = tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [];
  const result = await db.prepare(
    `INSERT INTO posts (user_id, category, content, tags, nickname, images) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
  ).run(req.user.id, category, content.trim(), JSON.stringify(tagArr), (nickname || req.user.nickname).trim(), JSON.stringify(images));
  res.json({ id: result.lastInsertRowid, message: '发布成功，等待管理员审核' });
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  const post = await db.prepare(`SELECT user_id, images FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  if (post.images) {
    for (const img of JSON.parse(post.images)) {
      await fileStorage.deleteByUrl(img, uploadsDir);
    }
  }
  await db.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Likes ----------
app.post('/api/posts/:id/like', async (req, res) => {
  const user = getCurrentUser(req);
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const post = await db.prepare(`SELECT id, user_id, nickname FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  let liked = false;
  let likes = 0;
  let shouldNotify = false;
  await db.transaction(async (tx) => {
    if (user) {
      const existing = await tx.prepare(`SELECT id FROM likes WHERE post_id = ? AND user_id = ?`).get(req.params.id, user.id);
      if (existing) {
        await tx.prepare(`DELETE FROM likes WHERE post_id = ? AND user_id = ?`).run(req.params.id, user.id);
        await tx.prepare(`UPDATE posts SET likes = likes - 1 WHERE id = ?`).run(req.params.id);
      } else {
        await tx.prepare(`INSERT INTO likes (post_id, user_id, ip) VALUES (?, ?, ?) RETURNING id`).run(req.params.id, user.id, ip);
        await tx.prepare(`UPDATE posts SET likes = likes + 1 WHERE id = ?`).run(req.params.id);
        liked = true;
        shouldNotify = true;
      }
    } else {
      const existing = await tx.prepare(`SELECT id FROM likes WHERE post_id = ? AND ip = ? AND user_id IS NULL`).get(req.params.id, ip);
      if (existing) {
        await tx.prepare(`DELETE FROM likes WHERE post_id = ? AND ip = ? AND user_id IS NULL`).run(req.params.id, ip);
        await tx.prepare(`UPDATE posts SET likes = likes - 1 WHERE id = ?`).run(req.params.id);
      } else {
        await tx.prepare(`INSERT INTO likes (post_id, ip) VALUES (?, ?) RETURNING id`).run(req.params.id, ip);
        await tx.prepare(`UPDATE posts SET likes = likes + 1 WHERE id = ?`).run(req.params.id);
        liked = true;
      }
    }
    likes = (await tx.prepare(`SELECT likes FROM posts WHERE id = ?`).get(req.params.id)).likes;
  });
  if (shouldNotify) await notify(post.user_id, 'like', user.nickname, post.id, '赞了你的帖子');
  res.json({ liked, likes });
});

// ---------- Comments ----------
app.post('/api/posts/:id/comments', async (req, res) => {
  const { content, nickname, parentId } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
  if (content.length > 500) return res.status(400).json({ error: '评论不能超过500字' });
  if (containsSensitive(content)) return res.status(400).json({ error: '评论包含违规词汇，请修改后再发布' });
  const post = await db.prepare(`SELECT id, user_id, nickname FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const user = getCurrentUser(req);
  const nick = nickname || (user ? user.nickname : '匿名同学');
  const result = await db.prepare(
    `INSERT INTO comments (post_id, user_id, parent_id, content, nickname) VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).run(req.params.id, user?.id || null, parentId || null, content.trim(), nick);
  if (parentId) {
    const parent = await db.prepare(`SELECT user_id, nickname FROM comments WHERE id = ?`).get(parentId);
    if (parent) await notify(parent.user_id, 'comment_reply', nick, post.id, `回复了你的评论: ${content.slice(0, 30)}`);
  } else {
    await notify(post.user_id, 'comment', nick, post.id, `评论了你的帖子: ${content.slice(0, 30)}`);
  }
  res.json({ id: result.lastInsertRowid });
});

app.post('/api/comments/:id/like', async (req, res) => {
  const user = getCurrentUser(req);
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  let likes = 0;
  await db.transaction(async (tx) => {
    const inserted = await tx.prepare(
      `INSERT INTO comment_likes (comment_id, user_id, ip) VALUES (?, ?, ?) ON CONFLICT DO NOTHING RETURNING id`
    ).run(req.params.id, user?.id || null, ip);
    if (inserted.changes > 0) {
      await tx.prepare(`UPDATE comments SET likes = likes + 1 WHERE id = ?`).run(req.params.id);
    } else {
      await tx.prepare(`DELETE FROM comment_likes WHERE comment_id = ? AND (user_id = ? OR ip = ?)`).run(req.params.id, user?.id || null, ip);
      await tx.prepare(`UPDATE comments SET likes = likes - 1 WHERE id = ?`).run(req.params.id);
    }
    likes = (await tx.prepare(`SELECT likes FROM comments WHERE id = ?`).get(req.params.id)).likes;
  });
  res.json({ likes });
});

// ---------- Favorites ----------
app.post('/api/posts/:id/favorite', auth, async (req, res) => {
  const post = await db.prepare(`SELECT id FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  const favorited = await db.transaction(async (tx) => {
    const existing = await tx.prepare(`SELECT id FROM favorites WHERE user_id = ? AND post_id = ?`).get(req.user.id, req.params.id);
    if (existing) {
      await tx.prepare(`DELETE FROM favorites WHERE user_id = ? AND post_id = ?`).run(req.user.id, req.params.id);
      return false;
    }
    await tx.prepare(`INSERT INTO favorites (user_id, post_id) VALUES (?, ?) RETURNING id`).run(req.user.id, req.params.id);
    return true;
  });
  res.json({ favorited });
});

app.get('/api/favorites', auth, async (req, res) => {
  const posts = await db.prepare(
    `SELECT p.* FROM posts p JOIN favorites f ON f.post_id = p.id WHERE f.user_id = ? AND p.status = 'approved' ORDER BY f.id DESC`
  ).all(req.user.id);
  posts.forEach(p => { p.images = p.images ? JSON.parse(p.images) : []; });
  res.json(posts);
});

// ---------- Reports ----------
app.post('/api/reports', async (req, res) => {
  const { postId, commentId, reason } = req.body;
  if (!reason) return res.status(400).json({ error: '请填写举报原因' });
  const user = getCurrentUser(req);
  await db.prepare(`INSERT INTO reports (post_id, comment_id, user_id, reason) VALUES (?, ?, ?, ?) RETURNING id`)
    .run(postId || null, commentId || null, user?.id || null, reason);
  res.json({ ok: true, message: '举报已提交，管理员会尽快处理' });
});

// ---------- Notifications ----------
app.get('/api/notifications', auth, async (req, res) => {
  const list = await db.prepare(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`
  ).all(req.user.id);
  res.json(list);
});

app.get('/api/notifications/unread', auth, async (req, res) => {
  const count = (await db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.user.id)).c;
  res.json({ count });
});

app.post('/api/notifications/read', auth, async (req, res) => {
  await db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.id);
  res.json({ ok: true });
});

// ---------- Upload avatar ----------
app.post('/api/upload/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请上传图片' });
  let url;
  try {
    url = await fileStorage.saveFile(req.file.path, `avatars/${Date.now()}-${req.file.filename}`);
  } catch (e) {
    console.error('头像上传失败:', e.message);
    return res.status(500).json({ error: '头像上传失败' });
  }
  await db.prepare(`UPDATE users SET avatar = ? WHERE id = ?`).run(url, req.user.id);
  res.json({ url });
});

// ---------- Admin ----------
app.get('/api/admin/posts', adminAuth, async (req, res) => {
  const { status, page = 1, pageSize = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  let where = '';
  const params = [];
  if (status && status !== 'all') { where = 'WHERE status = ?'; params.push(status); }
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM posts ${where}`).get(...params)).c;
  const posts = await db.prepare(`SELECT * FROM posts ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset);
  posts.forEach(p => { p.images = p.images ? JSON.parse(p.images) : []; p.tags = p.tags ? JSON.parse(p.tags) : []; });
  res.json({ total, posts });
});

app.put('/api/admin/posts/:id', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: '无效状态' });
  await db.prepare(`UPDATE posts SET status = ? WHERE id = ?`).run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/posts/:id', adminAuth, async (req, res) => {
  const post = await db.prepare(`SELECT images FROM posts WHERE id = ?`).get(req.params.id);
  if (post?.images) {
    for (const img of JSON.parse(post.images)) {
      await fileStorage.deleteByUrl(img, uploadsDir);
    }
  }
  await db.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/stats', adminAuth, async (req, res) => {
  const totalPosts = (await db.prepare(`SELECT COUNT(*) as c FROM posts`).get()).c;
  const approvedPosts = (await db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status='approved'`).get()).c;
  const pendingPosts = (await db.prepare(`SELECT COUNT(*) as c FROM posts WHERE status='pending'`).get()).c;
  const totalUsers = (await db.prepare(`SELECT COUNT(*) as c FROM users`).get()).c;
  const totalComments = (await db.prepare(`SELECT COUNT(*) as c FROM comments`).get()).c;
  const pendingReports = (await db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status='pending'`).get()).c;
  const hotPosts = await db.prepare(`SELECT id, category, content, likes, views FROM posts WHERE status='approved' ORDER BY likes DESC LIMIT 5`).all();
  res.json({ totalPosts, approvedPosts, pendingPosts, totalUsers, totalComments, pendingReports, hotPosts });
});

app.get('/api/admin/reports', adminAuth, async (req, res) => {
  const reports = await db.prepare(`
    SELECT r.*, p.content as post_content, p.category as post_category
    FROM reports r LEFT JOIN posts p ON r.post_id = p.id
    ORDER BY r.id DESC LIMIT 100
  `).all();
  res.json(reports);
});

app.put('/api/admin/reports/:id', adminAuth, async (req, res) => {
  const { status } = req.body;
  await db.prepare(`UPDATE reports SET status = ? WHERE id = ?`).run(status, req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const users = await db.prepare(`SELECT id, username, nickname, avatar, role, created_at FROM users ORDER BY id DESC`).all();
  res.json(users);
});

app.put('/api/admin/users/:id', adminAuth, async (req, res) => {
  const { role } = req.body;
  await db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', adminAuth, async (req, res) => {
  await db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Health check ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---------- Serve frontend ----------
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// schema 初始化 / 种子数据写入完成后再开始接收请求
db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`校园墙服务已启动: http://localhost:${PORT}`);
    console.log(`管理员密码: ${ADMIN_PASSWORD}`);
    console.log(`图片存储: ${{ r2: 'Cloudflare R2', supabase: 'Supabase Storage', qiniu: '七牛云', local: '本地 uploads/（未配置云端存储）' }[fileStorage.provider]}`);
  });
}).catch((err) => {
  console.error('[server] 启动失败:', err.message);
  process.exit(1);
});
