// Cloudflare Pages _worker.js：将 /api/* 和 /uploads/* 反向代理到 Cloudflare Worker 后端
// 浏览器只与 Cloudflare 通信（国内可访问），由 Pages Worker 服务端请求后端 Worker
const BACKEND = 'https://campus-wall-api.hxgnet.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api') || path.startsWith('/uploads')) {
      const targetUrl = BACKEND + path + url.search;
      const proxyReq = new Request(targetUrl, request);
      const res = await fetch(proxyReq);

      // 转成可变响应，去掉 CORS 头（同源不再需要），保留其余头
      const newRes = new Response(res.body, res);
      newRes.headers.delete('access-control-allow-origin');
      newRes.headers.delete('access-control-allow-credentials');
      newRes.headers.delete('access-control-allow-headers');
      newRes.headers.delete('access-control-allow-methods');
      // API 响应强制不缓存，防止 WebView / CDN 复用旧数据导致帖子不更新
      if (path.startsWith('/api')) {
        newRes.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        newRes.headers.delete('ETag');
        newRes.headers.delete('Last-Modified');
        newRes.headers.set('Pragma', 'no-cache');
        newRes.headers.set('Expires', '0');
      }
      return newRes;
    }

    // 其他请求交给 Pages 静态资源（含 _redirects 的 SPA 回退）
    return env.ASSETS.fetch(request);
  },
};
