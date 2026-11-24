# 颍州扎杠麻将

一位玩家与三名本地 AI 同桌。每局使用 136 张牌，底分 10 分。开场前在大厅选择活杠、死杠或死九，以及是否开启小牌禁胡。整场对局（含流局重打）沿用这套配置。

玩法依据仓库内的[完整规则](docs/颍州扎杠麻将完整规则.md)和[新手牌例](docs/颍州扎杠麻将新手规则.md)。牌桌显示墙尾亮牌，死杠和死九的补牌逐张标记。赢家坐庄，流局留庄，4／8／16 局场均按有效局数推进。

默认开 4 局活杠，小牌禁胡关闭。起手亮牌时从庄家起依次询扎；固定亮牌暂缓报扎后可在自己回合再报。留扎加分看胡张进手前已持有的三张普通牌，活杠换亮牌会更新报扎资格。

## 运行与验证

使用 Node.js `^20.19.0 || >=22.12.0` 和 pnpm。开发地址为 [localhost:5173](http://localhost:5173)。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test:yingzhou
pnpm test
pnpm build
pnpm test:e2e
```

颍州规则与 AI 在 `src/game/variants/yingzhou/`。浏览器本地完成对局，结算后可在大厅回放牌谱。默认墨玉、欢乐麻将、红木金丝和 LLM 主题可在右上角切换。

项目基于 [yaotongmahjong](https://github.com/BestGuo2020/yaotongmahjong)。上游的玩法引擎、联机底层、研究脚本和历史牌谱兼容模块保留在仓库中。

## 保留的 LLM / TTS 环境说明

以下是保留模块的上游接入说明。`VITE_API_BASE` 可指定服务地址；此配置不表示幺筒已提供联机或 LLM 对战。

- `VITE_LOCAL_TTS_BASE_URL`（可选）：单机大模型吐槽的独立 TTS 网关基址。
  默认沿用 `VITE_API_BASE`/同源 `/api`；同源请求 404 时自动回退生产网关。
  该地址只传短文本与白名单音色，不包含百度 Key/Secret。

代码通过 Vite 内置的 `import.meta.env.BASE_URL` 拼接音频、图片和头像资源路径。不要把密钥放入前端环境变量或提交到仓库。

单机大模型启用后，吐槽文字会立即显示，同时异步请求独立的
`POST /api/local-tts/synthesize`。音频返回后进入共享播放队列，与 BGM 同时播放
（语音期间不压低 BGM：2026-09-11 用户决定，忽高忽低更影响对局节奏）；失败只保留气泡，不影响出牌。AI 设置中的“单机音色”可自动按模型识别 DeepSeek/千问/Kimi/豆包/MiniMax/GPT/GLM/Claude，也可
手动指定任一网关白名单音色或策略默认音色。此链路位于共享 `game/llm` 与
`game/core/presentation`，与联机传输解耦。

无浏览器 CORS 的供应商端点不能从网页直连：千问 Token Plan
（`token-plan.cn-beijing.maas.aliyuncs.com`）、Coding Plan
（`coding.dashscope.aliyuncs.com`）对预检一律直接 401、不带任何 `Access-Control-*`
头（2026-09-18 实测），官方也明确 Token Plan / Coding Plan / 按量付费三套 Base URL
与凭证完全隔离、不可混用。这类端点走自家后端的白名单透传通道
`POST /api/llm/relay/<upstream>/chat/completions`（浏览器 → 网关回 CORS 头 →
供应商，SSE 原样流式回传）。AI 设置中的「千问 Token Plan（经网关）」预置已指向该通道：
Key 仍是用户自己的 `sk-sp-` Key，由浏览器携带、服务端不保存也不落日志；上游白名单
在服务端（`backend/app/api/llm_relay.py`），客户端只能选 id。详见
[docs/llm-relay-gateway.md](./docs/llm-relay-gateway.md)。


## 来源与许可

本项目基于 [BestGuo2020/lianhuaguangdongmahjong](https://github.com/BestGuo2020/lianhuaguangdongmahjong)，保留其共享牌桌与主题资源。项目代码许可见 [LICENSE](LICENSE)。示例头像来自 DiceBear Adventurer，原设计作者 Lisa Wischofsky，采用 CC BY 4.0 许可。

游戏积分仅用于虚拟娱乐，不具备现金价值，不支持兑换或线下结算。完整声明保留在游戏规则面板中。
