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
const SUPER_ADMIN_PASSWORD = config.superAdminPassword;
const NOW_TEXT = `to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')`;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Serverless 环境下 body 可能以字符串/缓冲区形式直接传入，这里兜底解析
app.use((req, res, next) => {
  if (req.body && (Buffer.isBuffer(req.body) || typeof req.body === 'string')) {
    const raw = req.body.toString();
    try {
      req.body = JSON.parse(raw);
    } catch {
      req.body = {};
    }
  }
  next();
});

// 安全：全局限流，防止暴力攻击
const limiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: '请求过于频繁，请稍后再试' } });
app.use('/api', limiter);
// 登录/注册更严格限流
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: '尝试次数过多，请15分钟后再试' } });
app.use('/api/auth', authLimiter);

let uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  // Serverless 环境（如 Netlify）根目录只读，退回 /tmp
  uploadsDir = '/tmp/uploads';
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {
    console.warn('[uploads] 无法创建上传目录:', err.message);
  }
}
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
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  },
});

// ---------- Auth middleware ----------
// JWT 中的 id 为对外 uid，这里统一解析出内部 dbId，避免内部自增 ID 外泄
async function resolveUser(req) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await db.prepare(`SELECT id, uid, nickname, role, banned, banned_reason FROM users WHERE uid = ?`).get(payload.id);
    if (!row) return null;
    return { ...payload, uid: row.uid, dbId: row.id, nickname: row.nickname, role: row.role, banned: !!row.banned, banned_reason: row.banned_reason };
  } catch {
    return null;
  }
}

async function auth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ error: '登录已过期' });
  if (user.banned) {
    return res.status(403).json({ error: `账号已被封禁${user.banned_reason ? `：${user.banned_reason}` : ''}` });
  }
  req.user = user;
  next();
}

async function getCurrentUser(req) {
  return resolveUser(req);
}

async function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && token === SUPER_ADMIN_PASSWORD) { req.adminRole = 'super'; return next(); }
  if (token && token === ADMIN_PASSWORD) { req.adminRole = 'admin'; return next(); }
  const user = await getCurrentUser(req);
  if (user && user.role === 'super') { req.adminRole = 'super'; req.adminUser = user; return next(); }
  if (user && user.role === 'admin') { req.adminRole = 'admin'; req.adminUser = user; return next(); }
  res.status(401).json({ error: '无管理员权限' });
}

async function superAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token && token === SUPER_ADMIN_PASSWORD) { req.adminRole = 'super'; return next(); }
  const user = await getCurrentUser(req);
  if (user && user.role === 'super') { req.adminRole = 'super'; req.adminUser = user; return next(); }
  res.status(403).json({ error: '需要超级管理员权限' });
}

// 新用户 uid：Date.now() 十六进制补足 12 位 + 4 位随机十六进制（小写）
function genUid() {
  const ts = Date.now().toString(16).padStart(12, '0');
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return (ts + rand).slice(-16);
}

