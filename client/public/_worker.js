// Cloudflare Pages _worker.js：将 /api/* 和 /uploads/* 反向代理到 Netlify 函数
// 浏览器只与 Cloudflare 通信（国内可访问），由 Worker 服务端请求 Netlify
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 代理 API 与上传资源到 Netlify Function
    if (path.startsWith('/api') || path.startsWith('/uploads')) {
      let targetPath;
      if (path.startsWith('/api')) {
        // /api/posts -> /posts  (Netlify 函数内部会再补回 /api 前缀)
        targetPath = path.replace(/^\/api/, '') || '/';
      } else {
        // /uploads/xxx 保持不变
        targetPath = path;
      }
      const targetUrl =
        'https://psxyq.netlify.app/.netlify/functions/api' +
        targetPath +
        url.search;

      const proxyReq = new Request(targetUrl, request);
      const res = await fetch(proxyReq);

      // 转成可变响应，去掉 CORS 头（同源不再需要），保留其余头
      const newRes = new Response(res.body, res);
      newRes.headers.delete('access-control-allow-origin');
      newRes.headers.delete('access-control-allow-credentials');
      newRes.headers.delete('access-control-allow-headers');
      newRes.headers.delete('access-control-allow-methods');
      return newRes;
    }

    // 其他请求交给 Pages 静态资源（含 _redirects 的 SPA 回退）
    return env.ASSETS.fetch(request);
  },
};
