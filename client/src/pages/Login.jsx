import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password, nickname);
      navigate('/');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="container" style={{ maxWidth: 380, marginTop: 40 }}>
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
            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? '处理中...' : (mode === 'login' ? '登录' : '注册')}
            </button>
          </form>
          <p style={{ fontSize: 12, color: 'var(--text-light)', textAlign: 'center', marginTop: 16 }}>
            注册后可发帖、评论、收藏、接收通知
          </p>
        </div>
      </div>
    </div>
  );
}
