import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { useTheme } from '../ThemeContext.jsx';
import { api } from '../api.js';
import { useEffect, useRef, useState } from 'react';

export default function Header() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (user) {
      api.getUnreadCount().then((d) => setUnread(d.count)).catch(() => {});
    }
  }, [user]);

  return (
    <header className="header" ref={headerRef}>
      <div className="container header-inner">
        <NavLink to="/" className="logo">
          <span className="logo-icon">🏫</span>
          <span>校园墙</span>
        </NavLink>
        <nav className="nav-links">
          <div className="nav-inner">
          <NavLink to="/" end>首页</NavLink>
          <NavLink to="/create">发帖</NavLink>
          {user ? (
            <>
              <NavLink to="/notifications" className="notif-badge" data-count={unread > 0 ? unread : ''}>通知</NavLink>
              <NavLink to="/favorites">收藏</NavLink>
              <NavLink to={`/profile/${user.id}`}>{user.nickname}</NavLink>
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
