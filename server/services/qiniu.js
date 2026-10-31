// 七牛云对象存储上传服务
// 通过环境变量配置，未配置时不启用，图片存本地
// 需要配置的环境变量：
//   QINIU_ACCESS_KEY, QINIU_SECRET_KEY, QINIU_BUCKET, QINIU_DOMAIN
const config = require('../config');
const qiniu = config.qiniu.enabled ? require('qiniu') : null;

function getUploadToken() {
  if (!qiniu || !config.qiniu.enabled) return null;
  const mac = new qiniu.auth.digest.Mac(config.qiniu.accessKey, config.qiniu.secretKey);
  const putPolicy = new qiniu.rs.PutPolicy({ scope: config.qiniu.bucket });
  return putPolicy.uploadToken(mac);
}

function normalizeDomain(domain) {
  if (!domain) return '';
  if (/^https?:\/\//i.test(domain)) return domain.replace(/\/+$/, '');
  return 'https://' + domain.replace(/\/+$/, '');
}

async function uploadToQiniu(localPath, key) {
  if (!qiniu || !config.qiniu.enabled) return null;
  return new Promise((resolve, reject) => {
    const uploadToken = getUploadToken();
    const formUploader = new qiniu.form_up.FormUploader();
    const putExtra = new qiniu.form_up.PutExtra();
    formUploader.putFile(uploadToken, key, localPath, putExtra, (err, body) => {
      if (err) return reject(err);
      if (!body || !body.key) return reject(new Error('七牛云上传返回为空'));
      resolve(`${normalizeDomain(config.qiniu.domain)}/${body.key}`);
    });
  });
}

module.exports = { uploadToQiniu, enabled: config.qiniu.enabled };
