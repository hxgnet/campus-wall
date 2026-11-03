import { useEffect, useState } from 'react';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';

export default function Activities() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPosts({ category: '活动', page: 1, pageSize: 50, sort: 'new' })
      .then((d) => setPosts(d.posts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onLikeChange = (id, likes) => setPosts((prev) => prev.map((p) => p.id === id ? { ...p, likes } : p));

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">🎉 近期活动</h1>
        <div className="feed-list">
          {loading ? (
            <div className="loading">加载中...</div>
          ) : posts.length === 0 ? (
            <div className="empty"><div className="empty-icon">📭</div><div>暂无活动</div></div>
          ) : (
            posts.map((p) => <PostCard key={p.id} post={p} onLikeChange={onLikeChange} />)
          )}
        </div>
      </div>
    </div>
  );
}
