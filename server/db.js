require('dotenv').config();
const pg = require('pg');
const { Pool, types } = pg;
const bcrypt = require('bcryptjs');
const { AsyncLocalStorage } = require('node:async_hooks');

// Workers 中 TCP socket 与创建它的请求绑定，请求结束后 socket 失效。
// 因此不能跨请求复用连接池：这里用 AsyncLocalStorage 给每个请求一个独立连接池。
const requestPoolStore = new AsyncLocalStorage();

// Cloudflare Workers 环境下用 pg-cloudflare 的 TCP Socket 替代 Node net（Workers 无 fs/net）
let CFCloudflareSocket = null;
try {
  const cfMod = require('pg-cloudflare');
  CFCloudflareSocket = (cfMod && cfMod.CloudflareSocket) || (cfMod && cfMod.default && cfMod.default.CloudflareSocket) || null;
} catch { /* Node 环境下 pg-cloudflare 为空模块，忽略 */ }

// node-pg 默认把 int8/COUNT 返回成字符串，前端要求是数字
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const DATABASE_URL = process.env.DATABASE_URL || '';
const DB_CONFIG_MISSING = !DATABASE_URL;
if (DB_CONFIG_MISSING) {
  console.error('[db] 错误：环境变量 DATABASE_URL 为空。请配置 Supabase → Project Settings → Database → Connection string。');
}

// 解析连接串：sslmode=require 时显式开启 SSL，并从 URL 中移除该参数，
// 避免 pg-connection-string 的解析结果覆盖我们设置的 ssl 选项
function buildPoolConfig(rawUrl) {
  const cfg = {
    // Workers 每个 isolate 都有独立连接池，Supabase 免费版连接数有限。
    // 单 isolate 限制为 2 条连接，空闲 2s 释放，显著降低「连接超时」与复用失效连接的概率。
    max: Number(process.env.PG_POOL_MAX) || (CFCloudflareSocket ? 2 : 10),
    idleTimeoutMillis: CFCloudflareSocket ? 2000 : 30000,
    connectionTimeoutMillis: CFCloudflareSocket ? 6000 : 10000,
    keepAlive: true,
  };
  try {
    const u = new URL(rawUrl);
    const sslmode = (u.searchParams.get('sslmode') || '').toLowerCase();
    u.searchParams.delete('sslmode');
    cfg.connectionString = u.toString();
    if (sslmode === 'require' || sslmode === 'prefer' || sslmode === 'verify-ca' || sslmode === 'verify-full') {
      cfg.ssl = { rejectUnauthorized: false };
    }
  } catch {
    cfg.connectionString = rawUrl;
    if (/sslmode=require/i.test(rawUrl)) cfg.ssl = { rejectUnauthorized: false };
  }
  // Workers：用 CloudflareSocket 建立 TCP（含 SSL/STARTTLS）
  if (CFCloudflareSocket) {
    cfg.stream = () => new CFCloudflareSocket(!!cfg.ssl);
  }
  return cfg;
}

const pool = DB_CONFIG_MISSING
  ? {
      query: async () => { throw new Error('DATABASE_URL 未配置，无法连接数据库'); },
      on: () => {},
      end: async () => {},
    }
  : new Pool(buildPoolConfig(DATABASE_URL));
pool.on('error', (err) => {
  // 空闲连接异常时不能静默，否则线上会表现为所有查询挂起
  console.error('[db] 连接池空闲连接错误:', err.message);
});
// 为每个新建的连接绑定 error 监听，避免未处理的连接错误导致 Worker 崩溃（1101）
if (!DB_CONFIG_MISSING) {
  pool.on('connect', (client) => {
    client.on('error', (err) => {
      console.error('[db] 连接错误:', err && err.message ? err.message : err);
    });
  });
}

const LOCAL_NOW = `to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')`;

// 每个请求独立的连接池（Workers 下 socket 不能跨请求复用）
function createRequestPool() {
  const p = new Pool(buildPoolConfig(DATABASE_URL));
  p.on('error', (err) => console.error('[db] 请求连接池错误:', err && err.message ? err.message : err));
  p.on('connect', (client) => {
    client.on('error', (err) => console.error('[db] 连接错误:', err && err.message ? err.message : err));
  });
  return p;
}

function activePool() {
  return requestPoolStore.getStore() || pool;
}

