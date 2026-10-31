// 通用文件存储适配器
// 优先级：Supabase Storage > 本地磁盘
// 调用方只需 saveFile(localPath, key)，返回可访问的 URL
const path = require('path');
const fs = require('fs');
const config = require('../config');


const provider = config.supabase.enabled ? 'supabase' : 'local';

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};
function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function uploadSupabase(localPath, key) {
  const base = config.supabase.url.replace(/\/+$/, '');
  const objectPath = key.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${base}/storage/v1/object/${config.supabase.bucket}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: config.supabase.serviceKey,
      Authorization: `Bearer ${config.supabase.serviceKey}`,
      'Content-Type': contentType(localPath),
      'x-upsert': 'true',
    },
    body: fs.readFileSync(localPath),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase 上传失败(${res.status}): ${text.slice(0, 200)}`);
  }
  return `${base}/storage/v1/object/public/${config.supabase.bucket}/${objectPath}`;
}

/**
 * 保存上传的临时文件
 * @param {string} localPath multer 生成的本机绝对路径
 * @param {string} key 对象键，如 posts/xxx.jpg
 * @returns {Promise<string>} 可访问 URL（云端）或 /uploads/xxx（本地）
 */
async function saveFile(localPath, key) {
  if (provider === 'supabase') {
    const url = await uploadSupabase(localPath, key);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    return url;
  }
  return '/uploads/' + path.basename(localPath);
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
