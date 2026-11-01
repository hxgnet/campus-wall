import { Routes, Route } from 'react-router-dom';
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
import Apply from './pages/Apply.jsx';

export default function App() {
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
          <Route path="/messages/:uid" element={<Messages />} />
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
        </footer>
      </AuthProvider>
    </ThemeProvider>
  );
}
