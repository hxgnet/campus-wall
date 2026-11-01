import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function Search() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get('q') || '');
  const query = params.get('q') || '';
  const [results, setResults] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hotPosts, setHotPosts] = useState([]);

  useEffect(() => {
    if (!query) { setResults([]); setUsers([]); return; }
    setLoading(true);
    Promise.all([
      api.getPosts({ q: query, page: 1, pageSize: 20, sort: 'new' }).then((d) => d.posts || []).catch(() => []),
      api.searchUsers(query).then((u) => u || []).catch(() => []),
    ])
      .then(([postList, userList]) => { setResults(postList); setUsers(userList); })
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    api.getHotPosts().then(setHotPosts).catch(() => {});
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const q = input.trim();
    if (q) setParams({ q }); else setParams({});
  };

  return (
    <div className="page">
      <div className="container">
        <form className="search-bar" onSubmit={submit}>
          <input
            autoFocus
            placeholder="搜索帖子内容、标签，或用户 ID / 昵称..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">🔍</button>
        </form>

        {query ? (
          <>
            {users.length > 0 && (
              <section className="search-users-section" style={{ marginBottom: 16 }}>
                <div className="search-header"><span>相关用户 · {users.length} 位</span></div>
                <div className="search-user-list">
                  {users.map((u) => (
                    <div key={u.uid} className="search-user-row" onClick={() => navigate(`/profile/${u.uid}`)}>
                      <div className="search-user-avatar">
                        {u.avatar ? <img src={u.avatar} alt="" /> : <span>{(u.nickname || u.username || '?').slice(0, 1)}</span>}
                      </div>
                      <div className="search-user-main">
                        <div className="search-user-name">{u.nickname || u.username}</div>
                        <div className="search-user-meta">@{u.username}</div>
                      </div>
                      <span className="search-user-go">查看主页 →</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="search-header">
              <span>搜索 "{query}" 的结果 · {results.length} 条帖子</span>
              <button className="reply-link" onClick={() => { setInput(''); setParams({}); }}>清除</button>
            </div>
            {loading ? <div className="loading">搜索中...</div> :
              results.length === 0 ? (
                <div className="empty"><div className="empty-icon">🔍</div><div>没有找到相关帖子</div></div>
              ) : results.map((p) => <PostCard key={p.id} post={p} />)
            }
          </>
        ) : (
          <div className="search-hint">输入关键词后按回车或点击搜索</div>
        )}

        <section className="hot-section">
          <h3>🔥 热门帖子</h3>
          {hotPosts.length === 0 ? (
            <div className="search-hint">暂无热门帖子</div>
          ) : (
            <div className="hot-list">
              {hotPosts.map((p, i) => (
                <div key={p.id} className="hot-row" onClick={() => navigate(`/post/${p.id}`)}>
                  <span className={`hot-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                  <div className="hot-main">
                    <div className="hot-content">{p.content}</div>
                    <div className="hot-meta">
                      <span className={`post-cat cat-${p.category}`}>{p.category}</span>
                      {p.is_hot && <span className="status-badge status-approved">🔥 热门</span>}
                      <span>{p.likes || 0} 赞</span>
                      <span>{p.created_at}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