// ---------- SQLite → PostgreSQL 方言转换 ----------
function transformSql(sql) {
  let s = sql;
  s = s.replace(/datetime\s*\(\s*'now'\s*,\s*'localtime'\s*\)/gi, LOCAL_NOW);

  let ignoreInsert = false;
  s = s.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, () => {
    ignoreInsert = true;
    return 'INSERT INTO';
  });
  if (ignoreInsert && !/ON\s+CONFLICT/i.test(s)) {
    s = /\bRETURNING\b/i.test(s)
      ? s.replace(/\bRETURNING\b/i, 'ON CONFLICT DO NOTHING RETURNING')
      : s.trimEnd() + ' ON CONFLICT DO NOTHING';
  }
  return s;
}

// 把 ? 占位符按顺序转成 $1..$n，跳过字符串字面量/引号标识符/注释中的 ?
function convertPlaceholders(sql) {
  let out = '';
  let i = 0;
  let n = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // 单引号字符串（支持 '' 转义）
    if (ch === "'") {
      out += ch;
      i += 1;
      while (i < len) {
        const c = sql[i];
        out += c;
        i += 1;
        if (c === "'") {
          if (sql[i] === "'") { out += "'"; i += 1; continue; }
          break;
        }
      }
      continue;
    }

    // 双引号标识符
    if (ch === '"') {
      out += ch;
      i += 1;
      while (i < len) {
        const c = sql[i];
        out += c;
        i += 1;
        if (c === '"') {
          if (sql[i] === '"') { out += '"'; i += 1; continue; }
          break;
        }
      }
      continue;
    }

    // -- 行注释
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < len && sql[i] !== '\n') { out += sql[i]; i += 1; }
      continue;
    }

    // /* */ 块注释
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) { out += sql.slice(i); break; }
      out += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // 美元引号 $$...$$ 或 $tag$...$tag$
    if (ch === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        if (end !== -1) {
          out += sql.slice(i, end + tag.length);
          i = end + tag.length;
          continue;
        }
      }
    }

    if (ch === '?') {
      n += 1;
      out += `$${n}`;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}

function normalizeParams(args) {
  if (args.length === 0) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

// 与 better-sqlite3 用法兼容的异步门面：
//   db.prepare(sql).get(param...) / .all(param...) / .run(param...)
function createFacade(runner) {
  return {
    prepare(sql) {
      const text = convertPlaceholders(transformSql(sql));
      return {
        async get(...args) {
          const result = await runner(text, normalizeParams(args), { write: false });
          return result.rows[0];
        },
        async all(...args) {
          const result = await runner(text, normalizeParams(args), { write: false });
          return result.rows;
        },
        async run(...args) {
          const result = await runner(text, normalizeParams(args), { write: true });
          const row = result.rows && result.rows[0];
          return {
            lastInsertRowid: row && typeof row.id !== 'undefined' ? row.id : undefined,
            changes: result.rowCount || 0,
          };
        },
      };
    },
  };
}

// ---------- 连接重试 ----------
// Workers 中 TCP socket 与创建它的请求绑定：请求结束后 socket 会被关闭，
// 而连接池仍把旧连接当作可用，导致「下一条请求」首次查询失败并抛出 1101。
// 这类错误都发生在 SQL 执行之前，因此读/写都可以安全重试（换一条新连接）。
const CONNECT_PHASE_RE = /timeout exceeded when trying to connect|Connection terminated|server closed the connection|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|Client has encountered a connection error|Cannot use a pool after/i;
const TRANSIENT_RE = CONNECT_PHASE_RE;
const TRANSIENT_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', '57P01', '57P02', '57P03'];

function isTransient(err, strict) {
  const msg = String((err && err.message) || '');
  const code = err && err.code;
  if (TRANSIENT_RE.test(msg) || TRANSIENT_CODES.includes(code)) return true;
  if (strict) return false;
  return false;
}

async function runWithRetry(fn, strict, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err, strict) || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * (i + 1)));
    }
  }
  throw lastErr;
}

const db = createFacade((text, params, opts) => runWithRetry(() => activePool().query(text, params), !!(opts && opts.write)));
db.pool = pool;

// 在独立连接池上下文中执行一个请求（Workers 专用；Node 本地开发直接执行）
db.runInRequestContext = async (fn) => {
  if (!CFCloudflareSocket || DB_CONFIG_MISSING) return fn();
  const reqPool = createRequestPool();
  try {
    return await requestPoolStore.run(reqPool, fn);
  } finally {
    try { await reqPool.end(); } catch (e) { console.error('[db] 关闭请求连接池失败:', e && e.message); }
  }
};

