export default function About() {
  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">🏫 校园介绍</h1>

        <a
          className="about-download"
          href="https://www.webintoapp.com/download/apk/1745442/app-release.apk"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="about-download-icon">📲</span>
          <span className="about-download-text">
            <strong>下载 App 安装包</strong>
            <small>安卓安装包，点击直接下载</small>
          </span>
          <span className="about-download-arrow">›</span>
        </a>
        <div className="about-download-tip">💡 无需频繁下载更新：大退（强制关闭）App 后重新打开，即可自动刷新到最新版本。</div>

        <div className="about-contact-card">
          <div className="about-contact-title">📮 问题反馈 · 联系我们</div>
          <a className="about-contact-row" href="mailto:hx_gnet@qq.com">
            <span className="about-contact-icon">✉️</span>
            <span className="about-contact-main">
              <strong>反馈邮箱</strong>
              <small>hx_gnet@qq.com</small>
            </span>
            <span className="about-contact-arrow">›</span>
          </a>
          <div className="about-contact-row">
            <span className="about-contact-icon">📰</span>
            <span className="about-contact-main">
              <strong>公众号「鹏山实验学校」</strong>
              <small>PSXX202109</small>
            </span>
          </div>
          <div className="about-contact-row">
            <span className="about-contact-icon">🛠️</span>
            <span className="about-contact-main">
              <strong>服务号「虎孝服务」</strong>
              <small>hx_Gnet</small>
            </span>
          </div>
          <a
            className="about-contact-row"
            href="https://work.weixin.qq.com/ca/cawcde6393385f3cec"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="about-contact-icon">💬</span>
            <span className="about-contact-main">
              <strong>在线微信客服</strong>
              <small>点击联系人工客服</small>
            </span>
            <span className="about-contact-arrow">›</span>
          </a>
        </div>

        <div className="detail-card about-card">
          <div className="footer-brand">鹏山校园墙 · PENGSHAN CAMPUS WALL</div>
          <div className="footer-line" />
          <div className="footer-slogan">以青春之我，建青春之鹏山</div>
          <div className="footer-meta">石狮市鹏山实验学校 · 灵秀片区九年一贯制实验学校</div>
          <div className="about-section">
            <h3>学校简介</h3>
            <p>石狮市鹏山实验学校位于灵秀片区，是一所九年一贯制实验学校。学校秉承“大鹏精神”，引导学子志趣高远、精神豪迈、追求自由、超越自我，在青春岁月里向下扎根、向上生长。</p>
          </div>
          <div className="about-section">
            <h3>关于校园墙</h3>
            <p>鹏山校园墙是面向全校师生的校园交流平台：分享校园日常、参与校园活动、认识同学好友，也可以匿名说出心里话。愿这里成为每一只“小鹏”起飞的地方。</p>
          </div>
          <div className="footer-copy">弘扬大鹏精神：志趣高远 · 精神豪迈 · 追求自由 · 超越自我</div>
        </div>
      </div>
    </div>
  );
}
