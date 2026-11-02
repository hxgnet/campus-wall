import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import PostCard from '../components/PostCard.jsx';
import ForwardModal from '../components/ForwardModal.jsx';

const PRIVATE_FIELDS = [
  { key: 'real_name', label: '真实姓名' },
  { key: 'class_name', label: '班级' },
  { key: 'address', label: '住址' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信' },
  { key: 'qq', label: 'QQ' },
  { key: 'phone', label: '手机号' },
];

const STATUS_TEXT = { approved: '已通过', pending: '审核中', rejected: '已驳回' };

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
  const [friendStatus, setFriendStatus] = useState('none');
  const [blocked, setBlocked] = useState(false);
  const [extra, setExtra] = useState({
    real_name: '', class_name: '', address: '', email: '', wechat: '', qq: '', phone: '',
  });
  const [showFields, setShowFields] = useState({
    show_real_name: false, show_class_name: false, show_address: false,
    show_email: false, show_wechat: false, show_qq: false, show_phone: false, show_uid: false,
  });
  const [grade, setGrade] = useState('');
  const [gradeSetByAdmin, setGradeSetByAdmin] = useState(false);
  const [coins, setCoins] = useState(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [showDeletion, setShowDeletion] = useState(false);
  const [deletionFiles, setDeletionFiles] = useState([]);
  const [deletionNote, setDeletionNote] = useState('');
  const [deletionRequests, setDeletionRequests] = useState([]);
  const [submitBusy, setSubmitBusy] = useState(false);

  const loadRequests = () => api.getMyDeletionRequests().then(setDeletionRequests).catch(() => {});

  useEffect(() => {
    api.getUser(id).then((u) => {
      setProfile(u);
      setNickname(u.nickname);
      setBio(u.bio || '');
      setIsMe(user && user.uid === id);
      setBlocked(!!u.blocked_by_me);
    }).catch(() => {});
    if (user && user.uid === id) {
      api.getMyPosts().then(setPosts).catch(() => {});
    } else {
      api.getPosts({ userId: id, pageSize: 50 }).then((d) => setPosts(d.posts)).catch(() => {});
    }
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
          show_uid: !!me.show_uid,
        });
        setGrade(me.grade != null ? String(me.grade) : '');
        setGradeSetByAdmin(!!me.grade_set_by_admin);
        setCoins(me.coins);
      }).catch(() => {});
      loadRequests();
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
      const payload = { nickname, bio, ...extra, ...showFields };
      if (grade.trim() !== '') payload.grade = Number(grade);
      else payload.grade = null;
      await api.updateProfile(payload);
      if (isMe) updateUser({ ...user, nickname, bio });
      setProfile({ ...profile, nickname, bio, grade: grade.trim() !== '' ? Number(grade) : null, show_uid: showFields.show_uid });
      setEditing(false);
    } catch (e) { alert(e.message); }
  };

  const copyId = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      alert(`已复制用户 ID：${text}`);
    } catch {
      alert(`复制失败，请手动复制：${text}`);
    }
  };

  const addFriend = async () => {
    try {
      const r = await api.requestFriend(id);
      setFriendStatus(r.status === 'accepted' ? 'friend' : 'requested');
    } catch (e) { alert(e.message); }
  };

  const toggleBlock = async () => {
    try {
      const r = await api.blockUser(id);
      setBlocked(r.blocked);
      alert(r.blocked ? '已拉黑该用户，双方将无法发送私信' : '已取消拉黑');
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

  const transfer = async (e) => {
    e.preventDefault();
    const amount = Number(transferAmount);
    if (!transferTo.trim()) { alert('请输入收款用户 ID'); return; }
    if (!Number.isInteger(amount) || amount <= 0) { alert('请输入正确的金币数量'); return; }
    try {
      const r = await api.transferCoins(transferTo.trim(), amount, transferNote);
      setCoins(r.coins);
      setShowTransfer(false);
      setTransferAmount('');
      setTransferNote('');
      alert('转账成功');
    } catch (err) { alert(err.message); }
  };

  const submitDeletion = async () => {
    if (deletionFiles.length === 0) { alert('请上传一张智学网卷子图片'); return; }
    setSubmitBusy(true);
    try {
      await api.requestAccountDeletion(deletionFiles, deletionNote);
      setShowDeletion(false);
      setDeletionFiles([]);
      setDeletionNote('');
      loadRequests();
      alert('注销申请已提交，请等待超级管理员审核');
    } catch (e) { alert(e.message); }
    finally { setSubmitBusy(false); }
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
              <div className="profile-field" style={{ marginBottom: 12 }}>
                <label>入学年份</label>
                <input className="form-input" type="number" placeholder="如 2023" value={grade} onChange={(e) => setGrade(e.target.value)} />
                <p className="anon-hint" style={{ marginTop: 4, textAlign: 'left' }}>
                  可自行填写入学年份，但「毕业生」标签仅由超级管理员设置并确认，不会因入学满 3 年自动获得。
                </p>
                <label className="anon-toggle" style={{ marginTop: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={showFields.show_uid} onChange={(e) => setShowFields({ ...showFields, show_uid: e.target.checked })} />
                  <span>在我的主页公开显示 ID</span>
                </label>
              </div>
              <div className="profile-fields">
                {PRIVATE_FIELDS.map((f) => (
                  <div className="profile-field" key={f.key}>
                    <label>{f.label}</label>
                    <input className="form-input" placeholder="选填" value={extra[f.key]} onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })} />
                    <label className="anon-toggle" style={{ marginTop: 4, fontSize: 12 }}>
                      <input type="checkbox" checked={showFields[`show_${f.key}`]}
                        onChange={(e) => setShowFields({ ...showFields, [`show_${f.key}`]: e.target.checked })} />
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
              <h2 style={{ margin: '8px 0 4px' }}>
                {profile.nickname}
                {profile.custom_tag && (
                  <span className="user-custom-tag" style={{ marginLeft: 8, color: profile.tag_color || 'var(--primary)' }}>
                    {profile.custom_tag}
                  </span>
                )}
              </h2>
              {profile.bio && <p style={{ color: 'var(--text-light)', fontSize: 14 }}>{profile.bio}</p>}
              {((profile.grade != null) || profile.tag || profile.role === 'admin' || profile.role === 'super') && (
                <div className="profile-tags">
                  {profile.role === 'super' && <span className="profile-tag tag-super">🛡️ 超级管理员</span>}
                  {profile.role === 'admin' && <span className="profile-tag tag-admin">🛡️ 管理员</span>}
                  {profile.grade != null && <span className="profile-tag tag-grade">📅 {profile.grade}级</span>}
                  {profile.tag === 'graduate' && <span className="profile-tag tag-graduate">🎓 毕业生</span>}
                  {profile.tag === 'student' && <span className="profile-tag tag-student">📚 在校生</span>}
                  {profile.tag && profile.tag !== 'graduate' && profile.tag !== 'student' && (
                    <span className="profile-tag tag-student">🏷️ {profile.tag}</span>
                  )}
                  {isMe && profile.grade != null && !gradeSetByAdmin && (
                    <span className="profile-tag tag-pending">年级待管理员确认</span>
                  )}
                </div>
              )}
              {profile.uid && (
                <p onClick={() => copyId(profile.uid)} title="点击复制 ID"
                  style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 4, fontFamily: 'monospace', cursor: 'pointer', userSelect: 'none' }}>
                  ID：{profile.uid} <span style={{ fontSize: 11, color: 'var(--primary)' }}>📋 点击复制</span>
                </p>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 8 }}>
                帖子 {posts.length}
                {profile.reputation !== undefined && <> · 信誉分 {profile.reputation}</>}
                {isMe && coins != null && <> · 🪙 {coins} 金币</>}
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
                  <button className="btn btn-secondary" onClick={() => navigate(`/messages/${id}`)} disabled={blocked || profile.blocked_me}>
                    {profile.blocked_me && !blocked ? '对方已拉黑你' : '发私信'}
                  </button>
                  <button className="btn btn-secondary" style={{ color: blocked ? 'var(--text-light)' : 'var(--danger)' }} onClick={toggleBlock}>
                    {blocked ? '已拉黑（点击取消）' : '拉黑'}
                  </button>
                </div>
              )}
              {user && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setForwarding(true)}>📤 转发该主页</button>
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
          <div className="detail-card coin-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>🪙 我的金币：{coins ?? 0}</div>
                <div className="anon-hint" style={{ marginTop: 4 }}>可向其他同学转账，也可在群聊中发红包</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => setShowTransfer(true)}>转账</button>
                <button className="btn btn-secondary" onClick={() => navigate('/messages')}>去群聊发红包</button>
              </div>
            </div>
          </div>
        )}

        {isMe && (
          <div className="detail-card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>注销账号</h3>
            <p className="anon-hint" style={{ textAlign: 'left', marginBottom: 8 }}>
              为保障账号安全，注销需先提交申请：上传一张智学网卷子图片（卷子标题、姓名、智学号、班级号数需清晰可辨），
              经超级管理员审核同意后，账号才会被注销并删除全部数据。
            </p>
            {deletionRequests.length > 0 && (
              <div className="deletion-status">
                {deletionRequests.map((r) => (
                  <div key={r.id} className="deletion-status-item">
                    <span>申请 #{r.id} · {r.status === 'pending' ? '审核中' : r.status === 'approved' ? '已通过' : '已驳回'}</span>
                    {r.admin_note && <span className="muted"> · 理由：{r.admin_note}</span>}
                    <span className="post-time">{r.created_at}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn btn-danger" onClick={() => setShowDeletion(true)}>申请注销账号</button>
          </div>
        )}

        <h3 style={{ marginBottom: 12 }}>{isMe ? '我的帖子' : 'TA 的帖子'}</h3>
        {posts.length === 0 ? (
          <div className="empty"><div className="empty-icon">📭</div><div>暂无帖子</div></div>
        ) : posts.map((p) => (
          <div key={p.id}>
            {isMe && (
              <div className="my-post-status">
                <span className={`status-pill status-${p.status}`}>{STATUS_TEXT[p.status] || p.status}</span>
                {p.status === 'rejected' && p.review_note && <span className="muted">驳回理由：{p.review_note}</span>}
              </div>
            )}
            <PostCard post={p} />
          </div>
        ))}
      </div>

      {forwarding && <ForwardModal share={{ type: 'profile', id: profile.uid }} onClose={() => setForwarding(false)} />}

      {showTransfer && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">🪙 金币转账</div>
            <div className="modal-sub">当前余额：{coins ?? 0} 金币</div>
            <form onSubmit={transfer}>
              <div className="form-group">
                <label className="form-label">收款用户 ID</label>
                <input className="form-input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} placeholder="在对方主页点击 ID 可复制" />
              </div>
              <div className="form-group">
                <label className="form-label">转账数量</label>
                <input className="form-input" type="number" min="1" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">备注（可选）</label>
                <input className="form-input" value={transferNote} onChange={(e) => setTransferNote(e.target.value)} maxLength={60} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTransfer(false)}>取消</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>确认转账</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeletion && (
        <div className="modal-overlay" onClick={() => setShowDeletion(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">申请注销账号</div>
            <div className="modal-sub">
              请上传智学网中任意一张卷子的图片，并确保卷子标题、姓名、智学号、班级号数清晰可见。提交后需超级管理员审核同意。
            </div>
            <div className="form-group">
              <label className="form-label">卷子图片（1-3 张）</label>
              <input type="file" accept="image/*" multiple onChange={(e) => setDeletionFiles(Array.from(e.target.files).slice(0, 3))} />
              {deletionFiles.length > 0 && <div className="anon-hint">已选择 {deletionFiles.length} 张图片</div>}
            </div>
            <div className="form-group">
              <label className="form-label">补充说明（可选）</label>
              <textarea className="form-textarea" value={deletionNote} onChange={(e) => setDeletionNote(e.target.value)} placeholder="可填写注销原因" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDeletion(false)}>取消</button>
              <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={submitBusy} onClick={submitDeletion}>
                {submitBusy ? '提交中...' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
