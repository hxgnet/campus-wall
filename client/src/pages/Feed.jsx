import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, CATEGORIES } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function Feed() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('all');
  const [posts, setPosts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sort, setSort] = useState('new');

  const loadPosts = async (reset = false) => {
    if (reset) { setPosts([]); setPage(1); setHasMore(true); }
    setLoading(true);
    try {
      const curPage = reset ? 1 : page;
      const data = await api.getPosts({ category, page: curPage, pageSize: 20, sort });
      setPosts((prev) => (reset ? data.posts : [...prev, ...data.posts]));
      setHasMore(data.total > (reset ? 0 : posts.length) + data.posts.length);
      setPage((p) => (reset ? 2 : p + 1));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPosts(true); /* eslint-disable-next-line */ }, [category, sort]);
  useEffect(() => {
    api.getCategories().then((list) => { if (Array.isArray(list) && list.length) setCategories(list); }).catch(() => {});
    api.getPosts({ category: '活动', page: 1, pageSize: 5, sort: 'new' })
      .then((d) => setActivities(d.posts || [])).catch(() => {});
  }, []);

  // 回到前台时自动刷新信息流，防止 App 在后台挂久了显示旧帖子
  // 依赖 category/sort：否则切到某个板块后再回到前台，会刷新回「全部」
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadPosts(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    /* eslint-disable-next-line */
  }, [category, sort]);

  const onLikeChange = (id, likes) => setPosts((prev) => prev.map((p) => p.id === id ? { ...p, likes } : p));

  return (
    <div className="page">
      <div className="container">
        {/* 搜索栏优先展示在页面最顶部 */}
        <div className="top-search-wrap">
          <div className="search-bar search-trigger" onClick={() => navigate('/search')}>
            <input placeholder="搜索帖子内容、标签或同学..." readOnly />
            <button type="button" className="btn btn-primary">🔍</button>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-kicker">SHISHI PENGSHAN EXPERIMENTAL SCHOOL</div>
          <div className="hero-title">鹏山校园墙</div>
          <div className="hero-slogan">以青春之我，建青春之鹏山 · 今天，校园由你发声</div>
          <div className="hero-chips">
            <span className="hero-chip">志趣高远</span>
            <span className="hero-chip">精神豪迈</span>
            <span className="hero-chip">追求自由</span>
            <span className="hero-chip">超越自我</span>
          </div>
        </div>

        <div className="feed-toolbar">
          <div className="toolbar-scroll">
            <button className={`cat-tab ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>🌟 全部</button>
            {categories.map((c) => (
              <button key={c.name} className={`cat-tab ${category === c.name ? 'active' : ''}`} onClick={() => setCategory(c.name)}>{c.icon} {c.name}</button>
            ))}
            <span className="toolbar-divider" />
            <button className={`sort-tab ${sort === 'new' ? 'active' : ''}`} onClick={() => setSort('new')}>🆕 最新</button>
            <button className={`sort-tab ${sort === 'hot' ? 'active' : ''}`} onClick={() => setSort('hot')}>🔥 热门</button>
          </div>
        </div>

        {/* 活动区域需要下滑/上滑才能看到；点击活动标签可进入评论区互动 */}
        {activities.length > 0 && (
          <div className="activity-strip">
            <div className="activity-strip-head">
              <span className="activity-strip-title">🎉 近期活动</span>
              <button type="button" className="btn-text" onClick={() => setCategory('活动')}>查看全部</button>
            </div>
            <div className="activity-cards">
              {activities.map((a) => (
                <button key={a.id} className="activity-card" onClick={() => navigate(`/post/${a.id}`)}>
                  <span className="activity-tag">🎉 活动</span>
                  <span className="activity-text">{a.content?.slice(0, 60) || '点击查看活动详情'}</span>
                  {a.activity_signup_required && <span className="activity-tag">需报名</span>}
                  {!!a.signup_count && <span className="activity-signup-meta">{a.signup_count} 人报名</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="feed-list">
          {loading && posts.length === 0 ? <div className="loading">加载中...</div> :
            posts.length === 0 ? (
              <div className="empty"><div className="empty-icon">📭</div><div>还没有帖子，快来发第一条吧！</div></div>
            ) : posts.map((p) => <PostCard key={p.id} post={p} onLikeChange={onLikeChange} />)
          }
          {loading && posts.length > 0 && <div className="loading">加载更多...</div>}
          {!loading && hasMore && posts.length > 0 && (
            <button className="btn btn-secondary btn-block" onClick={() => loadPosts()}>加载更多</button>
          )}
        </div>
      </div>
    </div>
  );
}
