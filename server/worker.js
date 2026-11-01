// Cloudflare Worker 入口：手动适配 Express 到 Workers fetch 生命周期
import { IncomingMessage, ServerResponse } from 'node:http';

// ESM 环境下 __dirname 不存在，补一个
globalThis.__dirname = '.';
globalThis.__filename = 'worker.js';

let cachedApp = null;

async function getApp(env) {
  if (cachedApp) return cachedApp;
  for (const k of Object.keys(env)) process.env[k] = env[k];
  const { default: app } = await import('./index.js');
  await app.ready;
  cachedApp = app;
  return app;
}

// 将 Web Request 转为 Node IncomingMessage，并捕获 ServerResponse 输出为 Web Response
async function runExpress(app, request) {
  const url = new URL(request.url);
  const headers = {};
  for (const [k, v] of request.headers) headers[k] = v;

  const req = new IncomingMessage(null);
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = headers;
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.httpVersion = '1.1';

  const res = new ServerResponse(req);
  const chunks = [];
  let ended = false;
  let responseResolve;
  const responsePromise = new Promise((r) => { responseResolve = r; });
  const finish = () => {
    if (ended) return;
    ended = true;
    const body = chunks.length ? Buffer.concat(chunks) : null;
    const outHeaders = {};
    for (const [k, v] of Object.entries(res.getHeaders())) {
      outHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }
    responseResolve(new Response(body, { status: res.statusCode, headers: outHeaders }));
  };
  res.write = (chunk, encoding, cb) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    if (typeof cb === 'function') cb();
    return true;
  };
  res.end = (chunk, encoding, cb) => {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    if (typeof cb === 'function') cb();
    finish();
    return res;
  };

  // 先完整读取请求体
  let bodyBuf = null;
  if (request.body) {
    const reader = request.body.getReader();
    const bodyChunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bodyChunks.push(value);
    }
    bodyBuf = bodyChunks.length ? Buffer.concat(bodyChunks) : null;
  }

  const ct = (headers['content-type'] || '').toLowerCase();
  const isMultipart = ct.includes('multipart/form-data');

  if (isMultipart) {
    // multipart 交给 multer 解析：把请求体灌进 IncomingMessage 流
    if (bodyBuf) req.push(bodyBuf);
    req.push(null);
    req.body = {};
  } else {
    // JSON / urlencoded：在适配器内直接解析，并删除 content-type/content-length，
    // 让 express.json()/urlencoded() 的 shouldParse/hasBody 判定为 false 从而跳过，
    // 避免它重新从已被消费的流读取导致 req.body 被清空或覆盖。
    if (bodyBuf && bodyBuf.length > 0) {
      try {
        if (ct.includes('application/json')) {
          req.body = JSON.parse(bodyBuf.toString('utf8'));
        } else if (ct.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(bodyBuf.toString('utf8'));
          req.body = Object.fromEntries(params);
        } else {
          req.body = bodyBuf;
        }
      } catch {
        req.body = {};
      }
    } else {
      req.body = {};
    }
    delete req.headers['content-type'];
    delete req.headers['content-length'];
    delete req.headers['transfer-encoding'];
  }

  app(req, res);
  return responsePromise;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const app = await getApp(env);
      return await runExpress(app, request);
    } catch (err) {
      const detail = err && err.stack ? err.stack : String(err && err.message || err);
      return new Response(
        JSON.stringify({ error: '服务异常', detail }),
        { status: 500, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  },
};
