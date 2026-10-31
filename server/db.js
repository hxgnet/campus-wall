require('dotenv').config();
const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

// node-pg 默认把 int8/COUNT 返回成字符串，前端要求是数字
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.error('[db] 错误：环境变量 DATABASE_URL 为空。请配置 Supabase → Project Settings → Database → Connection string 后重启服务。');
  process.exit(1);
}

// 解析连接串：sslmode=require 时显式开启 SSL，并从 URL 中移除该参数，
// 避免 pg-connection-string 的解析结果覆盖我们设置的 ssl 选项
function buildPoolConfig(rawUrl) {
  const cfg = {
    max: Number(process.env.PG_POOL_MAX) || 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
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
  return cfg;
}

const pool = new Pool(buildPoolConfig(DATABASE_URL));
pool.on('error', (err) => {
  // 空闲连接异常时不能静默，否则线上会表现为所有查询挂起
  console.error('[db] 连接池空闲连接错误:', err.message);
});

const LOCAL_NOW = `to_char(now() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD HH24:MI:SS')`;

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
          const result = await runner(text, normalizeParams(args));
          return result.rows[0];
        },
        async all(...args) {
          const result = await runner(text, normalizeParams(args));
          return result.rows;
        },
        async run(...args) {
          const result = await runner(text, normalizeParams(args));
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

const db = createFacade((text, params) => pool.query(text, params));
db.pool = pool;

// 事务：传入一个绑定到同一连接的 tx 门面
db.transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT ${LOCAL_NOW}
  );

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
`;

// ---------- 种子数据（空库时写入，保留原有测试账号与示例帖子）----------
async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*) AS c FROM users');
  if (rows[0].c > 0) return;

  const hash = await bcrypt.hash('123456', 10);
  const insertUser = async (username, nickname) => {
    const r = await pool.query(
      'INSERT INTO users (username, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id',
      [username, hash, nickname]
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

async function init() {
  await pool.query(DDL);
  await seed();
  const host = (() => {
    try { return new URL(DATABASE_URL).host; } catch { return ''; }
  })();
  console.log(`[db] PostgreSQL 连接成功${host ? `: ${host}` : ''}`);
}

db.ready = init().catch((err) => {
  console.error('[db] 数据库初始化失败:', err.message);
  process.exit(1);
});

module.exports = db;
