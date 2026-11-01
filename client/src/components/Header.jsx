import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { api } from '../api.js';
import { useEffect, useRef, useState } from 'react';
import BrandMark from './BrandMark.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const headerRef = useRef(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 路由变化时重新拉取未读数；进入通知页直接归零，避免徽标常亮
  useEffect(() => {
    if (!user) { setUnread(0); return; }
    if (location.pathname === '/notifications') { setUnread(0); return; }
    api.getUnreadCount().then((d) => setUnread(d.count)).catch(() => {});
  }, [user, location.pathname]);

  useEffect(() => {
    const clear = () => setUnread(0);
    window.addEventListener('notifications-read', clear);
    return () => window.removeEventListener('notifications-read', clear);
  }, []);

  return (
    <header className="header" ref={headerRef}>
      <div className="container header-inner">
        <NavLink to="/" className="logo">
          <BrandMark />
          <span className="logo-text">
            <span className="logo-title">鹏山校园墙</span>
            <span className="logo-sub">石狮市鹏山实验学校</span>
          </span>
        </NavLink>
        <nav className="nav-links">
          <div className="nav-inner">
          <NavLink to="/" end>首页</NavLink>
          <NavLink to="/create">发帖</NavLink>
          {user ? (
            <>
              <NavLink to="/apply">申请</NavLink>
              <NavLink to="/notifications" className="notif-badge" data-count={unread > 0 ? unread : ''}>通知</NavLink>
              <NavLink to="/favorites">收藏</NavLink>
              {(user.role === 'admin' || user.role === 'super') && <NavLink to="/admin">管理</NavLink>}
              <NavLink to={`/profile/${user.uid}`}>{user.nickname}</NavLink>
              <button className="back-btn" style={{ color: '#fff', margin: 0 }} onClick={() => { logout(); navigate('/'); }}>退出</button>
            </>
          ) : (
            <NavLink to="/login">登录</NavLink>
          )}
          <button className="back-btn" style={{ color: '#fff', margin: 0, fontSize: 18 }} onClick={toggle}>{dark ? '☀️' : '🌙'}</button>
          </div>
        </nav>
      </div>
    </header>
  );
}
