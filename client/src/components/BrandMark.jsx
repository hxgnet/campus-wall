// 鹏山校园墙校徽标记：金色圆章 + 鹏字 + 海浪线
export default function BrandMark({ size = 34 }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="psMarkGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f2d089" />
            <stop offset="55%" stopColor="#e2a33e" />
            <stop offset="100%" stopColor="#c9861f" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="23" fill="url(#psMarkGrad)" />
        <circle cx="24" cy="24" r="21.6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" />
        <path
          d="M7 34c4-2.6 8.4-2.6 12.4 0 4 2.6 8.4 2.6 12.4 0 3.4-2.2 7.2-2.5 11 0"
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <text
          x="24"
          y="30"
          textAnchor="middle"
          fontSize="21"
          fontWeight="700"
          fill="#fff"
          fontFamily="'Songti SC','STSong','SimSun',serif"
        >
          鹏
        </text>
      </svg>
    </span>
  );
}
