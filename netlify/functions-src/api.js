// Netlify Function 入口：把 Express 应用包装成 Serverless Handler
// 打包命令见 package.json 的 build:fn（esbuild 输出到 netlify/functions/api.js）
const serverless = require('serverless-http');
const app = require('../../server/index.js');

const handler = serverless(app);

exports.handler = async (event, context) => {
  // Netlify 重写后的路径形如 /.netlify/functions/api/posts，需要还原成 Express 认识的 /api/posts
  const original = event.path || '/';
  let rest = original.replace(/^\/\.netlify\/functions\/api/, '');
  if (!rest.startsWith('/uploads')) {
    rest = '/api' + (rest.startsWith('/') ? rest : '/' + rest);
  }
  event.path = rest;

  // 数据库初始化失败时返回可诊断的 JSON，而不是让进程直接退出
  try {
    await app.ready;
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: '数据库连接失败', detail: err.message }),
    };
  }
  return handler(event, context);
};