// ---------- Helper: notify ----------
async function notify(userId, type, fromUser, postId, content) {
  if (!userId) return;
  await db.prepare(
    `INSERT INTO notifications (user_id, type, from_user, post_id, content) VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).run(userId, type, fromUser, postId, content);
}

// ---------- Helper: 公开帖子字段 ----------
// 匿名帖在 SQL 层直接脱敏：user_id 置 NULL、昵称固定为「匿名同学」；
// 同时不返回 client_ip / user_agent，避免隐私信息流向公开接口。
const PUBLIC_POST_FIELDS = `
  p.id, p.category, p.content, p.tags, p.images, p.status, p.likes, p.views, p.created_at,
  p.is_anonymous, p.is_staff, p.staff_role,
  CASE WHEN p.is_anonymous THEN NULL ELSE u.uid END AS user_id,
  CASE WHEN p.is_anonymous THEN '匿名同学' ELSE p.nickname END AS nickname
`;

// ---------- Helper: 风控 ----------
async function logAlert(content) {
  try {
    await db.prepare(`INSERT INTO super_alerts (content) VALUES (?) RETURNING id`).run(content);
  } catch (e) {
    console.error('[alert] 安全告警写入失败:', e.message);
  }
}

async function buildBannedInfo(userId) {
  const u = await db.prepare(
    `SELECT username, nickname, real_name, class_name, address, email, wechat, qq, phone FROM users WHERE id = ?`
  ).get(userId);
  if (!u) return null;
  return JSON.stringify({
    username: u.username || '', nickname: u.nickname || '',
    real_name: u.real_name || '', class_name: u.class_name || '',
    address: u.address || '', email: u.email || '',
    wechat: u.wechat || '', qq: u.qq || '', phone: u.phone || '',
  });
}

// 扣信誉分；归零自动封禁并写安全告警，返回最新信誉分
async function penalizeAndMaybeBan(userId, points) {
  if (!userId) return null;
  const u = await db.prepare(`SELECT id, username, reputation, banned FROM users WHERE id = ?`).get(userId);
  if (!u) return null;
  const reputation = Math.max(0, (Number(u.reputation) || 0) - Number(points || 0));
  let banned = !!u.banned;
  if (reputation <= 0 && !banned) {
    const info = await buildBannedInfo(userId);
    await db.prepare(
      `UPDATE users SET reputation = ?, banned = TRUE, banned_reason = ?, banned_at = ${NOW_TEXT}, banned_info = ? WHERE id = ?`
    ).run(reputation, '信誉分归零', info, userId);
    banned = true;
    await logAlert(`信誉分归零自动封禁：@${u.username}`);
  } else {
    await db.prepare(`UPDATE users SET reputation = ? WHERE id = ?`).run(reputation, userId);
  }
  return { reputation, banned };
}

const normText = (v) => String(v == null ? '' : v).replace(/\s+/g, '').toLowerCase();

// 资料保存后检测是否命中已封禁用户的资料（用于识别小号）
async function findBanHit(userId) {
  const me = await db.prepare(
    `SELECT real_name, class_name, email, wechat, qq, phone FROM users WHERE id = ?`
  ).get(userId);
  if (!me) return null;
  const bannedUsers = await db.prepare(
    `SELECT id, username, banned_info, real_name, class_name, email, wechat, qq, phone
     FROM users WHERE banned = TRUE AND id <> ?`
  ).all(userId);
  const CONTACTS = ['email', 'phone', 'wechat', 'qq'];
  for (const b of bannedUsers) {
    let info = {};
    try { info = b.banned_info ? JSON.parse(b.banned_info) : {}; } catch { info = {}; }
    for (const k of CONTACTS) {
      const mine = normText(me[k]);
      if (!mine) continue;
      if (mine === normText(info[k]) || mine === normText(b[k])) return b;
    }
    const rn = normText(me.real_name);
    const cn = normText(me.class_name);
    if (rn && cn) {
      if ((rn === normText(info.real_name) && cn === normText(info.class_name)) ||
          (rn === normText(b.real_name) && cn === normText(b.class_name))) return b;
    }
  }
  return null;
}

// ---------- Auth routes ----------
app.post('/api/auth/register', async (req, res) => {
  const { username, password, nickname, agreement, latitude, longitude } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 3 || username.length > 20) return res.status(400).json({ error: '用户名需3-20位' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  if (!agreement) return res.status(400).json({ error: '请先阅读并同意《用户协议》' });
  const exists = await db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (exists) return res.status(400).json({ error: '用户名已被注册' });
  const hash = await bcrypt.hash(password, 10);
  const uid = genUid();
  // 经纬度仅服务端存储，永不通过任何接口返回
  const lat = latitude == null ? null : Number(latitude);
  const lng = longitude == null ? null : Number(longitude);
  const result = await db.prepare(
    `INSERT INTO users (username, password_hash, nickname, uid, latitude, longitude, agreed_at)
     VALUES (?, ?, ?, ?, ?, ?, ${NOW_TEXT}) RETURNING id`
  ).run(username, hash, nickname || username, uid, lat, lng);
  const token = jwt.sign({ id: uid, username, nickname: nickname || username, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { uid, username, nickname: nickname || username, role: 'user' } });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const user = await db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  if (user.banned) {
    return res.status(403).json({ error: '账号已被封禁' });
  }
  const token = jwt.sign({ id: user.uid, username: user.username, nickname: user.nickname, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { uid: user.uid, username: user.username, nickname: user.nickname, avatar: user.avatar, role: user.role } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.prepare(
    `SELECT uid, username, nickname, avatar, bio, role, created_at, profile_public,
            real_name, class_name, address, email, wechat, qq, phone,
            show_real_name, show_class_name, show_address, show_email, show_wechat, show_qq, show_phone
     FROM users WHERE id = ?`
  ).get(req.user.dbId);
  // 经纬度(latitude/longitude)永远不返回给任何用户，包括本人
  res.json(user);
});

app.put('/api/auth/profile', auth, async (req, res) => {
  const fields = ['nickname', 'bio', 'avatar', 'real_name', 'class_name', 'address', 'email', 'wechat', 'qq', 'phone'];
  const showFields = ['show_real_name', 'show_class_name', 'show_address', 'show_email', 'show_wechat', 'show_qq', 'show_phone'];
  const sets = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(req.body[f] === null ? '' : String(req.body[f]));
    }
  }
  for (const f of showFields) {
    if (req.body[f] !== undefined) {
      sets.push(`${f} = ?`);
      params.push(req.body[f] === true || req.body[f] === 'true' || req.body[f] === 1);
    }
  }
  if (req.body.profile_public !== undefined) {
    sets.push('profile_public = ?');
    params.push(req.body.profile_public === true || req.body.profile_public === 'true' || req.body.profile_public === 1);
  }
  if (sets.length === 0) return res.json({ ok: true });
  params.push(req.user.dbId);
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // 封禁联动：资料与已封禁用户相同 → 判定为小号并直接封禁
  const hit = await findBanHit(req.user.dbId);
  if (hit) {
    await db.prepare(
      `UPDATE users SET banned = TRUE, banned_reason = ?, banned_at = ${NOW_TEXT} WHERE id = ?`
    ).run('命中封禁资料', req.user.dbId);
    await logAlert(`检测到封禁用户重新注册：${req.user.username || req.user.uid}`);
    return res.json({ ok: true, banned: true, banned_reason: '命中封禁资料' });
  }
  res.json({ ok: true });
});

// 注销账号：删除用户及其所有关联数据
app.delete('/api/auth/account', auth, async (req, res) => {
  const uid = req.user.uid;
  const dbId = req.user.dbId;
  // 清理无外键的关联表
  await db.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(dbId);
  await db.prepare(`DELETE FROM follows WHERE follower_id = ? OR following_id = ?`).run(dbId, dbId);
  await db.prepare(`DELETE FROM friends WHERE requester_uid = ? OR addressee_uid = ?`).run(uid, uid);
  await db.prepare(`DELETE FROM messages WHERE from_uid = ? OR to_uid = ?`).run(uid, uid);
  await db.prepare(`DELETE FROM reports WHERE user_id = ?`).run(dbId);
  // posts/comments/likes/favorites 由外键 ON DELETE SET NULL / CASCADE 处理
  await db.prepare(`DELETE FROM users WHERE id = ?`).run(dbId);
  res.json({ ok: true });
});
app.get('/api/users/:id', async (req, res) => {
  const user = await db.prepare(
    `SELECT id, uid, username, nickname, avatar, bio, created_at, profile_public, reputation,
            real_name, class_name, address, email, wechat, qq, phone,
            show_real_name, show_class_name, show_address, show_email, show_wechat, show_qq, show_phone
     FROM users WHERE uid = ?`
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const postCount = (await db.prepare(`SELECT COUNT(*) as c FROM posts WHERE user_id = ? AND status = 'approved' AND is_anonymous = FALSE`).get(user.id)).c;
  const out = {
    uid: user.uid, username: user.username, nickname: user.nickname, avatar: user.avatar,
    bio: user.bio, created_at: user.created_at, profile_public: !!user.profile_public, postCount,
  };
  // 信誉分仅对本人与超级管理员可见
  const viewer = await getCurrentUser(req);
  const isSuperToken = req.headers['x-admin-token'] && req.headers['x-admin-token'] === SUPER_ADMIN_PASSWORD;
  if (isSuperToken || (viewer && (viewer.uid === user.uid || viewer.role === 'super'))) {
    out.reputation = user.reputation;
  }
  // 单项公开开关：只有对应 show_* 为真才返回该字段
  const contactFields = ['real_name', 'class_name', 'address', 'email', 'wechat', 'qq', 'phone'];
  for (const f of contactFields) {
    if (user[`show_${f}`]) out[f] = user[f];
  }
  res.json(out);
});

// Follow / unfollow
app.post('/api/users/:id/follow', auth, async (req, res) => {
  const target = await db.prepare(`SELECT id FROM users WHERE uid = ?`).get(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (req.user.uid === req.params.id) return res.status(400).json({ error: '不能关注自己' });
  const result = await db.prepare(`INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING id`)
    .run(req.user.dbId, target.id);
  if (result.changes > 0) return res.json({ followed: true });
  await db.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(req.user.dbId, target.id);
  res.json({ followed: false });
});

// ---------- Posts ----------
app.get('/api/posts', async (req, res) => {
  const { category, page = 1, pageSize = 20, sort = 'new', q, userId } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  let where = "WHERE p.status = 'approved'";
  const params = [];
  if (category && category !== 'all') { where += ' AND p.category = ?'; params.push(category); }
  // 匿名帖不出现在任何用户主页，避免通过主页反推作者（userId 为对外 uid）
  if (userId) { where += ' AND p.user_id = (SELECT id FROM users WHERE uid = ?) AND p.is_anonymous = FALSE'; params.push(userId); }
  let orderBy = 'p.id DESC';
  if (sort === 'hot') orderBy = '(p.likes + p.views * 0.1) DESC';

  let sql;
  if (q) {
    // 使用 ILIKE，保持 SQLite LIKE 的大小写不敏感语义（中文搜索不受影响）
    where += ' AND (p.content ILIKE ? OR p.tags ILIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql = `SELECT ${PUBLIC_POST_FIELDS} FROM posts p LEFT JOIN users u ON u.id = p.user_id ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  params.push(Number(pageSize), offset);

  const totalSql = `SELECT COUNT(*) as c FROM posts p ${where}`;
  const total = (await db.prepare(totalSql).get(...params.slice(0, -2))).c;

  const posts = await db.prepare(sql).all(...params);
  posts.forEach(p => { p.images = p.images ? JSON.parse(p.images) : []; p.tags = p.tags ? JSON.parse(p.tags) : []; });
  res.json({ total, posts });
});

