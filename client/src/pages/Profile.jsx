import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';

const PRIVATE_FIELDS = [
  { key: 'real_name', label: '真实姓名' },
  { key: 'class_name', label: '班级' },
  { key: 'address', label: '住址' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信' },
  { key: 'qq', label: 'QQ' },
  { key: 'phone', label: '手机号' },
];

export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, updateUser, deleteAccount } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isMe, setIsMe] = useState(false);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [bio, setBio] = useState('');
  const [friendStatus, setFriendStatus] = useState('none');
  const [extra, setExtra] = useState({
    real_name: '', class_name: '', address: '', email: '', wechat: '', qq: '', phone: '',
  });
  const [showFields, setShowFields] = useState({
    show_real_name: false, show_class_name: false, show_address: false,
    show_email: false, show_wechat: false, show_qq: false, show_phone: false,
  });

  useEffect(() => {
    api.getUser(id).then((u) => {
      setProfile(u);
      setNickname(u.nickname);
      setBio(u.bio || '');
      setIsMe(user && user.uid === id);
    }).catch(() => {});
    api.getPosts({ userId: id, pageSize: 50 }).then((d) => setPosts(d.posts)).catch(() => {});
    if (user && user.uid === id) {
      api.me().then((me) => {
        setExtra({
          real_name: me.real_name || '',
          class_name: me.class_name || '',
          address: me.address || '',
          email: me.email || '',
          wechat: me.wechat || '',
          qq: me.qq || '',
          phone: me.phone || '',
        });
        setShowFields({
          show_real_name: !!me.show_real_name,
          show_class_name: !!me.show_class_name,
          show_address: !!me.show_address,
          show_email: !!me.show_email,
          show_wechat: !!me.show_wechat,
          show_qq: !!me.show_qq,
          show_phone: !!me.show_phone,
        });
      }).catch(() => {});
    }
  }, [id, user]);

  useEffect(() => {
    if (!user || user.uid === id) return;
    api.getFriends()
      .then((list) => setFriendStatus(list.some((f) => f.uid === id) ? 'friend' : 'none'))
      .catch(() => {});
  }, [user, id]);

  const saveProfile = async () => {
    try {
      await api.updateProfile({ nickname, bio, ...extra, ...showFields });
      if (isMe) updateUser({ ...user, nickname, bio });
      setProfile({ ...profile, nickname, bio });
      setEditing(false);
    } catch (e) { alert(e.message); }
  };

  const addFriend = async () => {
    try {
      const r = await api.requestFriend(id);
      setFriendStatus(r.status === 'accepted' ? 'friend' : 'requested');
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

  const handleDeleteAccount = async () => {
    if (!confirm('确定要注销账号吗？此操作不可恢复，你的所有帖子、评论、收藏、好友等数据将被永久删除。')) return;
    if (!confirm('再次确认：注销后无法恢复，确定继续吗？')) return;
    try {
      await deleteAccount();
      navigate('/');
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
              <div className="profile-fields">
                {PRIVATE_FIELDS.map((f) => (
                  <div className="profile-field" key={f.key}>
                    <label>{f.label}</label>
                    <input className="form-input" placeholder="选填" value={extra[f.key]} onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })} />
                    <label className="anon-toggle" style={{ marginTop: 4, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={showFields[`show_${f.key}`]}
                        onChange={(e) => setShowFields({ ...showFields, [`show_${f.key}`]: e.target.checked })}
                      />
                      <span>公开</span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="anon-hint">每个字段可单独选择是否公开；未公开的字段仅管理员核查时可见。</p>
              <button className="btn btn-primary" style={{ marginRight: 8 }} onClick={saveProfile}>保存</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>取消</button>
            </div>
          ) : (
            <div>
              <h2 style={{ margin: '8px 0 4px' }}>{profile.nickname}</h2>
              {profile.bio && <p style={{ color: 'var(--text-light)', fontSize: 14 }}>{profile.bio}</p>}
              <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>
                帖子 {posts.length}
                {profile.reputation !== undefined && <> · 信誉分 {profile.reputation}</>}
                {' '}· 加入于 {profile.created_at?.slice(0, 10)}
              </p>
              {isMe && <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setEditing(true)}>编辑资料</button>}
              {!isMe && user && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                  {friendStatus === 'friend' ? (
                    <button className="btn btn-secondary" disabled>已是好友</button>
                  ) : friendStatus === 'requested' ? (
                    <button className="btn btn-secondary" disabled>已发送请求</button>
                  ) : (
                    <button className="btn btn-primary" onClick={addFriend}>加好友</button>
                  )}
                  <button className="btn btn-secondary" onClick={() => navigate(`/messages/${id}`)}>发私信</button>
                </div>
              )}
            </div>
          )}
        </div>
        {!isMe && (
          <div className="detail-card" style={{ marginBottom: 16 }}>
            {(() => {
              const visible = PRIVATE_FIELDS.filter((f) => profile[f.key]);
              return visible.length > 0 ? (
                <>
                  <h3 style={{ fontSize: 15, marginBottom: 10 }}>联系方式</h3>
                  <div className="profile-fields">
                    {visible.map((f) => (
                      <div className="profile-field" key={f.key}>
                        <label>{f.label}</label>
                        <div style={{ fontSize: 14, wordBreak: 'break-word' }}>{profile[f.key]}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : <p className="anon-hint">该用户未公开资料</p>;
            })()}
          </div>
        )}
        {isMe && (
          <div className="detail-card" style={{ marginBottom: 16, textAlign: 'center' }}>
            <button className="btn btn-danger" onClick={handleDeleteAccount}>注销账号</button>
            <p className="anon-hint" style={{ marginTop: 8 }}>注销后所有数据将被永久删除，不可恢复</p>
          </div>
        )}
        <h3 style={{ marginBottom: 12 }}>TA 的帖子</h3>
        {posts.length === 0 ? (
          <div className="empty"><div className="empty-icon">📭</div><div>暂无帖子</div></div>
        ) : posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </div>
  );
}
