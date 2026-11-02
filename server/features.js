const express = require('express');

// 扩展功能路由：板块管理、操作审计、群聊、红包、金币转账、表情包、
// 注销审批、超级管理员改名 / 标签、帖子访问数据、媒体上传、版本信息。
module.exports.register = function register(ctx) {
  const {
    app, db, auth, adminAuth, superAuth, mediaUpload, upload,
    fileStorage, uploadsDir, notify, NOW_TEXT, logAdminAction, parseMedia, mediaKind,
  } = ctx;

  const router = express.Router();
  // 优先使用部署平台提供的部署标识，避免 Serverless 冷启动导致版本号频繁变化
  const BOOT_AT = process.env.DEPLOY_ID || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.NETLIFY_DEPLOY_ID || process.env.COMMIT_REF
    || `local-${new Date().toISOString().slice(0, 10)}`;

  // ---------- 版本信息（WebIntoApp 打包 APK 后用于检测更新） ----------
  router.get('/version', (req, res) => {
    res.json({ version: BOOT_AT, time: new Date().toISOString() });
  });

  // ---------- 活动报名 ----------
  router.post('/posts/:id/signup', auth, async (req, res) => {
    const post = await db.prepare(
      `SELECT id, category, activity_signup_required, activity_signup_deadline, status FROM posts WHERE id = ?`
    ).get(req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    if (!post.activity_signup_required) return res.status(400).json({ error: '该活动无需报名' });
    if (post.status !== 'approved') return res.status(400).json({ error: '活动尚未通过审核' });
    if (post.activity_signup_deadline && new Date(post.activity_signup_deadline.replace(' ', 'T')) < new Date()) {
      return res.status(400).json({ error: '报名已截止' });
    }
    await db.prepare(
      `INSERT INTO activity_signups (post_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`
    ).run(post.id, req.user.dbId);
    const count = (await db.prepare(`SELECT COUNT(*) AS c FROM activity_signups WHERE post_id = ?`).get(post.id)).c;
    res.json({ ok: true, signedUp: true, count });
  });

  router.delete('/posts/:id/signup', auth, async (req, res) => {
    await db.prepare(`DELETE FROM activity_signups WHERE post_id = ? AND user_id = ?`).run(req.params.id, req.user.dbId);
    const count = (await db.prepare(`SELECT COUNT(*) AS c FROM activity_signups WHERE post_id = ?`).get(req.params.id)).c;
    res.json({ ok: true, signedUp: false, count });
  });

  // ---------- 公开：板块列表 ----------
  router.get('/categories', async (req, res) => {
    const list = await db.prepare(
      `SELECT id, name, icon, sort_order, is_activity FROM categories ORDER BY sort_order, id`
    ).all();
    res.json(list);
  });

  // ---------- 媒体上传（帖子 / 评论 / 私信 / 表情包通用） ----------
  router.post('/upload/media', auth, mediaUpload.array('files', 9), async (req, res) => {
    const files = req.files || [];
    const media = [];
    try {
      for (const f of files) {
        media.push({
          type: mediaKind(f.mimetype),
          url: await fileStorage.saveFile(
            f,
            `media/${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${f.originalname}`
          ),
        });
      }
    } catch (e) {
      console.error('[upload] 媒体保存失败:', e.message);
      return res.status(500).json({ error: '媒体上传失败' });
    }
    res.json({ files: media, url: media[0] ? media[0].url : null, type: media[0] ? media[0].type : null });
  });

  // 超级管理员上传图片（用于超级通知）
  router.post('/admin/upload', superAuth, mediaUpload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请选择图片' });
    if (!/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: '只允许上传图片' });
    const url = await fileStorage.saveFile(
      req.file,
      `notices/${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${req.file.originalname}`
    );
    res.json({ url, type: 'image' });
  });

  // ---------- 用户表情包 ----------
  router.get('/stickers', auth, async (req, res) => {
    const list = await db.prepare(
      `SELECT id, url, name, created_at FROM user_stickers WHERE user_id = ? ORDER BY id DESC`
    ).all(req.user.dbId);
    res.json(list);
  });

  router.post('/stickers', auth, async (req, res) => {
    const url = String(req.body.url || '').trim();
    const name = String(req.body.name || '').slice(0, 30);
    if (!url || (!url.startsWith('/uploads/') && !/^https?:\/\//.test(url))) {
      return res.status(400).json({ error: '表情包地址无效' });
    }
    const count = (await db.prepare(`SELECT COUNT(*) AS c FROM user_stickers WHERE user_id = ?`).get(req.user.dbId)).c;
    if (count >= 60) return res.status(400).json({ error: '表情包最多保存 60 个' });
    const r = await db.prepare(
      `INSERT INTO user_stickers (user_id, url, name) VALUES (?, ?, ?) RETURNING id`
    ).run(req.user.dbId, url, name);
    res.json({ id: r.lastInsertRowid });
  });

  router.delete('/stickers/:id', auth, async (req, res) => {
    await db.prepare(`DELETE FROM user_stickers WHERE id = ? AND user_id = ?`).run(req.params.id, req.user.dbId);
    res.json({ ok: true });
  });

  // ---------- 金币转账 ----------
  router.get('/coins', auth, async (req, res) => {
    const me = await db.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId);
    const sent = await db.prepare(
      `SELECT t.*, (SELECT nickname FROM users WHERE uid = t.to_uid) AS peer_nickname
       FROM coin_transfers t WHERE t.from_uid = ? ORDER BY t.id DESC LIMIT 50`
    ).all(req.user.uid);
    const received = await db.prepare(
      `SELECT t.*, (SELECT nickname FROM users WHERE uid = t.from_uid) AS peer_nickname
       FROM coin_transfers t WHERE t.to_uid = ? ORDER BY t.id DESC LIMIT 50`
    ).all(req.user.uid);
    res.json({ coins: me ? me.coins : 0, sent, received });
  });

  router.post('/coins/transfer', auth, async (req, res) => {
    const to = String(req.body.to || '').trim();
    const amount = Number(req.body.amount);
    const note = String(req.body.note || '').slice(0, 60);
    if (!to) return res.status(400).json({ error: '请选择收款用户' });
    if (!Number.isInteger(amount) || amount <= 0 || amount > 100000) {
      return res.status(400).json({ error: '转账金额必须为 1-100000 的整数' });
    }
    if (to === req.user.uid) return res.status(400).json({ error: '不能给自己转账' });
    const peer = await db.prepare(`SELECT id, uid, nickname FROM users WHERE uid = ?`).get(to);
    if (!peer) return res.status(404).json({ error: '用户不存在' });
    const me = await db.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId);
    if (!me || Number(me.coins) < amount) return res.status(400).json({ error: '金币不足' });
    let balance = 0;
    await db.transaction(async (tx) => {
      await tx.prepare(`UPDATE users SET coins = coins - ? WHERE id = ?`).run(amount, req.user.dbId);
      await tx.prepare(`UPDATE users SET coins = coins + ? WHERE id = ?`).run(amount, peer.id);
      await tx.prepare(
        `INSERT INTO coin_transfers (from_uid, to_uid, amount, note) VALUES (?, ?, ?, ?) RETURNING id`
      ).run(req.user.uid, peer.uid, amount, note);
      balance = (await tx.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId)).coins;
    });
    await notify(peer.id, 'system', req.user.uid, null, `收到 ${amount} 金币转账${note ? `：${note}` : ''}`);
    res.json({ ok: true, coins: balance });
  });

  // ---------- 群聊 ----------
  async function ensureAllGroupMember(uid) {
    try {
      await db.prepare(
        `INSERT INTO chat_group_members (group_id, user_uid, role)
         SELECT id, ?, 'member' FROM chat_groups WHERE is_all = TRUE ON CONFLICT DO NOTHING`
      ).run(uid);
    } catch (e) {
      console.error('[group] 自动加入全体群失败:', e.message);
    }
  }

  async function assertMember(groupId, uid) {
    const member = await db.prepare(
      `SELECT role FROM chat_group_members WHERE group_id = ? AND user_uid = ?`
    ).get(groupId, uid);
    return member;
  }

  router.get('/groups', auth, async (req, res) => {
    await ensureAllGroupMember(req.user.uid);
    const list = await db.prepare(
      `SELECT g.id, g.name, g.avatar, g.is_all, g.owner_uid, g.created_at,
              (SELECT COUNT(*) FROM chat_group_members cm2 WHERE cm2.group_id = g.id) AS member_count,
              (SELECT gm.content FROM group_messages gm WHERE gm.group_id = g.id ORDER BY gm.id DESC LIMIT 1) AS last_content,
              (SELECT gm.share_type FROM group_messages gm WHERE gm.group_id = g.id ORDER BY gm.id DESC LIMIT 1) AS last_share_type,
              (SELECT gm.media FROM group_messages gm WHERE gm.group_id = g.id ORDER BY gm.id DESC LIMIT 1) AS last_media,
              (SELECT gm.created_at FROM group_messages gm WHERE gm.group_id = g.id ORDER BY gm.id DESC LIMIT 1) AS last_time,
              (SELECT COUNT(*) FROM group_messages gm WHERE gm.group_id = g.id
                 AND gm.created_at > COALESCE(m.last_read_at, '1970-01-01 00:00:00')
                 AND gm.from_uid <> ?) AS unread
       FROM chat_groups g JOIN chat_group_members m ON m.group_id = g.id AND m.user_uid = ?
       ORDER BY g.is_all DESC, g.id ASC`
    ).all(req.user.uid, req.user.uid);
    res.json(list);
  });

  router.post('/groups', auth, async (req, res) => {
    const name = String(req.body.name || '').trim();
    if (name.length < 1 || name.length > 30) return res.status(400).json({ error: '群名称需 1-30 个字符' });
    const memberUids = Array.isArray(req.body.memberUids)
      ? [...new Set(req.body.memberUids.filter((u) => typeof u === 'string' && u && u !== req.user.uid))].slice(0, 50)
      : [];
    let groupId = null;
    await db.transaction(async (tx) => {
      const g = await tx.prepare(
        `INSERT INTO chat_groups (name, owner_uid) VALUES (?, ?) RETURNING id`
      ).run(name, req.user.uid);
      groupId = g.lastInsertRowid;
      await tx.prepare(
        `INSERT INTO chat_group_members (group_id, user_uid, role) VALUES (?, ?, 'owner') ON CONFLICT DO NOTHING`
      ).run(groupId, req.user.uid);
      for (const uid of memberUids) {
        const u = await tx.prepare(`SELECT id FROM users WHERE uid = ?`).get(uid);
        if (u) {
          await tx.prepare(
            `INSERT INTO chat_group_members (group_id, user_uid, role) VALUES (?, ?, 'member') ON CONFLICT DO NOTHING`
          ).run(groupId, uid);
        }
      }
    });
    res.json({ id: groupId });
  });

  router.get('/groups/:id', auth, async (req, res) => {
    const group = await db.prepare(
      `SELECT id, name, avatar, is_all, owner_uid, created_at FROM chat_groups WHERE id = ?`
    ).get(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    const members = await db.prepare(
      `SELECT m.user_uid AS uid, m.role, m.joined_at, u.nickname, u.avatar, u.username
       FROM chat_group_members m LEFT JOIN users u ON u.uid = m.user_uid
       WHERE m.group_id = ? ORDER BY (m.role = 'owner') DESC, m.id ASC`
    ).all(req.params.id);
    const isMember = members.some((m) => m.uid === req.user.uid);
    res.json({ group, members, isMember });
  });

  router.post('/groups/:id/join', auth, async (req, res) => {
    const group = await db.prepare(`SELECT id FROM chat_groups WHERE id = ?`).get(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    await db.prepare(
      `INSERT INTO chat_group_members (group_id, user_uid, role) VALUES (?, ?, 'member') ON CONFLICT DO NOTHING`
    ).run(req.params.id, req.user.uid);
    res.json({ ok: true });
  });

  router.post('/groups/:id/leave', auth, async (req, res) => {
    const group = await db.prepare(`SELECT id, is_all FROM chat_groups WHERE id = ?`).get(req.params.id);
    if (!group) return res.status(404).json({ error: '群聊不存在' });
    if (group.is_all) return res.status(400).json({ error: '不能退出全体成员群聊' });
    await db.prepare(`DELETE FROM chat_group_members WHERE group_id = ? AND user_uid = ?`).run(req.params.id, req.user.uid);
    res.json({ ok: true });
  });

  router.post('/groups/:id/read', auth, async (req, res) => {
    await db.prepare(
      `UPDATE chat_group_members SET last_read_at = ${NOW_TEXT} WHERE group_id = ? AND user_uid = ?`
    ).run(req.params.id, req.user.uid);
    res.json({ ok: true });
  });

  async function attachShares(list, viewerUid) {
    const packetIds = list.filter((m) => m.share_type === 'redpacket' && m.share_id).map((m) => Number(m.share_id));
    const packetMap = new Map();
    if (packetIds.length) {
      const packets = await db.prepare(
        `SELECT * FROM red_packets WHERE id IN (${packetIds.map(() => '?').join(',')})`
      ).all(...packetIds);
      const claims = await db.prepare(
        `SELECT * FROM red_packet_claims WHERE claimer_uid = ? AND packet_id IN (${packetIds.map(() => '?').join(',')})`
      ).all(viewerUid, ...packetIds);
      const mine = new Map(claims.map((c) => [c.packet_id, c.amount]));
      for (const p of packets) {
        packetMap.set(p.id, {
          id: p.id,
          note: p.note,
          total: p.total,
          remaining: p.remaining,
          count: p.count,
          remaining_count: p.remaining_count,
          sender_uid: p.sender_uid,
          my_amount: mine.has(p.id) ? mine.get(p.id) : null,
        });
      }
    }
    const postIds = list.filter((m) => m.share_type === 'post' && m.share_id).map((m) => Number(m.share_id));
    const postMap = new Map();
    if (postIds.length) {
      const posts = await db.prepare(
        `SELECT id, content, category, nickname FROM posts WHERE id IN (${postIds.map(() => '?').join(',')})`
      ).all(...postIds);
      posts.forEach((p) => postMap.set(p.id, p));
    }
    const profileUids = list.filter((m) => m.share_type === 'profile' && m.share_id).map((m) => m.share_id);
    const profileMap = new Map();
    if (profileUids.length) {
      const users = await db.prepare(
        `SELECT uid, nickname, avatar FROM users WHERE uid IN (${profileUids.map(() => '?').join(',')})`
      ).all(...profileUids);
      users.forEach((u) => profileMap.set(u.uid, u));
    }
    list.forEach((m) => {
      m.media = parseMedia(m.media);
      if (m.share_type === 'redpacket') {
        m.share = { type: 'redpacket', packet: packetMap.get(Number(m.share_id)) || null };
      } else if (m.share_type === 'post') {
        const p = postMap.get(Number(m.share_id));
        m.share = { type: 'post', id: Number(m.share_id), post: p || null };
      } else if (m.share_type === 'profile') {
        const u = profileMap.get(m.share_id);
        m.share = { type: 'profile', id: m.share_id, user: u || null };
      }
    });
  }

  router.get('/groups/:id/messages', auth, async (req, res) => {
    const member = await assertMember(req.params.id, req.user.uid);
    if (!member) return res.status(403).json({ error: '你不在该群聊中' });
    await db.prepare(
      `UPDATE chat_group_members SET last_read_at = ${NOW_TEXT} WHERE group_id = ? AND user_uid = ?`
    ).run(req.params.id, req.user.uid);
    const list = await db.prepare(
      `SELECT gm.id, gm.group_id, gm.from_uid, gm.content, gm.media, gm.share_type, gm.share_id, gm.created_at,
              u.nickname, u.avatar, u.custom_tag, u.tag_color
       FROM group_messages gm LEFT JOIN users u ON u.uid = gm.from_uid
       WHERE gm.group_id = ? ORDER BY gm.id ASC LIMIT 500`
    ).all(req.params.id);
    await attachShares(list, req.user.uid);
    res.json(list);
  });

  router.post('/groups/:id/messages', auth, async (req, res) => {
    const member = await assertMember(req.params.id, req.user.uid);
    if (!member) return res.status(403).json({ error: '你不在该群聊中' });
    const content = String(req.body.content || '').trim();
    const media = parseMedia(req.body.media);
    const shareType = req.body.shareType ? String(req.body.shareType) : null;
    const shareId = req.body.shareId ? String(req.body.shareId) : null;
    if (!content && media.length === 0 && !(shareType && shareId)) {
      return res.status(400).json({ error: '消息内容不能为空' });
    }
    if (content.length > 2000) return res.status(400).json({ error: '消息不能超过 2000 字' });
    const r = await db.prepare(
      `INSERT INTO group_messages (group_id, from_uid, content, media, share_type, share_id)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).run(req.params.id, req.user.uid, content, JSON.stringify(media), shareType, shareId);
    res.json({ id: r.lastInsertRowid });
  });

  // ---------- 群红包 ----------
  router.post('/groups/:id/redpacket', auth, async (req, res) => {
    const member = await assertMember(req.params.id, req.user.uid);
    if (!member) return res.status(403).json({ error: '你不在该群聊中' });
    const total = Number(req.body.total);
    const count = Number(req.body.count);
    const note = String(req.body.note || '恭喜发财，大吉大利').slice(0, 60);
    if (!Number.isInteger(total) || total <= 0 || total > 100000) {
      return res.status(400).json({ error: '红包总金币需为 1-100000 的整数' });
    }
    if (!Number.isInteger(count) || count <= 0 || count > 100 || count > total) {
      return res.status(400).json({ error: '红包个数需为 1-100 且不超过总金币' });
    }
    const me = await db.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId);
    if (!me || Number(me.coins) < total) return res.status(400).json({ error: '金币不足' });
    let packetId = null;
    let messageId = null;
    let balance = 0;
    await db.transaction(async (tx) => {
      await tx.prepare(`UPDATE users SET coins = coins - ? WHERE id = ?`).run(total, req.user.dbId);
      const p = await tx.prepare(
        `INSERT INTO red_packets (group_id, sender_uid, note, total, remaining, count, remaining_count)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
      ).run(req.params.id, req.user.uid, note, total, total, count, count);
      packetId = p.lastInsertRowid;
      const m = await tx.prepare(
        `INSERT INTO group_messages (group_id, from_uid, content, share_type, share_id)
         VALUES (?, ?, ?, 'redpacket', ?) RETURNING id`
      ).run(req.params.id, req.user.uid, `[红包] ${note}`, packetId);
      messageId = m.lastInsertRowid;
      balance = (await tx.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId)).coins;
    });
    res.json({ id: packetId, messageId, coins: balance });
  });

  router.post('/redpackets/:id/claim', auth, async (req, res) => {
    const packet = await db.prepare(`SELECT * FROM red_packets WHERE id = ?`).get(req.params.id);
    if (!packet) return res.status(404).json({ error: '红包不存在' });
    const member = await assertMember(packet.group_id, req.user.uid);
    if (!member) return res.status(403).json({ error: '你不在该群聊中' });
    const existing = await db.prepare(
      `SELECT amount FROM red_packet_claims WHERE packet_id = ? AND claimer_uid = ?`
    ).get(packet.id, req.user.uid);
    if (existing) {
      const coins = (await db.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId)).coins;
      return res.json({ ok: true, amount: existing.amount, already: true, coins });
    }
    if (Number(packet.remaining_count) <= 0 || Number(packet.remaining) <= 0) {
      return res.status(400).json({ error: '红包已被抢光' });
    }
    const remainingCount = Number(packet.remaining_count);
    const remaining = Number(packet.remaining);
    let amount = Math.floor(remaining / remainingCount);
    if (remainingCount > 1 && remaining > amount * remainingCount) {
      amount += Math.floor(Math.random() * (remaining - amount * remainingCount + 1));
    }
    amount = Math.max(1, Math.min(amount, remaining - (remainingCount - 1)));
    let coins = 0;
    await db.transaction(async (tx) => {
      await tx.prepare(
        `UPDATE red_packets SET remaining = remaining - ?, remaining_count = remaining_count - 1 WHERE id = ?`
      ).run(amount, packet.id);
      await tx.prepare(
        `INSERT INTO red_packet_claims (packet_id, claimer_uid, amount) VALUES (?, ?, ?) RETURNING id`
      ).run(packet.id, req.user.uid, amount);
      await tx.prepare(`UPDATE users SET coins = coins + ? WHERE id = ?`).run(amount, req.user.dbId);
      coins = (await tx.prepare(`SELECT coins FROM users WHERE id = ?`).get(req.user.dbId)).coins;
    });
    const sender = await db.prepare(`SELECT id FROM users WHERE uid = ?`).get(packet.sender_uid);
    if (sender) await notify(sender.id, 'system', req.user.uid, null, `有人领取了你的红包（${amount} 金币）`);
    res.json({ ok: true, amount, already: false, coins });
  });

  router.get('/groups/:id/redpackets', auth, async (req, res) => {
    const packets = await db.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM red_packet_claims c WHERE c.packet_id = p.id) AS claimed_count,
              (SELECT amount FROM red_packet_claims c WHERE c.packet_id = p.id AND c.claimer_uid = ?) AS my_amount
       FROM red_packets p WHERE p.group_id = ? ORDER BY p.id DESC LIMIT 30`
    ).all(req.user.uid, req.params.id);
    res.json(packets);
  });

  // ---------- 注销申请（智学网卷子图片 + 超管审批） ----------
  async function saveDeletionImages(files) {
    const urls = [];
    for (const f of files || []) {
      urls.push(await fileStorage.saveFile(
        f,
        `deletion/${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${f.originalname}`
      ));
    }
    return urls;
  }

  router.post('/auth/account/request', auth, mediaUpload.array('images', 3), async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: '请上传一张智学网卷子图片' });
    if (files.some((f) => !/^image\//.test(f.mimetype))) return res.status(400).json({ error: '只允许上传图片' });
    const note = String(req.body.note || '').slice(0, 500);
    const images = await saveDeletionImages(files);
    const pending = await db.prepare(
      `SELECT id FROM deletion_requests WHERE user_id = ? AND status = 'pending'`
    ).get(req.user.dbId);
    if (pending) {
      await db.prepare(`UPDATE deletion_requests SET images = ?, note = ? WHERE id = ?`)
        .run(JSON.stringify(images), note, pending.id);
      return res.json({ id: pending.id, updated: true });
    }
    const r = await db.prepare(
      `INSERT INTO deletion_requests (user_id, images, note) VALUES (?, ?, ?) RETURNING id`
    ).run(req.user.dbId, JSON.stringify(images), note);
    res.json({ id: r.lastInsertRowid });
  });

  router.get('/auth/account/request', auth, async (req, res) => {
    const rows = await db.prepare(
      `SELECT id, images, note, status, admin_note, created_at FROM deletion_requests
       WHERE user_id = ? ORDER BY id DESC LIMIT 5`
    ).all(req.user.dbId);
    rows.forEach((r) => { r.images = r.images ? JSON.parse(r.images) : []; });
    res.json(rows);
  });

  router.get('/admin/deletion-requests', superAuth, async (req, res) => {
    const status = String(req.query.status || 'pending');
    const where = status === 'all' ? '' : 'WHERE d.status = ?';
    const params = status === 'all' ? [] : [status];
    const rows = await db.prepare(
      `SELECT d.*, u.uid, u.username, u.nickname, u.avatar, u.real_name, u.class_name,
              u.grade, u.tag, u.reputation, u.banned
       FROM deletion_requests d JOIN users u ON u.id = d.user_id
       ${where} ORDER BY d.id DESC LIMIT 100`
    ).all(...params);
    rows.forEach((r) => { r.images = r.images ? JSON.parse(r.images) : []; });
    res.json(rows);
  });

  async function deleteUserAccount(userId, uid) {
    await db.transaction(async (tx) => {
      await tx.prepare(`DELETE FROM notifications WHERE user_id = ?`).run(userId);
      await tx.prepare(`DELETE FROM follows WHERE follower_id = ? OR following_id = ?`).run(userId, userId);
      await tx.prepare(`DELETE FROM friends WHERE requester_uid = ? OR addressee_uid = ?`).run(uid, uid);
      await tx.prepare(`DELETE FROM messages WHERE from_uid = ? OR to_uid = ?`).run(uid, uid);
      await tx.prepare(`DELETE FROM group_messages WHERE from_uid = ?`).run(uid);
      await tx.prepare(`DELETE FROM chat_group_members WHERE user_uid = ?`).run(uid);
      await tx.prepare(`DELETE FROM coin_transfers WHERE from_uid = ? OR to_uid = ?`).run(uid, uid);
      await tx.prepare(`DELETE FROM reports WHERE user_id = ?`).run(userId);
      await tx.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    });
  }

  router.put('/admin/deletion-requests/:id', superAuth, async (req, res) => {
    const status = String(req.body.status || '');
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: '无效的注销处理状态' });
    }
    const note = String(req.body.admin_note || '').slice(0, 500);
    const request = await db.prepare(
      `SELECT d.*, u.uid, u.id AS user_id FROM deletion_requests d JOIN users u ON u.id = d.user_id WHERE d.id = ?`
    ).get(req.params.id);
    if (!request) return res.status(404).json({ error: '注销申请不存在' });
    await db.prepare(
      `UPDATE deletion_requests SET status = ?, admin_note = ? WHERE id = ?`
    ).run(status, note, req.params.id);

    if (status === 'approved') {
      await deleteUserAccount(request.user_id, request.uid);
      await logAdminAction(req, 'approve_account_deletion', 'user', request.uid, note, '已删除账号及关联数据');
      return res.json({ ok: true, deleted: true });
    }
    if (status === 'rejected') {
      await notify(request.user_id, 'system', 'system', null,
        `你的注销申请未通过${note ? `，理由：${note}` : ''}`);
    }
    await logAdminAction(req, `account_deletion_${status}`, 'user', request.uid, note, '');
    res.json({ ok: true, deleted: false });
  });

  // ---------- 超级管理员：修改用户名 ----------
  router.put('/admin/users/:uid/username', superAuth, async (req, res) => {
    const username = String(req.body.username || '').trim();
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名需 3-20 位' });
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
      return res.status(400).json({ error: '用户名只能包含中英文、数字和下划线' });
    }
    const user = await db.prepare(`SELECT id, uid, username FROM users WHERE uid = ?`).get(req.params.uid);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const exists = await db.prepare(`SELECT id FROM users WHERE username = ? AND id <> ?`).get(username, user.id);
    if (exists) return res.status(400).json({ error: '该用户名已被占用' });
    await db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run(username, user.id);
    await notify(user.id, 'system', 'system', null,
      `超级管理员已将你的用户名修改为 @${username}（原用户名：@${user.username}）`);
    await logAdminAction(req, 'change_username', 'user', user.uid, `${user.username} → ${username}`, '');
    res.json({ ok: true, username });
  });

  // ---------- 超级管理员：自定义标签与颜色 ----------
  router.put('/admin/users/:uid/tags', superAuth, async (req, res) => {
    const user = await db.prepare(`SELECT id, uid, nickname, custom_tag, tag_color FROM users WHERE uid = ?`).get(req.params.uid);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const customTag = req.body.custom_tag === undefined ? user.custom_tag : String(req.body.custom_tag || '').slice(0, 12);
    if (req.body.tag_color !== undefined && req.body.tag_color !== '' && !/^#[0-9a-fA-F]{6}$/.test(String(req.body.tag_color))) {
      return res.status(400).json({ error: '标签颜色需为 #RRGGBB 格式' });
    }
    const tagColor = req.body.tag_color === undefined
      ? user.tag_color
      : (req.body.tag_color === '' ? null : String(req.body.tag_color));
    await db.prepare(`UPDATE users SET custom_tag = ?, tag_color = ? WHERE id = ?`)
      .run(customTag || null, tagColor || null, user.id);
    await notify(user.id, 'system', 'system', null,
      `超级管理员为你设置了新标签${customTag ? `：${customTag}` : '（已清除）'}`);
    await logAdminAction(req, 'set_user_tag', 'user', user.uid, customTag || '', tagColor || '');
    res.json({ ok: true, custom_tag: customTag || null, tag_color: tagColor || null });
  });

  // ---------- 超管查看帖子访问数据 ----------
  router.get('/admin/posts/:id/analytics', superAuth, async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: '帖子不存在' });
    const post = await db.prepare(`SELECT id, content, category, likes, views, user_id FROM posts WHERE id = ?`).get(req.params.id);
    if (!post) return res.status(404).json({ error: '帖子不存在' });
    const viewers = await db.prepare(
      `SELECT v.viewer_uid AS uid, v.view_count, v.last_viewed_at,
              u.username, u.nickname, u.avatar
       FROM post_views v LEFT JOIN users u ON u.uid = v.viewer_uid
       WHERE v.post_id = ? ORDER BY v.view_count DESC`
    ).all(req.params.id);
    const likes = await db.prepare(
      `SELECT u.uid, u.username, u.nickname, u.avatar, l.created_at
       FROM likes l LEFT JOIN users u ON u.id = l.user_id
       WHERE l.post_id = ? ORDER BY l.id DESC`
    ).all(req.params.id);
    const favorites = await db.prepare(
      `SELECT u.uid, u.username, u.nickname, u.avatar, f.created_at
       FROM favorites f LEFT JOIN users u ON u.id = f.user_id
       WHERE f.post_id = ? ORDER BY f.id DESC`
    ).all(req.params.id);
    const commenters = await db.prepare(
      `SELECT u.uid, u.username, u.nickname, u.avatar, COUNT(*) AS count, MAX(c.created_at) AS last_at
       FROM comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.post_id = ? GROUP BY u.uid, u.username, u.nickname, u.avatar
       ORDER BY count DESC`
    ).all(req.params.id);
    res.json({
      post,
      viewers,
      likes,
      favorites,
      commenters,
      summary: {
        view_users: viewers.length,
        view_times: viewers.reduce((s, v) => s + Number(v.view_count || 0), 0),
        likes: likes.length,
        favorites: favorites.length,
        commenters: commenters.length,
      },
    });
  });

  // ---------- 管理操作记录 ----------
  router.get('/admin/logs', adminAuth, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const list = await db.prepare(
      `SELECT id, admin_role, admin_name, action, target_type, target_id, reason, detail, created_at
       FROM admin_logs ORDER BY id DESC LIMIT ?`
    ).all(limit);
    res.json(list);
  });

  // ---------- 我的帖子（含被拒绝的审核理由） ----------
  router.get('/my/posts', auth, async (req, res) => {
    const list = await db.prepare(
      `SELECT p.id, p.category, p.content, p.media, p.images, p.tags, p.status, p.review_note,
              p.likes, p.views, p.created_at, p.is_anonymous
       FROM posts p WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 100`
    ).all(req.user.dbId);
    list.forEach((p) => {
      p.media = parseMedia(p.media);
      try { p.images = p.images ? JSON.parse(p.images) : []; } catch { p.images = []; }
      try { p.tags = p.tags ? JSON.parse(p.tags) : []; } catch { p.tags = []; }
    });
    res.json(list);
  });

  // ---------- 板块管理（超级管理员） ----------
  router.get('/admin/categories', superAuth, async (req, res) => {
    const list = await db.prepare(
      `SELECT c.id, c.name, c.icon, c.sort_order, c.is_activity, c.created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.category = c.name) AS post_count
       FROM categories c ORDER BY c.sort_order, c.id`
    ).all();
    res.json(list);
  });

  router.post('/admin/categories', superAuth, async (req, res) => {
    const name = String(req.body.name || '').trim();
    const icon = String(req.body.icon || '📝').slice(0, 4) || '📝';
    const sortOrder = Number(req.body.sort_order) || 0;
    const isActivity = req.body.is_activity === true || req.body.is_activity === 'true' || req.body.is_activity === 1;
    if (name.length < 1 || name.length > 12) return res.status(400).json({ error: '板块名称需 1-12 个字符' });
    const exists = await db.prepare(`SELECT id FROM categories WHERE name = ?`).get(name);
    if (exists) return res.status(400).json({ error: '板块已存在' });
    // 允许重新创建此前被删除的默认板块
    await db.prepare(`DELETE FROM categories_dismissed WHERE name = ?`).run(name);
    const r = await db.prepare(
      `INSERT INTO categories (name, icon, sort_order, is_activity) VALUES (?, ?, ?, ?) RETURNING id`
    ).run(name, icon, sortOrder, isActivity);
    await logAdminAction(req, 'create_category', 'category', r.lastInsertRowid, name, '');
    res.json({ id: r.lastInsertRowid });
  });

  router.put('/admin/categories/:id', superAuth, async (req, res) => {
    const cat = await db.prepare(`SELECT id, name FROM categories WHERE id = ?`).get(req.params.id);
    if (!cat) return res.status(404).json({ error: '板块不存在' });
    const name = req.body.name === undefined ? cat.name : String(req.body.name || '').trim();
    if (name.length < 1 || name.length > 12) return res.status(400).json({ error: '板块名称需 1-12 个字符' });
    if (name !== cat.name) {
      const exists = await db.prepare(`SELECT id FROM categories WHERE name = ? AND id <> ?`).get(name, cat.id);
      if (exists) return res.status(400).json({ error: '板块名称已存在' });
    }
    const sets = [];
    const params = [];
    if (req.body.name !== undefined && name !== cat.name) {
      sets.push('name = ?');
      params.push(name);
    }
    if (req.body.icon !== undefined) { sets.push('icon = ?'); params.push(String(req.body.icon || '📝').slice(0, 4) || '📝'); }
    if (req.body.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(Number(req.body.sort_order) || 0); }
    if (req.body.is_activity !== undefined) {
      sets.push('is_activity = ?');
      params.push(req.body.is_activity === true || req.body.is_activity === 'true' || req.body.is_activity === 1);
    }
    if (sets.length === 0) return res.json({ ok: true });
    params.push(cat.id);
    await db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    if (name !== cat.name) {
      await db.prepare(`UPDATE posts SET category = ? WHERE category = ?`).run(name, cat.name);
    }
    await logAdminAction(req, 'update_category', 'category', cat.id, cat.name, name);
    res.json({ ok: true });
  });

  router.delete('/admin/categories/:id', superAuth, async (req, res) => {
    const cat = await db.prepare(`SELECT id, name FROM categories WHERE id = ?`).get(req.params.id);
    if (!cat) return res.status(404).json({ error: '板块不存在' });
    const fallback = await db.prepare(
      `SELECT name FROM categories WHERE id <> ? ORDER BY sort_order, id LIMIT 1`
    ).get(cat.id);
    if (!fallback) return res.status(400).json({ error: '至少需要保留一个板块' });
    await db.prepare(`UPDATE posts SET category = ? WHERE category = ?`).run(fallback.name, cat.name);
    await db.prepare(`DELETE FROM categories WHERE id = ?`).run(cat.id);
    await db.prepare(`INSERT INTO categories_dismissed (name) VALUES (?) ON CONFLICT DO NOTHING`).run(cat.name);
    await logAdminAction(req, 'delete_category', 'category', cat.id, cat.name, `帖子已迁移至「${fallback.name}」`);
    res.json({ ok: true, moved_to: fallback.name });
  });

  app.use('/api', router);
};

module.exports._internals = {};