app.get('/api/posts/hot', async (req, res) => {
  const posts = await db.prepare(
    `SELECT p.id, p.category, p.content, p.likes, p.views, p.is_anonymous, p.is_staff, p.staff_role,
            CASE WHEN p.is_anonymous THEN NULL ELSE u.uid END AS user_id,
            CASE WHEN p.is_anonymous THEN '匿名同学' ELSE p.nickname END AS nickname
     FROM posts p LEFT JOIN users u ON u.id = p.user_id
     WHERE p.status = 'approved' ORDER BY (p.likes + p.views * 0.1) DESC LIMIT 10`
  ).all();
  posts.forEach(p => { p.images = []; });
  res.json(posts);
});

app.get('/api/posts/:id', async (req, res) => {
  const post = await db.prepare(`SELECT ${PUBLIC_POST_FIELDS} FROM posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  post.images = post.images ? JSON.parse(post.images) : [];
  post.tags = post.tags ? JSON.parse(post.tags) : [];
  await db.prepare(`UPDATE posts SET views = views + 1 WHERE id = ?`).run(req.params.id);
  post.views += 1;

  const comments = await db.prepare(
    `SELECT c.id, c.post_id, c.parent_id, c.content, c.nickname, c.likes, c.created_at,
            CASE WHEN c.user_id IS NULL THEN NULL ELSE u.uid END AS user_id,
            u.nickname as user_nickname, u.avatar
     FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.id ASC`
  ).all(req.params.id);

  const user = await getCurrentUser(req);
  const liked = user ? !!(await db.prepare(`SELECT id FROM likes WHERE post_id = ? AND user_id = ?`).get(req.params.id, user.dbId)) : false;
  const favorited = user ? !!(await db.prepare(`SELECT id FROM favorites WHERE post_id = ? AND user_id = ?`).get(req.params.id, user.dbId)) : false;

  res.json({ post, comments, liked, favorited });
});

app.post('/api/posts', auth, upload.array('images', 9), async (req, res) => {
  const { category, content, nickname, tags, anonymous } = req.body;
  if (!category || !content || !content.trim()) return res.status(400).json({ error: '分类和内容不能为空' });
  if (content.length > 3000) return res.status(400).json({ error: '内容不能超过3000字' });
  // 敏感词检测
  if (containsSensitive(content)) {
    return res.status(400).json({ error: '内容包含违规词汇，请修改后再发布' });
  }
  const isAnonymous = anonymous === true || anonymous === 1 || String(anonymous).toLowerCase() === 'true' || String(anonymous) === '1';
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
  const userAgent = req.headers['user-agent'] || '';
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
  // 管理员 / 超级管理员发帖直接过审并标记身份
  const isStaff = req.user.role === 'admin' || req.user.role === 'super';
  const status = isStaff ? 'approved' : 'pending';
  const staffRole = isStaff ? req.user.role : null;
  const result = await db.prepare(
    `INSERT INTO posts (user_id, category, content, tags, nickname, images, is_anonymous, client_ip, user_agent, status, is_staff, staff_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).run(
    req.user.dbId, category, content.trim(), JSON.stringify(tagArr), (nickname || req.user.nickname).trim(),
    JSON.stringify(images), isAnonymous, clientIp, userAgent, status, isStaff, staffRole
  );
  res.json({
    id: result.lastInsertRowid,
    message: isStaff ? '发布成功' : '发布成功，等待管理员审核',
    status,
  });
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  const post = await db.prepare(`SELECT user_id, images FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  if (post.user_id !== req.user.dbId && req.user.role !== 'admin') return res.status(403).json({ error: '无权限' });
  if (post.images) {
    for (const img of JSON.parse(post.images)) {
      await fileStorage.deleteByUrl(img, uploadsDir);
    }
  }
  await db.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Likes ----------
// 未登录用户不可点赞
app.post('/api/posts/:id/like', auth, async (req, res) => {
  const post = await db.prepare(`SELECT id, user_id, nickname FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });

  let liked = false;
  let likes = 0;
  let shouldNotify = false;
  await db.transaction(async (tx) => {
    const existing = await tx.prepare(`SELECT id FROM likes WHERE post_id = ? AND user_id = ?`).get(req.params.id, req.user.dbId);
    if (existing) {
      await tx.prepare(`DELETE FROM likes WHERE post_id = ? AND user_id = ?`).run(req.params.id, req.user.dbId);
      await tx.prepare(`UPDATE posts SET likes = likes - 1 WHERE id = ?`).run(req.params.id);
    } else {
      await tx.prepare(`INSERT INTO likes (post_id, user_id) VALUES (?, ?) RETURNING id`).run(req.params.id, req.user.dbId);
      await tx.prepare(`UPDATE posts SET likes = likes + 1 WHERE id = ?`).run(req.params.id);
      liked = true;
      shouldNotify = true;
    }
    likes = (await tx.prepare(`SELECT likes FROM posts WHERE id = ?`).get(req.params.id)).likes;
  });
  if (shouldNotify) await notify(post.user_id, 'like', req.user.uid, post.id, '赞了你的帖子');
  res.json({ liked, likes });
});

