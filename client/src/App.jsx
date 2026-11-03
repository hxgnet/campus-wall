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
import Activities from './pages/Activities.jsx';
import About from './pages/About.jsx';
import Wallet from './pages/Wallet.jsx';
import BottomNav from './components/BottomNav.jsx';

export default function App() {
  // 版本检测：WebIntoApp 打包的 APK 打开后若服务端已更新，自动刷新
  // 策略：拉取线上 index.html，比对 <script src> 的 hash，变了就强制重载
  const checkUpdate = async () => {
    try {
      const html = await fetch(`/?_t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text());
      const match = html.match(/<script[^>]+src="([^"]+)"/);
      if (match) {
        const remoteBundle = match[1];
        const currentBundle = localStorage.getItem('current_bundle');
        if (!currentBundle) {
          localStorage.setItem('current_bundle', remoteBundle);
        } else if (currentBundle !== remoteBundle) {
          localStorage.setItem('current_bundle', remoteBundle);
          // 有新版本，直接重载（不弹确认，避免用户在 App 里漏掉）
          window.location.reload();
        }
      }
    } catch { /* 忽略网络异常 */ }
  };

  useEffect(() => {
    checkUpdate();
    // 从后台切回前台时立即检查更新
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    // 兜底：每 5 分钟检查一次
    const timer = setInterval(checkUpdate, 5 * 60 * 1000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
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
          <Route path="/activities" element={<Activities />} />
          <Route path="/about" element={<About />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/apply" element={<Apply />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
        <BottomNav />
      </AuthProvider>
    </ThemeProvider>
  );
}
