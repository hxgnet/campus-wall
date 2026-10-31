import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Favorites() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    api.getFavorites().then(setPosts).catch(() => {}).finally(() => setLoading(false));
  }, [user, navigate]);

  if (!user) return null;

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">⭐ 我的收藏</h1>
        {loading ? <div className="loading">加载中...</div> :
          posts.length === 0 ? (
            <div className="empty"><div className="empty-icon">⭐</div><div>还没有收藏的帖子</div></div>
          ) : posts.map((p) => <PostCard key={p.id} post={p} />)
        }
      </div>
    </div>
  );
}