// ---------- Comments ----------
// 未登录用户不可评论
app.post('/api/posts/:id/comments', auth, async (req, res) => {
  const { content, parentId } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
  if (content.length > 500) return res.status(400).json({ error: '评论不能超过500字' });
  if (containsSensitive(content)) return res.status(400).json({ error: '评论包含违规词汇，请修改后再发布' });
  const post = await db.prepare(`SELECT id, user_id, nickname FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  // 昵称固定使用登录用户的当前昵称
  const nick = req.user.nickname;
  const result = await db.prepare(
    `INSERT INTO comments (post_id, user_id, parent_id, content, nickname) VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).run(req.params.id, req.user.dbId, parentId || null, content.trim(), nick);
  if (parentId) {
    const parent = await db.prepare(`SELECT user_id, nickname FROM comments WHERE id = ?`).get(parentId);
    if (parent) await notify(parent.user_id, 'comment_reply', req.user.uid, post.id, `回复了你的评论: ${content.slice(0, 30)}`);
  } else {
    await notify(post.user_id, 'comment', req.user.uid, post.id, `评论了你的帖子: ${content.slice(0, 30)}`);
  }
  res.json({ id: result.lastInsertRowid });
});

// 未登录用户不可点赞评论
app.post('/api/comments/:id/like', auth, async (req, res) => {
  let likes = 0;
  await db.transaction(async (tx) => {
    // ip 设为空字符串，使 (comment_id, user_id, ip) 唯一约束对登录用户生效
    const inserted = await tx.prepare(
      `INSERT INTO comment_likes (comment_id, user_id, ip) VALUES (?, ?, '') ON CONFLICT DO NOTHING RETURNING id`
    ).run(req.params.id, req.user.dbId);
    if (inserted.changes > 0) {
      await tx.prepare(`UPDATE comments SET likes = likes + 1 WHERE id = ?`).run(req.params.id);
    } else {
      await tx.prepare(`DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ? AND ip = ''`).run(req.params.id, req.user.dbId);
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
    const existing = await tx.prepare(`SELECT id FROM favorites WHERE user_id = ? AND post_id = ?`).get(req.user.dbId, req.params.id);
    if (existing) {
      await tx.prepare(`DELETE FROM favorites WHERE user_id = ? AND post_id = ?`).run(req.user.dbId, req.params.id);
      return false;
    }
    await tx.prepare(`INSERT INTO favorites (user_id, post_id) VALUES (?, ?) RETURNING id`).run(req.user.dbId, req.params.id);
    return true;
  });
  res.json({ favorited });
});

app.get('/api/favorites', auth, async (req, res) => {
  const posts = await db.prepare(
    `SELECT ${PUBLIC_POST_FIELDS} FROM posts p JOIN favorites f ON f.post_id = p.id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE f.user_id = ? AND p.status = 'approved' ORDER BY f.id DESC`
  ).all(req.user.dbId);
  posts.forEach(p => { p.images = p.images ? JSON.parse(p.images) : []; });
  res.json(posts);
});

// ---------- Reports ----------
// 未登录用户不可举报
app.post('/api/reports', auth, async (req, res) => {
  const { postId, commentId, reason } = req.body;
  if (!reason) return res.status(400).json({ error: '请填写举报原因' });
  await db.prepare(`INSERT INTO reports (post_id, comment_id, user_id, reason) VALUES (?, ?, ?, ?) RETURNING id`)
    .run(postId || null, commentId || null, req.user.dbId, reason);
  res.json({ ok: true, message: '举报已提交，管理员会尽快处理' });
});

// ---------- Notifications ----------
app.get('/api/notifications', auth, async (req, res) => {
  const list = await db.prepare(
    `SELECT n.*, COALESCE(u.nickname, n.from_user) AS from_nickname
     FROM notifications n LEFT JOIN users u ON u.uid = n.from_user
     WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`
  ).all(req.user.dbId);
  res.json(list);
});

app.get('/api/notifications/unread', auth, async (req, res) => {
  const count = (await db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`).get(req.user.dbId)).c;
  res.json({ count });
});

app.post('/api/notifications/read', auth, async (req, res) => {
  await db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.user.dbId);
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
  await db.prepare(`UPDATE users SET avatar = ? WHERE id = ?`).run(url, req.user.dbId);
  res.json({ url });
});

// ---------- Friends ----------
app.get('/api/friends', auth, async (req, res) => {
  const list = await db.prepare(
    `SELECT u.uid, u.nickname, u.avatar, u.bio
     FROM friends f
     JOIN users u ON u.uid = CASE WHEN f.requester_uid = ? THEN f.addressee_uid ELSE f.requester_uid END
     WHERE f.status = 'accepted' AND (f.requester_uid = ? OR f.addressee_uid = ?)
     ORDER BY f.id DESC`
  ).all(req.user.uid, req.user.uid, req.user.uid);
  res.json(list);
});

app.get('/api/friends/requests', auth, async (req, res) => {
  const list = await db.prepare(
    `SELECT u.uid, u.nickname, u.avatar, u.bio, f.created_at
     FROM friends f JOIN users u ON u.uid = f.requester_uid
     WHERE f.addressee_uid = ? AND f.status = 'pending'
     ORDER BY f.id DESC`
  ).all(req.user.uid);
  res.json(list);
});

app.post('/api/friends/request/:uid', auth, async (req, res) => {
  const targetUid = req.params.uid;
  if (targetUid === req.user.uid) return res.status(400).json({ error: '不能添加自己为好友' });
  const target = await db.prepare(`SELECT id FROM users WHERE uid = ?`).get(targetUid);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  const existing = await db.prepare(
    `SELECT * FROM friends WHERE (requester_uid = ? AND addressee_uid = ?) OR (requester_uid = ? AND addressee_uid = ?)`
  ).get(req.user.uid, targetUid, targetUid, req.user.uid);
  if (existing) {
    if (existing.status === 'accepted') return res.json({ status: 'accepted' });
    if (existing.requester_uid === req.user.uid) return res.json({ status: 'pending' });
    // 对方已向我发过请求，直接成为好友
    await db.prepare(`UPDATE friends SET status = 'accepted' WHERE id = ?`).run(existing.id);
    return res.json({ status: 'accepted' });
  }
  await db.prepare(`INSERT INTO friends (requester_uid, addressee_uid) VALUES (?, ?) RETURNING id`).run(req.user.uid, targetUid);
  await notify(target.id, 'friend_request', req.user.uid, null, null);
  res.json({ status: 'pending' });
});

app.post('/api/friends/accept/:uid', auth, async (req, res) => {
  const result = await db.prepare(
    `UPDATE friends SET status = 'accepted' WHERE requester_uid = ? AND addressee_uid = ? AND status = 'pending'`
  ).run(req.params.uid, req.user.uid);
  if (result.changes === 0) return res.status(404).json({ error: '没有待处理的好友请求' });
  res.json({ ok: true });
});

app.delete('/api/friends/:uid', auth, async (req, res) => {
  await db.prepare(
    `DELETE FROM friends WHERE (requester_uid = ? AND addressee_uid = ?) OR (requester_uid = ? AND addressee_uid = ?)`
  ).run(req.user.uid, req.params.uid, req.params.uid, req.user.uid);
  res.json({ ok: true });
});

// ---------- Messages ----------
app.get('/api/messages/conversations', auth, async (req, res) => {
  const rows = await db.prepare(
    `SELECT * FROM messages WHERE from_uid = ? OR to_uid = ? ORDER BY id DESC`
  ).all(req.user.uid, req.user.uid);

  const peers = [];
  const map = new Map();
  for (const m of rows) {
    const peer = m.from_uid === req.user.uid ? m.to_uid : m.from_uid;
    if (!map.has(peer)) {
      map.set(peer, { uid: peer, last_content: m.content, last_time: m.created_at, unread: 0 });
      peers.push(peer);
    }
    if (m.to_uid === req.user.uid && m.from_uid === peer && !m.read) map.get(peer).unread += 1;
  }

  if (peers.length > 0) {
    const placeholders = peers.map(() => '?').join(', ');
    const users = await db.prepare(`SELECT uid, nickname, avatar FROM users WHERE uid IN (${placeholders})`).all(...peers);
    const userMap = new Map(users.map((u) => [u.uid, u]));
    for (const c of map.values()) {
      const u = userMap.get(c.uid);
      c.nickname = u ? u.nickname : '';
      c.avatar = u ? u.avatar : null;
    }
  }
  res.json([...map.values()]);
});

app.get('/api/messages/:uid', auth, async (req, res) => {
  const peerUid = req.params.uid;
  if (peerUid === req.user.uid) return res.status(400).json({ error: '不能和自己私信' });
  const peer = await db.prepare(`SELECT id FROM users WHERE uid = ?`).get(peerUid);
  if (!peer) return res.status(404).json({ error: '用户不存在' });
  await db.prepare(`UPDATE messages SET read = TRUE WHERE from_uid = ? AND to_uid = ? AND read = FALSE`).run(peerUid, req.user.uid);
  const list = await db.prepare(
    `SELECT id, from_uid, to_uid, content, read, created_at FROM messages
     WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)
     ORDER BY id ASC`
  ).all(req.user.uid, peerUid, peerUid, req.user.uid);
  res.json(list);
});

app.post('/api/messages', auth, async (req, res) => {
  const { to, content } = req.body;
  if (!to) return res.status(400).json({ error: '请选择接收者' });
  if (!content || !String(content).trim()) return res.status(400).json({ error: '消息内容不能为空' });
  if (to === req.user.uid) return res.status(400).json({ error: '不能给自己发私信' });
  const peer = await db.prepare(`SELECT id FROM users WHERE uid = ?`).get(to);
  if (!peer) return res.status(404).json({ error: '用户不存在' });
  const text = String(content).trim();
  const result = await db.prepare(
    `INSERT INTO messages (from_uid, to_uid, content) VALUES (?, ?, ?) RETURNING id`
  ).run(req.user.uid, to, text);
  await notify(peer.id, 'message', req.user.uid, null, text.slice(0, 60));
  res.json({ id: result.lastInsertRowid });
});

// ---------- Admin ----------
app.get('/api/admin/whoami', adminAuth, (req, res) => {
  res.json({ role: req.adminRole || 'admin' });
});

app.post('/api/admin/notify', adminAuth, async (req, res) => {
  const { uids, all, content } = req.body;
  if (!content || !String(content).trim()) return res.status(400).json({ error: '通知内容不能为空' });
  const text = String(content).trim();
  let sent = 0;
  if (all) {
    const result = await db.prepare(
      `INSERT INTO notifications (user_id, type, from_user, content)
       SELECT id, 'system', 'system', ? FROM users RETURNING id`
    ).run(text);
    sent = result.changes;
  } else {
    if (!Array.isArray(uids) || uids.length === 0) return res.status(400).json({ error: '请提供接收用户 uid' });
    for (const uid of uids) {
      if (typeof uid !== 'string' || !uid.trim()) continue;
      const result = await db.prepare(
        `INSERT INTO notifications (user_id, type, from_user, content)
         SELECT id, 'system', 'system', ? FROM users WHERE uid = ? RETURNING id`
      ).run(text, uid.trim());
      sent += result.changes;
    }
  }
  res.json({ sent });
});

app.get('/api/admin/posts', adminAuth, async (req, res) => {
  const { status, page = 1, pageSize = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(pageSize);
  let where = '';
  const params = [];
  if (status && status !== 'all') { where = 'WHERE p.status = ?'; params.push(status); }
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM posts p ${where}`).get(...params)).c;
  const posts = await db.prepare(
    `SELECT p.id, p.category, p.content, p.tags, p.images, p.status, p.likes, p.views, p.created_at,
            p.is_anonymous, p.nickname, p.client_ip, p.user_agent, p.is_staff, p.staff_role,
            CASE WHEN p.user_id IS NULL THEN NULL ELSE u.uid END AS user_id
     FROM posts p LEFT JOIN users u ON u.id = p.user_id
     ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`
  ).all(...params, Number(pageSize), offset);
  posts.forEach(p => { p.images = p.images ? JSON.parse(p.images) : []; p.tags = p.tags ? JSON.parse(p.tags) : []; });
  res.json({ total, posts });
});