// 事务：传入一个绑定到同一连接的 tx 门面
db.transaction = async (fn) => {
  let client;
  // 连接池可能返回已失效的旧连接；BEGIN 失败时销毁该连接并重连
  for (let attempt = 0; ; attempt += 1) {
    client = await runWithRetry(() => activePool().connect(), true);
    try {
      await client.query('BEGIN');
      break;
    } catch (err) {
      client.release(true);
      if (!isTransient(err, true) || attempt >= 2) throw err;
    }
  }
  try {
    const tx = createFacade((text, params) => client.query(text, params));
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { console.error('[db] 回滚失败:', e.message); }
    throw err;
  } finally {
    client.release();
  }
};

// ---------- schema ----------
const DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT,
    bio TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    reputation INTEGER NOT NULL DEFAULT 100,
    banned BOOLEAN NOT NULL DEFAULT FALSE,
    banned_reason TEXT,
    banned_at TEXT,
    banned_info TEXT,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW}
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    nickname TEXT DEFAULT '匿名同学',
    images TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    likes INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    staff_role TEXT,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER NOT NULL,
    user_id INTEGER,
    parent_id INTEGER DEFAULT NULL,
    content TEXT NOT NULL,
    nickname TEXT DEFAULT '匿名同学',
    likes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER NOT NULL,
    user_id INTEGER,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    comment_id INTEGER NOT NULL,
    user_id INTEGER,
    ip TEXT,
    CONSTRAINT comment_likes_unique UNIQUE (comment_id, user_id, ip),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    CONSTRAINT favorites_unique UNIQUE (user_id, post_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER,
    comment_id INTEGER,
    user_id INTEGER,
    reported_uid TEXT,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW}
  );

  -- 用户拉黑关系（私信场景）：blocker 主动拉黑 blocked
  CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    blocker_uid TEXT NOT NULL,
    blocked_uid TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    UNIQUE (blocker_uid, blocked_uid)
  );

  ALTER TABLE reports ADD COLUMN IF NOT EXISTS reported_uid TEXT;

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    from_user TEXT,
    post_id INTEGER,
    content TEXT,
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW}
  );

  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    CONSTRAINT follows_unique UNIQUE (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    requester_uid TEXT NOT NULL,
    addressee_uid TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    CONSTRAINT friends_unique UNIQUE (requester_uid, addressee_uid)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    from_uid TEXT NOT NULL,
    to_uid TEXT NOT NULL,
    content TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW}
  );

  CREATE TABLE IF NOT EXISTS super_alerts (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW},
    read BOOLEAN NOT NULL DEFAULT FALSE
  );
