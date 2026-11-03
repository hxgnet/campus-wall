import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const TYPE_LABEL = {
  admin_grant: '超管发放',
  admin_deduct: '超管收回',
  reclaim: '系统回收',
  transfer_in: '转账收入',
  transfer_out: '转账支出',
};

export default function Wallet() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getCoins().then(setData).catch(() => setData({ coins: 0, logs: [], sent: [], received: [] }));
  }, []);

  if (!data) return <div className="page"><div className="container"><div className="loading">加载中...</div></div></div>;

  let history = data.logs || [];
  if (!history.length) {
    history = [
      ...(data.sent || []).map((t) => ({
        id: `s-${t.id}`, delta: -t.amount, type: 'transfer_out', reason: t.note,
        peer_nickname: t.peer_nickname, created_at: t.created_at,
      })),
      ...(data.received || []).map((t) => ({
        id: `r-${t.id}`, delta: t.amount, type: 'transfer_in', reason: t.note,
        peer_nickname: t.peer_nickname, created_at: t.created_at,
      })),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  return (
    <div className="page">
      <div className="container">
        <div className="wallet-hero">
          <div className="wallet-label">我的鹏币</div>
          <div className="wallet-amount">🪙 {data.coins ?? 0}</div>
          <div className="wallet-sub">鹏币由超级管理员发放，可用于群聊红包与同学转账</div>
        </div>

        <h2 className="section-title">资金记录</h2>
        {history.length === 0 && <div className="empty">暂无资金记录</div>}
        <div className="wallet-list">
          {history.map((h) => (
            <div className="wallet-row" key={h.id}>
              <div className="wallet-row-main">
                <div className="wallet-row-title">
                  {TYPE_LABEL[h.type] || h.type}
                  {h.peer_nickname ? ` · ${h.peer_nickname}` : ''}
                </div>
                <div className="wallet-row-sub">
                  {h.reason || '无备注'}
                  {h.admin_name ? ` · 操作人 ${h.admin_name}` : ''}
                </div>
                <div className="wallet-row-time">{h.created_at}</div>
              </div>
              <div className={`wallet-row-delta ${h.delta > 0 ? 'plus' : 'minus'}`}>
                {h.delta > 0 ? '+' : ''}{h.delta}
                <div className="wallet-row-balance">余额 {h.balance_after ?? '-'}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>返回</button>
      </div>
    </div>
  );
}