app.get('/api/admin/posts/:id', adminAuth, async (req, res) => {
  const post = await db.prepare(`SELECT * FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  post.images = post.images ? JSON.parse(post.images) : [];
  post.tags = post.tags ? JSON.parse(post.tags) : [];

  const authorId = post.user_id;
  const author = authorId
    ? await db.prepare(
        `SELECT id, uid, username, nickname, avatar, real_name, class_name, address, email, wechat, qq, phone, created_at
         FROM users WHERE id = ?`
      ).get(authorId)
    : null;
  post.user_id = author ? author.uid : null;
  const commentCount = (await db.prepare(`SELECT COUNT(*) as c FROM comments WHERE post_id = ?`).get(req.params.id)).c;

  res.json({
    post,
    author,
    stats: { comments: commentCount, likes: post.likes },
    is_anonymous: !!post.is_anonymous,
    client_ip: post.client_ip || '',
    user_agent: post.user_agent || '',
  });
});

app.put('/api/admin/posts/:id', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: '无效状态' });
  await db.prepare(`UPDATE posts SET status = ? WHERE id = ?`).run(status, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/posts/:id', superAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: '帖子不存在' });
  const post = await db.prepare(`SELECT id, user_id, category, content, images FROM posts WHERE id = ?`).get(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  let authorName = '已注销用户';
  if (post.user_id) {
    const author = await db.prepare(`SELECT username FROM users WHERE id = ?`).get(post.user_id);
    if (author) authorName = `@${author.username}`;
  }
  if (post.images) {
    for (const img of JSON.parse(post.images)) {
      try { await fileStorage.deleteByUrl(img, uploadsDir); } catch (e) { console.error('[admin] 图片清理失败:', e.message); }
    }
  }
  // 超级管理员删帖 → 作者信誉 -10，并记录安全告警
  if (post.user_id) {
    const penalty = await penalizeAndMaybeBan(post.user_id, 10);
    await logAlert(`超级管理员删除帖子 #${post.id}（分类：${post.category}，作者：${authorName}）`);
    // 评论 / 点赞 / 收藏由外键级联删除；举报与通知没有外键，需显式清理
    await db.transaction(async (tx) => {
      await tx.prepare(`DELETE FROM reports WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)`).run(req.params.id, req.params.id);
      await tx.prepare(`DELETE FROM notifications WHERE post_id = ?`).run(req.params.id);
      await tx.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
    });
    return res.json({ ok: true, message: '帖子及关联数据已删除', reputation: penalty ? penalty.reputation : null });
  }
  await db.transaction(async (tx) => {
    await tx.prepare(`DELETE FROM reports WHERE post_id = ? OR comment_id IN (SELECT id FROM comments WHERE post_id = ?)`).run(req.params.id, req.params.id);
    await tx.prepare(`DELETE FROM notifications WHERE post_id = ?`).run(req.params.id);
    await tx.prepare(`DELETE FROM posts WHERE id = ?`).run(req.params.id);
  });
  res.json({ ok: true, message: '帖子及关联数据已删除' });
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
  const report = await db.prepare(`SELECT id, post_id, comment_id, status FROM reports WHERE id = ?`).get(req.params.id);
  if (!report) return res.status(404).json({ error: '举报不存在' });
  await db.prepare(`UPDATE reports SET status = ? WHERE id = ?`).run(status, req.params.id);

  // 举报判定有效（valid / resolved）→ 作者信誉 -10（同一条举报只扣一次）
  let reputation = null;
  const effective = status === 'valid' || status === 'resolved';
  const wasEffective = report.status === 'valid' || report.status === 'resolved';
  if (effective && !wasEffective) {
    let authorId = null;
    if (report.post_id) {
      authorId = (await db.prepare(`SELECT user_id FROM posts WHERE id = ?`).get(report.post_id))?.user_id || null;
    } else if (report.comment_id) {
      authorId = (await db.prepare(`SELECT user_id FROM comments WHERE id = ?`).get(report.comment_id))?.user_id || null;
    }
    if (authorId) {
      const r = await penalizeAndMaybeBan(authorId, 10);
      reputation = r ? r.reputation : null;
    }
  }
  res.json({ ok: true, reputation });
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
  const users = await db.prepare(
    `SELECT uid, username, nickname, avatar, role, reputation, banned, banned_reason, banned_at, created_at
     FROM users ORDER BY id DESC`
  ).all();
  res.json(users);
});

