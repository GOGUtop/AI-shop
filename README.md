# 通用资金与行情状态栏（SillyTavern 扩展）

这是一个独立的 SillyTavern 第三方扩展，用 RPG 账本方式显示当前聊天的资金和周围行情。状态按聊天 ID 分开保存在浏览器 `localStorage`，不会把状态再写进正文。

## 安装

1. 将整个 `financial-status-bar-extension` 文件夹复制到 SillyTavern 的 `public/scripts/extensions/third-party/`。
2. 在 SillyTavern 重载页面。若版本支持第三方扩展清单，也可以在第三方扩展页面填入此文件夹所在仓库或静态地址。
3. 右上角会出现“资金与行情”状态栏。首次可点“编辑状态”录入初始资金。

## 状态格式

```json
{
  "location": "长安城·西市",
  "currency": {"code": "CNY", "name": "铜钱", "symbol": "文"},
  "funds": {
    "cash": 320,
    "deposit": 1200,
    "assets": [{"name": "西市铺面", "value": 8000, "note": "西市 3 号"}]
  },
  "market": {
    "shops": [{
      "name": "张记杂货铺", "type": "杂货",
      "products": [{"name": "干粮", "price": 8, "stock": "充足", "unit": "一份", "note": ""}]
    }]
  }
}
```

## 正文读取和 API

“从正文识别”优先读取最近消息中的 ` ```json ` 状态块，随后才使用“现金/存款/当前位置”等明确句式。未出现的字段保留旧值，避免一次不完整的正文覆盖整张账本。可以在正文中让作者或角色输出上面的 JSON；对于古代、现代、科幻或不同国家，只需更换 `currency`、`location` 和商品内容即可。

“API 设置”支持 OpenAI-compatible Chat Completions 地址，例如 `https://api.openai.com/v1`、本地 Ollama 的 `/v1` 或完整的 `/v1/chat/completions`。可以单独保存 API Key、模型和读取消息数；“测试连接”只发送最小请求，“API 拉取”才会发送最近正文，并要求模型只返回严格 JSON。API 返回会与已有账本合并，且提示模型不得猜测正文没有明确给出的数字。

API Key 仅保存在浏览器本机 `localStorage`。如果服务端不允许浏览器跨域请求，需要在服务端开启 CORS，或填写 SillyTavern 可访问的同源代理地址。

## 版本

当前版本：`1.0.0`。扩展不依赖 npm 或构建步骤，直接使用 `index.js` 和 `style.css`。