`;

// ---------- 幂等迁移（在 CREATE TABLE 之后追加，兼容已有库）----------
const MIGRATIONS = `
  ALTER TABLE users ADD COLUMN IF NOT EXISTS real_name TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS class_name TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS qq TEXT DEFAULT '';
  ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';

  ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS client_ip TEXT;
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS user_agent TEXT;
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS staff_role TEXT;

  ALTER TABLE users ADD COLUMN IF NOT EXISTS uid CHAR(16);
  ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_public BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS reputation INTEGER NOT NULL DEFAULT 100;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_info TEXT;

  -- 个人信息单项公开开关
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_real_name BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_class_name BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_address BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_email BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_wechat BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_qq BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_phone BOOLEAN NOT NULL DEFAULT FALSE;

  -- 注册时获取的经纬度（仅服务端存储，不对任何用户返回）
  ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

  -- 用户协议同意时间
  ALTER TABLE users ADD COLUMN IF NOT EXISTS agreed_at TEXT;

  -- 年级（入学年份，如 2022）与身份标签（graduate 毕业生 / student 在校生）
  ALTER TABLE users ADD COLUMN IF NOT EXISTS grade INTEGER;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS tag TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_set_by_admin BOOLEAN NOT NULL DEFAULT FALSE;

  -- 明文密码的可逆加密存储（仅超级管理员可查看；历史账号无此字段则无法还原）
  ALTER TABLE users ADD COLUMN IF NOT EXISTS password_enc TEXT;

  -- 用户是否公开自己的 ID（默认不公开）
  ALTER TABLE users ADD COLUMN IF NOT EXISTS show_uid BOOLEAN NOT NULL DEFAULT FALSE;

  -- 管理员/超管手动设置为热门帖
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_hot BOOLEAN NOT NULL DEFAULT FALSE;

  -- 用户向管理员提交的图文申请
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    images TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---------- 板块（分类）管理 ----------
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    icon TEXT NOT NULL DEFAULT '📝',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_activity BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')
  );

  -- ---------- 管理员操作审计（拒绝 / 删除 / 封禁等均留痕） ----------
  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    admin_role TEXT,
    admin_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    reason TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')
  );

  -- 帖子审核备注（用户可见的拒绝理由）
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_note TEXT;
  -- 帖子多媒体（JSON: [{type,url}]，兼容旧 images 字段）
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS media TEXT;
  -- 引用其他帖子
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS quote_post_id INTEGER;
  -- 活动是否需要报名
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity_signup_required BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE posts ADD COLUMN IF NOT EXISTS activity_signup_deadline TEXT;

  CREATE TABLE IF NOT EXISTS activity_signups (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    CONSTRAINT activity_signups_unique UNIQUE (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  -- 评论多媒体
  ALTER TABLE comments ADD COLUMN IF NOT EXISTS media TEXT;

  -- 举报处理详情
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS handle_note TEXT;
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_by TEXT;
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_at TEXT;

  -- 私信多媒体与转发
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS media TEXT;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS share_type TEXT;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS share_id TEXT;

  -- 通知增强：图片、大标签
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS image TEXT;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS badge_text TEXT;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS badge_color TEXT;

  -- 用户自定义标签、标签颜色、金币
  ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_tag TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS tag_color TEXT;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 100;

  -- 用户自定义 GIF 表情包
  CREATE TABLE IF NOT EXISTS user_stickers (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    name TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 金币转账记录
  CREATE TABLE IF NOT EXISTS coin_transfers (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    from_uid TEXT NOT NULL,
    to_uid TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')
  );

  -- ---------- 群聊 ----------
  CREATE TABLE IF NOT EXISTS chat_groups (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    owner_uid TEXT,
    avatar TEXT,
    is_all BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS chat_group_members (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    group_id INTEGER NOT NULL,
    user_uid TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    last_read_at TEXT,
    joined_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    CONSTRAINT chat_group_members_unique UNIQUE (group_id, user_uid),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    group_id INTEGER NOT NULL,
    from_uid TEXT NOT NULL,
    content TEXT DEFAULT '',
    media TEXT,
    share_type TEXT,
    share_id TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
  );

  -- 群红包
  CREATE TABLE IF NOT EXISTS red_packets (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    group_id INTEGER NOT NULL,
    sender_uid TEXT NOT NULL,
    note TEXT DEFAULT '恭喜发财，大吉大利',
    total INTEGER NOT NULL,
    remaining INTEGER NOT NULL,
    count INTEGER NOT NULL,
    remaining_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS red_packet_claims (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    packet_id INTEGER NOT NULL,
    claimer_uid TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    CONSTRAINT red_packet_claims_unique UNIQUE (packet_id, claimer_uid),
    FOREIGN KEY (packet_id) REFERENCES red_packets(id) ON DELETE CASCADE
  );

  -- 帖子浏览记录（超级管理员可查看谁看过、看了几次）
  CREATE TABLE IF NOT EXISTS post_views (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    post_id INTEGER NOT NULL,
    viewer_uid TEXT NOT NULL,
    view_count INTEGER NOT NULL DEFAULT 1,
    last_viewed_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    CONSTRAINT post_views_unique UNIQUE (post_id, viewer_uid),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );

  -- 注销申请（需上传智学网卷子图片并由超管审批）
  CREATE TABLE IF NOT EXISTS deletion_requests (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL,
    images TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS'),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`;

const DEFAULT_CATEGORIES = [
  ['表白墙', '💕', 10, false],
  ['失物招领', '🔍', 20, false],
  ['二手交易', '🛒', 30, false],
  ['吐槽', '💬', 40, false],
  ['问答', '❓', 50, false],
  ['求助', '🆘', 60, false],
  ['活动', '🎉', 70, true],
  ['其他', '📝', 80, false],
];

const ALL_GROUP_NAME = '全体成员群聊';

// 对外用户 ID：Date.now() 十六进制补足 12 位 + 4 位随机十六进制（小写）
function genUid() {
  const ts = Date.now().toString(16).padStart(12, '0');
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return (ts + rand).slice(-16);
}

// ---------- 种子数据（空库时写入，保留原有测试账号与示例帖子）----------
async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (rows[0].c > 0) return;

  const hash = await bcrypt.hash('123456', 10);
  const insertUser = async (username, nickname) => {
    const r = await pool.query(
      'INSERT INTO users (username, password_hash, nickname, uid) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, hash, nickname, genUid()]
    );
    return r.rows[0].id;
  };
  const ming = await insertUser('xiaoming', '小明');
  const hong = await insertUser('xiaohong', '小红');

  const { rows: postRows } = await pool.query('SELECT COUNT(*) AS c FROM posts');
  if (postRows[0].c > 0) return;

  const samples = [
    [ming, '表白墙', '今天在图书馆看到一个穿白色卫衣的女生，笑起来很好看，想认识一下～', '["心动"]', '小明', 1, 2],
    [hong, '失物招领', '在东区食堂捡到一个黑色钱包，里面有学生卡，失主请联系我！', '["失物","钱包"]', '小红', 1, 0],
    [ming, '二手交易', '出一台九成新的机械键盘，青轴，100块带走，可小刀。', '["键盘","二手"]', '小明', 1, 0],
    [hong, '问答', '想问下大家，英语四级考试报名什么时候截止呀？', '["英语四级"]', '小红', 0, 0],
    [ming, '求助', '宿舍网速太慢了，有什么办法吗？急！', '["网速","求助"]', '小明', 0, 0],
  ];
  for (const [userId, category, content, tags, nickname, likes, views] of samples) {
    await pool.query(
      `INSERT INTO posts (user_id, category, content, tags, nickname, images, status, likes, views)
       VALUES ($1, $2, $3, $4, $5, '[]', 'approved', $6, $7)`,
      [userId, category, content, tags, nickname, likes, views]
    );
  }
  console.log('[db] 已写入种子数据（xiaoming / xiaohong，密码 123456，含示例帖子）');
}

// 板块与全体群聊的幂等初始化（每次启动都执行）
async function seedExtras() {
  for (const [name, icon, sortOrder, isActivity] of DEFAULT_CATEGORIES) {
    await pool.query(
      `INSERT INTO categories (name, icon, sort_order, is_activity) VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO NOTHING`,
      [name, icon, sortOrder, isActivity]
    );
  }

  // 只有管理员手动删除过的默认板块才不复活：用 categories_dismissed 记录删除动作
  const { rows: dismissed } = await pool.query(`SELECT name FROM categories_dismissed`);
  if (dismissed.length > 0) {
    const names = dismissed.map((r) => r.name);
    await pool.query(`DELETE FROM categories WHERE name = ANY($1)`, [names]);
  }

  // 全体成员群聊
  const { rows: groups } = await pool.query(`SELECT id FROM chat_groups WHERE is_all = TRUE ORDER BY id LIMIT 1`);
  let groupId = groups[0]?.id;
  if (!groupId) {
    const r = await pool.query(
      `INSERT INTO chat_groups (name, owner_uid, is_all) VALUES ($1, 'system', TRUE) RETURNING id`,
      [ALL_GROUP_NAME]
    );
    groupId = r.rows[0].id;
  }
  await pool.query(
    `INSERT INTO chat_group_members (group_id, user_uid, role)
     SELECT $1, uid, 'member' FROM users
     ON CONFLICT (group_id, user_uid) DO NOTHING`,
    [groupId]
  );
  // 历史用户补发金币默认值（新增列已有默认值，这里兜底）
  await pool.query(`UPDATE users SET coins = 100 WHERE coins IS NULL`);
}

async function init() {
  await pool.query(DDL);
  await pool.query(MIGRATIONS);
  // 板块删除记录表：用于避免默认板块被删后又自动复活
  await pool.query(`CREATE TABLE IF NOT EXISTS categories_dismissed (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')
  )`);
  // 回填历史用户 uid：created_at 毫秒时间戳 + id 保证唯一，补零到 16 位
  await pool.query(
    `UPDATE users SET uid = lpad(to_hex((extract(epoch from created_at::timestamp) * 1000)::bigint + id), 16, '0')
     WHERE uid IS NULL OR uid = ''`
  );
  await pool.query('ALTER TABLE users ALTER COLUMN uid SET NOT NULL');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS users_uid_unique ON users (uid)');
  await seed();
  await seedExtras().catch((e) => console.error('[db] 扩展种子数据失败:', e.message));
  const host = (() => {
    try { return new URL(DATABASE_URL).host; } catch { return ''; }
  })();
  console.log(`[db] PostgreSQL 连接成功${host ? `: ${host}` : ''}`);
}

db.ready = init().catch((err) => {
  console.error('[db] 数据库初始化失败:', err.message);
  throw err;
});
// 标记该 Promise 的拒绝已被观察，避免 Serverless 运行时把它当作未处理的拒绝而崩溃
db.ready.catch(() => {});

module.exports = db;
