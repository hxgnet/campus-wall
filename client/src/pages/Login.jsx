import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import BrandMark from '../components/BrandMark.jsx';

const AGREEMENT_TEXT = `《鹏山校园墙用户协议》

1. 本平台仅供校园内交流使用，禁止发布违法、违规、色情、暴力、诈骗等内容。
2. 禁止人身攻击、骚扰、歧视、泄露他人隐私等行为。
3. 用户应对自己发布的内容承担全部法律责任。
4. 注册即表示同意平台收集你的昵称、发帖内容等必要信息用于服务运行与安全风控。
5. 管理员有权对违规内容进行删除、对违规账号进行封禁。
6. 本协议最终解释权归平台所有。`;

export default function Login() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [agreement, setAgreement] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  // 注册强制要求定位：用户拒绝授权或获取失败时不允许注册
  const getGeo = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'register' && !agreement) {
      alert('请先阅读并同意《用户协议》');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        if (username.trim().length < 3) { alert('用户名至少 3 位'); return; }
        if (password.length < 6) { alert('密码至少 6 位'); return; }
        const geo = await getGeo();
        if (!geo) {
          alert('注册必须授权定位：请在系统设置中允许本应用获取位置，然后重新注册。');
          return;
        }
        await register(username, password, nickname, geo);
      }
      navigate('/');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 380, marginTop: 28 }}>
        <div className="hero-card" style={{ marginTop: 0 }}>
          <div style={{ marginBottom: 12 }}><BrandMark size={54} /></div>
          <div className="hero-kicker">石狮市鹏山实验学校</div>
          <div className="hero-title">鹏山校园墙</div>
          <div className="hero-slogan" style={{ marginBottom: 0 }}>以青春之我，建青春之鹏山</div>
        </div>
        <div className="detail-card">
          <h2 style={{ textAlign: 'center', marginBottom: 20 }}>{mode === 'login' ? '🔐 登录' : '📝 注册'}</h2>
          <div className="cat-tabs" style={{ justifyContent: 'center', marginBottom: 16 }}>
            <button className={`cat-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>登录</button>
            <button className={`cat-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>注册</button>
          </div>
          <form onSubmit={submit}>
            <div className="form-group">
              <input className="form-input" placeholder="用户名" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            {mode === 'register' && (
              <div className="form-group">
                <input className="form-input" placeholder="昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <input className="form-input" type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {mode === 'register' && (
              <label className="anon-toggle" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                <input type="checkbox" checked={agreement} onChange={(e) => setAgreement(e.target.checked)} style={{ marginTop: 3 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  我已阅读并同意
                  <button type="button" className="link-btn" onClick={() => setShowAgreement(true)}>《用户协议》</button>
                </span>
              </label>
            )}
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
            </button>
          </form>
          <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 16 }}>
            {mode === 'register'
              ? '注册必须授权定位，否则无法完成注册；注册后可发帖、评论、私信、抢红包'
              : '登录后可发帖、评论、收藏、接收通知'}
          </p>
        </div>
      </div>

      {showAgreement && (
        <div className="modal-overlay" onClick={() => setShowAgreement(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3>📜 用户协议</h3>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, maxHeight: 320, overflowY: 'auto', textAlign: 'left' }}>
              {AGREEMENT_TEXT}
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={() => { setAgreement(true); setShowAgreement(false); }}>
              我已阅读并同意
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
