// Vercel Node Function 入口：把现有 Express 应用直接作为请求处理器
const app = require('../server/index.js');

module.exports = async (req, res) => {
  try {
    await app.ready;
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: '数据库连接失败', detail: err.message }));
    return;
  }
  return app(req, res);
};
