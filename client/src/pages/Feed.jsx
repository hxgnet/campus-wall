import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, CATEGORIES } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function Feed() {
  const navigate = useNavigate();
  const [category, setCategory] = useState('all');
  const [posts, setPosts] = useState([]);
  const [hotPosts, setHotPosts] = useState([]);
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
    api.getHotPosts().then(setHotPosts).catch(() => {});
  }, []);

  const onLikeChange = (id, likes) => setPosts((prev) => prev.map((p) => p.id === id ? { ...p, likes } : p));

  return (
    <div className="page">
      <div className="container">
        <div className="search-bar search-trigger" onClick={() => navigate('/search')}>
          <input placeholder="搜索帖子内容或标签..." readOnly />
          <button type="button" className="btn btn-primary">🔍</button>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cat-tabs">
              <button className={`cat-tab ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>🌟 全部</button>
              {CATEGORIES.map((c) => (
                <button key={c.name} className={`cat-tab ${category === c.name ? 'active' : ''}`} onClick={() => setCategory(c.name)}>{c.icon} {c.name}</button>
              ))}
            </div>

            <div className="cat-tabs" style={{ paddingTop: 0 }}>
              <button className={`cat-tab ${sort === 'new' ? 'active' : ''}`} onClick={() => setSort('new')}>🆕 最新</button>
              <button className={`cat-tab ${sort === 'hot' ? 'active' : ''}`} onClick={() => setSort('hot')}>🔥 热门</button>
            </div>

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

          <div style={{ width: 220, flexShrink: 0, display: posts.length > 0 ? 'block' : 'none' }}>
            <div className="hot-sidebar">
              <h3>🔥 热门帖子</h3>
              {hotPosts.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-light)' }}>暂无热门</div> :
                hotPosts.map((p, i) => (
                  <div key={p.id} className="hot-item" onClick={() => navigate(`/post/${p.id}`)}>
                    <span className="hot-rank">{i + 1}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.content}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
