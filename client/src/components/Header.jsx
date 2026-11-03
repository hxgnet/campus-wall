import { NavLink } from 'react-router-dom';
import { useTheme } from '../ThemeContext.jsx';
import { useEffect, useRef } from 'react';
import BrandMark from './BrandMark.jsx';

export default function Header() {
  const { dark, toggle } = useTheme();
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
            <NavLink to="/about">校园介绍</NavLink>
            <button className="back-btn" style={{ color: '#fff', margin: 0, fontSize: 18 }} onClick={toggle}>{dark ? '☀️' : '🌙'}</button>
          </div>
        </nav>
      </div>
    </header>
  );
}
