// Cloudflare Pages _worker.js：将 /api/* 和 /uploads/* 反向代理到 Cloudflare Worker 后端
// 浏览器只与 Cloudflare 通信（国内可访问），由 Pages Worker 服务端请求后端 Worker
const BACKEND = 'https://campus-wall-api.hxgnet.workers.dev';

// Supabase Storage 公共读地址。图片/视频统一改走本站 /media/* 代理，
// 避免国内网络直连 *.supabase.co 失败导致图片不显示。
const SUPABASE_MEDIA = 'https://rmipwwyhhsdalcotvgdp.supabase.co/storage/v1/object/public/campus-images';
const MEDIA_PREFIX = '/media/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 媒体文件代理：/media/<对象路径> -> Supabase Storage 公共地址
    if (path.startsWith(MEDIA_PREFIX)) {
      const objectPath = path.slice(MEDIA_PREFIX.length);
      if (!objectPath || objectPath.includes('..')) {
        return new Response('Bad Request', { status: 400 });
      }
      const upstream = await fetch(
        new Request(`${SUPABASE_MEDIA}/${objectPath}${url.search}`, request)
      );
      const headers = new Headers(upstream.headers);
      // 对象名带时间戳，内容不会变，可长期缓存；Range（视频）由上游 206 透传
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.delete('set-cookie');
      return new Response(
        request.method === 'HEAD' ? null : upstream.body,
        { status: upstream.status, statusText: upstream.statusText, headers }
      );
    }

    if (path.startsWith('/api') || path.startsWith('/uploads')) {
      const targetUrl = BACKEND + path + url.search;
      const proxyReq = new Request(targetUrl, request);
      const res = await fetch(proxyReq);

      let body = res.body;
      let textRewritten = false;
      // 只改写 GET 的 JSON 响应：把历史数据里的 Supabase 直链换成同源 /media/*，
      // 上传等写操作返回的原始 URL 保持不变，保证数据库里存的仍是完整地址。
      if (path.startsWith('/api') && request.method === 'GET') {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          body = (await res.text()).split(`${SUPABASE_MEDIA}/`).join(MEDIA_PREFIX);
          textRewritten = true;
        }
      }

      // 转成可变响应，去掉 CORS 头（同源不再需要），保留其余头
      const headers = new Headers(res.headers);
      headers.delete('access-control-allow-origin');
      headers.delete('access-control-allow-credentials');
      headers.delete('access-control-allow-headers');
      headers.delete('access-control-allow-methods');
      if (textRewritten) {
        // 改写后长度变化，必须由运行时重新计算
        headers.delete('content-length');
        headers.delete('content-encoding');
      }
      // API 响应强制不缓存，防止 WebView / CDN 复用旧数据导致帖子不更新
      if (path.startsWith('/api')) {
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        headers.delete('ETag');
        headers.delete('Last-Modified');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
      }
      return new Response(
        request.method === 'HEAD' ? null : body,
        { status: res.status, statusText: res.statusText, headers }
      );
    }

    // 其他请求交给 Pages 静态资源（含 _redirects 的 SPA 回退）
    return env.ASSETS.fetch(request);
  },
};
