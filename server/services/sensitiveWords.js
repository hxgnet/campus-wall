// 本地敏感词过滤 - 无需外部服务
// 仅用于基础内容审核，建议生产环境接入阿里云/腾讯云内容安全 API
const SENSITIVE_WORDS = [
  '赌博', '博彩', '彩票', '六合彩', '时时彩',
  '色情', '淫秽', '卖淫', '嫖娼', '一夜情',
  '毒品', '吸毒', '贩毒', '大麻', '冰毒',
  '诈骗', '传销', '刷单', '返利',
  '办证', '刻章', '枪支', '弹药', '管制刀具',
  '反党', '反政府', '颠覆国家',
  '自杀', '自残',
  '广告推广', '加微信', '加QQ',
];

function containsSensitive(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SENSITIVE_WORDS.some((w) => lower.includes(w.toLowerCase()));
}

function maskSensitive(text) {
  if (!text) return text;
  let result = text;
  SENSITIVE_WORDS.forEach((w) => {
    const regex = new RegExp(w, 'gi');
    result = result.replace(regex, '*'.repeat(w.length));
  });
  return result;
}

module.exports = { containsSensitive, maskSensitive, SENSITIVE_WORDS };
