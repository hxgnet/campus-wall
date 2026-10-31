// 占位实现：仅在终端有颜色能力时使用，Serverless 环境无需
const noop = () => ({});
module.exports = { supportsColor: false, createColors: noop, default: { supportsColor: false, createColors: noop } };
