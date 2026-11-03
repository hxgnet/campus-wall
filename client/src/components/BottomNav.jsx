import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { api } from '../api.js';

const ITEMS = [
  { to: '/', label: '首页', icon: '🏠', end: true },
  { to: '/activities', label: '活动', icon: '🎉' },
  { to: '/create', label: '发帖', icon: '✏️', primary: true },
  { to: '/messages', label: '私信', icon: '💬' },
  { to: '/mine', label: '我的', icon: '👤' },
];

export default function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    if (location.pathname === '/messages') { setUnread(0); return; }
    api.getUnreadCount().then((d) => setUnread(d.count)).catch(() => {});
  }, [user, location.pathname]);

  useEffect(() => {
    const clear = () => setUnread(0);
    window.addEventListener('notifications-read', clear);
    return () => window.removeEventListener('notifications-read', clear);
  }, []);

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {ITEMS.map((item) => {
          let to = item.to;
          if (to === '/create' && !user) to = '/login';
          if (to === '/mine') to = user ? `/profile/${user.uid}` : '/login';
          return (
            <NavLink
              key={item.label}
              to={to}
              end={item.end}
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}${item.primary ? ' bottom-nav-primary' : ''}`}
            >
              <span className="bottom-nav-icon">
                {item.icon}
                {item.to === '/messages' && unread > 0 && (
                  <span className="bottom-nav-badge">{unread > 99 ? '99+' : unread}</span>
                )}
              </span>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
