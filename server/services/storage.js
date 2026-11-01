// 通用文件存储适配器
// 优先级：Supabase Storage > 本地磁盘
// 调用方只需 saveFile(file, key)，file 为 multer 文件对象（含 buffer/originalname/mimetype）
const path = require('path');
const fs = require('fs');
const config = require('../config');


const provider = config.supabase.enabled ? 'supabase' : 'local';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};
function contentType(file) {
  if (file && file.mimetype) return file.mimetype;
  if (file && file.originalname) return MIME[path.extname(file.originalname).toLowerCase()] || 'application/octet-stream';
  return 'application/octet-stream';
}
function fileBuffer(file) {
  if (file && file.buffer) return file.buffer;
  // 兼容传入路径的情况（旧调用）
  if (typeof file === 'string') return fs.readFileSync(file);
  return file;
}
function fileName(file) {
  if (file && file.originalname) return file.originalname;
  if (typeof file === 'string') return path.basename(file);
  return 'file';
}

async function uploadSupabase(file, key) {
  const base = config.supabase.url.replace(/\/+$/, '');
  const objectPath = key.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${base}/storage/v1/object/${config.supabase.bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: config.supabase.serviceKey,
      Authorization: `Bearer ${config.supabase.serviceKey}`,
      'Content-Type': contentType(file),
      'x-upsert': 'true',
    },
    body: fileBuffer(file),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase 上传失败(${res.status}): ${text.slice(0, 200)}`);
  }
  return `${base}/storage/v1/object/public/${config.supabase.bucket}/${objectPath}`;
}

/**
 * 保存上传的文件
 * @param {object} file multer 文件对象（含 buffer/originalname/mimetype）或本地路径字符串
 * @param {string} key 对象键，如 posts/xxx.jpg
 * @returns {Promise<string>} 可访问 URL（云端）或 /uploads/xxx（本地）
 */
async function saveFile(file, key) {
  if (provider === 'supabase') {
    return await uploadSupabase(file, key);
  }
  // 本地存储：写入 uploads 目录
  const buf = fileBuffer(file);
  const filename = path.basename(key);
  const target = path.join(config.uploadsDir || '/tmp/uploads', filename);
  fs.writeFileSync(target, buf);
  return '/uploads/' + filename;
}

/**
 * 根据 URL 删除文件（本地或云端）
 */
async function deleteByUrl(url, uploadsDir) {
  try {
    if (!url) return;
    if (url.startsWith('/uploads/')) {
      const filename = url.replace('/uploads/', '');
      const target = path.join(uploadsDir, filename);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return;
    }
    if (provider === 'supabase') {
      const base = config.supabase.url.replace(/\/+$/, '');
      const prefix = `${base}/storage/v1/object/public/${config.supabase.bucket}/`;
      if (url.startsWith(prefix)) {
        const objectPath = url.slice(prefix.length);
        await fetch(`${base}/storage/v1/object/${config.supabase.bucket}/${objectPath}`, {
          method: 'DELETE',
          headers: {
            apikey: config.supabase.serviceKey,
            Authorization: `Bearer ${config.supabase.serviceKey}`,
          },
        });
      }
      return;
    }
  } catch (e) {
    console.error('删除文件失败:', e.message);
  }
}

module.exports = {
  saveFile,
  deleteByUrl,
  provider,
  remoteEnabled: provider !== 'local',
};
