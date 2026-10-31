import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isMe, setIsMe] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    api.getUser(id).then((u) => {
      setProfile(u);
      setNickname(u.nickname);
      setBio(u.bio || '');
      setIsMe(user && user.id == id);
    }).catch(() => {});
    api.getPosts({ userId: id, pageSize: 50 }).then((d) => setPosts(d.posts)).catch(() => {});
  }, [id, user]);

  const saveProfile = async () => {
    try {
      await api.updateProfile({ nickname, bio });
      if (isMe) updateUser({ ...user, nickname, bio });
      setProfile({ ...profile, nickname, bio });
      setEditing(false);
    } catch (e) { alert(e.message); }
  };

  const onAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const res = await api.uploadAvatar(file);
      setProfile({ ...profile, avatar: res.url });
      if (isMe) updateUser({ ...user, avatar: res.url });
    } catch (e) { alert(e.message); }
  };

  if (!profile) return <div className="page"><div className="container"><div className="loading">加载中...</div></div></div>;

  return (
    <div className="page">
      <div className="container">
        <div className="profile-header">
          <label style={{ cursor: isMe ? 'pointer' : 'default' }}>
            <div className="avatar">
              {profile.avatar ? <img src={profile.avatar} alt="" /> : profile.nickname[0]}
            </div>
            {isMe && <input type="file" accept="image/*" onChange={onAvatarChange} style={{ display: 'none' }} />}
          </label>
          {editing ? (
            <div>
              <input className="form-input" style={{ marginBottom: 8, textAlign: 'center' }} value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <input className="form-input" style={{ marginBottom: 8 }} placeholder="个性签名" value={bio} onChange={(e) => setBio(e.target.value)} />
              <button className="btn btn-primary" style={{ marginRight: 8 }} onClick={saveProfile}>保存</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
            </div>
          ) : (
            <div>
              <h2 style={{ margin: '8px 0 4px' }}>{profile.nickname}</h2>
              {profile.bio && <p style={{ color: 'var(--text-light)', fontSize: 14 }}>{profile.bio}</p>}
              <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>
                帖子 {posts.length} · 加入于 {profile.created_at?.slice(0, 10)}
              </p>
              {isMe && <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>编辑资料</button>}
            </div>
          )}
        </div>
        <h3 style={{ marginBottom: 12 }}>TA 的帖子</h3>
        {posts.length === 0 ? (
          <div className="empty"><div className="empty-icon">📭</div><div>暂无帖子</div></div>
        ) : posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </div>
  );
}
