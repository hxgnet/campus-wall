import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './AuthContext.jsx';
import { ThemeProvider } from './ThemeContext.jsx';
import Header from './components/Header.jsx';
import Feed from './pages/Feed.jsx';
import Search from './pages/Search.jsx';
import PostDetail from './pages/PostDetail.jsx';
import CreatePost from './pages/CreatePost.jsx';
import Admin from './pages/Admin.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Notifications from './pages/Notifications.jsx';
import Favorites from './pages/Favorites.jsx';
import Messages from './pages/Messages.jsx';
import MessagesHub from './pages/MessagesHub.jsx';
import GroupChat from './pages/GroupChat.jsx';
import Apply from './pages/Apply.jsx';
import { api } from './api.js';

export default function App() {
  // 版本检测：WebIntoApp 打包的 APK 打开后若服务端已更新，提示刷新以获取最新内容
  useEffect(() => {
    const check = async () => {
      try {
        const { version } = await api.getVersion();
        const prev = localStorage.getItem('app_version');
        if (prev && prev !== version) {
          localStorage.setItem('app_version', version);
          if (window.confirm('检测到新版本，是否立即刷新以获取最新内容？')) window.location.reload();
        } else {
          localStorage.setItem('app_version', version);
        }
      } catch { /* 忽略网络异常 */ }
    };
    check();
    const timer = setInterval(check, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <Header />
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/search" element={<Search />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/create" element={<CreatePost />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile/:id" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/messages" element={<MessagesHub />} />
          <Route path="/messages/:uid" element={<Messages />} />
          <Route path="/groups/:id" element={<GroupChat />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/apply" element={<Apply />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
        <footer className="site-footer">
          <div className="footer-brand">鹏山校园墙 · PENGSHAN CAMPUS WALL</div>
          <div className="footer-line" />
          <div className="footer-slogan">以青春之我，建青春之鹏山</div>
          <div className="footer-meta">石狮市鹏山实验学校 · 灵秀片区九年一贯制实验学校</div>
          <div className="footer-copy">弘扬大鹏精神：志趣高远 · 精神豪迈 · 追求自由 · 超越自我</div>
          <div className="footer-contact">
            <div className="footer-contact-title">问题反馈 · 联系我们</div>
            <div className="footer-contact-grid">
              <a href="https://www.webintoapp.com/store/1745442" target="_blank" rel="noopener noreferrer">📲 下载 / 更新 App</a>
              <a href="mailto:hx_gnet@qq.com">✉️ 反馈邮箱 hx_gnet@qq.com</a>
              <span>📰 公众号「鹏山实验学校」：PSXX202109</span>
              <span>🛠️ 公众号「虎孝服务」：hx_Gnet</span>
              <a href="https://work.weixin.qq.com/ca/cawcde6393385f3cec" target="_blank" rel="noopener noreferrer">💬 在线微信客服</a>
            </div>
          </div>
        </footer>
      </AuthProvider>
    </ThemeProvider>
  );
}