app.put('/api/admin/users/:id', superAuth, async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin', 'super'].includes(role)) return res.status(400).json({ error: '无效角色' });
  await db.prepare(`UPDATE users SET role = ? WHERE uid = ?`).run(role, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/admin/users/:id', superAuth, async (req, res) => {
  await db.prepare(`DELETE FROM users WHERE uid = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ---------- Super Admin: 封禁 / 告警 / 私信 ----------
app.post('/api/admin/users/:uid/ban', superAuth, async (req, res) => {
  const reason = (req.body && req.body.reason ? String(req.body.reason).trim() : '') || '违反社区规范';
  const user = await db.prepare(`SELECT id, uid, username FROM users WHERE uid = ?`).get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const info = await buildBannedInfo(user.id);
  await db.prepare(
    `UPDATE users SET banned = TRUE, banned_reason = ?, banned_at = ${NOW_TEXT}, banned_info = ? WHERE id = ?`
  ).run(reason, info, user.id);
  await logAlert(`超级管理员封禁用户：@${user.username}（原因：${reason}）`);
  res.json({ ok: true, uid: user.uid, banned: true, reason });
});

app.post('/api/admin/users/:uid/unban', superAuth, async (req, res) => {
  const user = await db.prepare(`SELECT id, uid, username FROM users WHERE uid = ?`).get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  await db.prepare(
    `UPDATE users SET banned = FALSE, banned_reason = NULL, banned_at = NULL, banned_info = NULL WHERE id = ?`
  ).run(user.id);
  res.json({ ok: true, uid: user.uid, banned: false });
});

app.get('/api/admin/bans', superAuth, async (req, res) => {
  const list = await db.prepare(
    `SELECT uid, username, nickname, role, reputation, banned_reason, banned_at
     FROM users WHERE banned = TRUE ORDER BY id DESC`
  ).all();
  res.json(list);
});

app.get('/api/admin/alerts', superAuth, async (req, res) => {
  const list = await db.prepare(`SELECT id, content, created_at, read FROM super_alerts ORDER BY id DESC`).all();
  res.json(list);
});

app.post('/api/admin/alerts/read', superAuth, async (req, res) => {
  const result = await db.prepare(`UPDATE super_alerts SET read = TRUE WHERE read = FALSE`).run();
  res.json({ ok: true, count: result.changes });
});

// 查看指定用户的会话列表（不标记已读）
app.get('/api/admin/conversations/:uid', superAuth, async (req, res) => {
  const user = await db.prepare(`SELECT id, uid FROM users WHERE uid = ?`).get(req.params.uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const rows = await db.prepare(
    `SELECT * FROM messages WHERE from_uid = ? OR to_uid = ? ORDER BY id DESC`
  ).all(user.uid, user.uid);
  const map = new Map();
  for (const m of rows) {
    const peer = m.from_uid === user.uid ? m.to_uid : m.from_uid;
    if (!map.has(peer)) {
      map.set(peer, { uid: peer, last_content: m.content, last_time: m.created_at, unread: 0 });
    }
    if (m.to_uid === user.uid && m.from_uid === peer && !m.read) map.get(peer).unread += 1;
  }
  const peers = [...map.keys()];
  if (peers.length > 0) {
    const placeholders = peers.map(() => '?').join(', ');
    const users = await db.prepare(`SELECT uid, nickname, avatar FROM users WHERE uid IN (${placeholders})`).all(...peers);
    const userMap = new Map(users.map((u) => [u.uid, u]));
    for (const c of map.values()) {
      const u = userMap.get(c.uid);
      c.nickname = u ? u.nickname : '';
      c.avatar = u ? u.avatar : null;
    }
  }
  res.json([...map.values()]);
});

async function adminConversationMessages(userUid, peerUid) {
  const list = await db.prepare(
    `SELECT id, from_uid, to_uid, content, read, created_at FROM messages
     WHERE (from_uid = ? AND to_uid = ?) OR (from_uid = ? AND to_uid = ?)
     ORDER BY id ASC`
  ).all(userUid, peerUid, peerUid, userUid);
  return list;
}

// 查看指定用户与对端的完整会话（不标记已读）
app.get('/api/admin/messages/:uid/:peerUid', superAuth, async (req, res) => {
  const user = await db.prepare(`SELECT uid FROM users WHERE uid = ?`).get(req.params.uid);
  const peer = await db.prepare(`SELECT uid FROM users WHERE uid = ?`).get(req.params.peerUid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!peer) return res.status(404).json({ error: '对端用户不存在' });
  res.json(await adminConversationMessages(user.uid, peer.uid));
});

// 兼容仅传 :uid 并通过对端查询参数指定 peer 的调用方式
app.get('/api/admin/messages/:uid', superAuth, async (req, res) => {
  const peerUid = req.query.peer || req.query.peerUid || req.query.to;
  if (!peerUid) return res.status(400).json({ error: '请提供对端 uid' });
  const user = await db.prepare(`SELECT uid FROM users WHERE uid = ?`).get(req.params.uid);
  const peer = await db.prepare(`SELECT uid FROM users WHERE uid = ?`).get(peerUid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  if (!peer) return res.status(404).json({ error: '对端用户不存在' });
  res.json(await adminConversationMessages(user.uid, peer.uid));
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
if (require.main === module) {
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
}

// Serverless 平台（Netlify）复用的导出
module.exports = app;
module.exports.ready = db.ready;
