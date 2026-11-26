# 颍州扎杠麻将

一位玩家与三名本地 AI 同桌。每局使用 136 张牌，底分 10 分。开场前在大厅选择活杠、死杠或死九，以及是否开启小牌禁胡。整场对局（含流局重打）沿用这套配置。

玩法依据仓库内的[完整规则](docs/颍州扎杠麻将完整规则.md)和[新手牌例](docs/颍州扎杠麻将新手规则.md)。牌桌显示墙尾亮牌，死杠和死九的补牌逐张标记。东风场、半庄场、全庄场分别打到东四局、南四局、北四局。庄家胡牌或流局，原庄沿用当前局号再打一把。闲家胡牌后坐庄，局号前进一局。末局由闲家胡牌时整场结束。

默认开东风场，玩法为活杠，小牌禁胡关闭。起手亮牌时从庄家起依次询扎；固定亮牌暂缓报扎后可在自己回合再报。留扎加分看胡张进手前已持有的三张普通牌，活杠换亮牌会更新报扎资格。

## 运行与验证

使用 Node.js `^20.19.0 || >=22.12.0` 和 pnpm。开发地址为 [localhost:5173](http://localhost:5173)。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test:yingzhou
pnpm test
pnpm build:web
pnpm test:e2e
```

颍州规则与 AI 在 `src/game/variants/yingzhou/`。浏览器本地完成对局，结算后可在大厅回放牌谱。默认墨玉、欢乐麻将、红木金丝和 LLM 主题可在右上角切换。

项目基于 [yaotongmahjong](https://github.com/BestGuo2020/yaotongmahjong)。上游的玩法引擎、联机底层、研究脚本和历史牌谱兼容模块保留在仓库中。

## 网站和 Android 同步发布

正式站点 [yinzhoumahjong.guoguo-labs.online](https://yinzhoumahjong.guoguo-labs.online/) 使用 EdgeOne Pages 的 Git 集成，生产分支为 `master`。推送源码后，GitHub Actions 使用仓库 Secrets 中的固定签名构建独立 APK，校验网页、下载和更新包。测试通过后，Actions 将 APK 和版本清单写回 `master` 的 `mobile-release/`。EdgeOne 自动读取这个发布提交。CI 运行期间，网页、下载入口和更新接口继续提供上一份完整版本。后续本地开发前用 `git pull --ff-only` 同步发布提交。

根目录的 `edgeone.json` 指定平台运行 `node scripts/edgeone-release.mjs build`，输出目录为 `edgeone-dist`。构建从已签名 APK 提取同版网页资源并校验更新包。APK 和更新 ZIP 以最大 12 MiB 的静态分片保存，边缘函数通过固定下载地址流式返回原文件。浏览器和已安装的 APK 都沿用原地址。

本地生成正式 APK 时，安装 JDK 17、Android SDK Platform 36、Build Tools 36.0.0 和 Python 3.9+，将 `ANDROID_HOME` 指向 SDK。项目内的 Gradle 包装器负责 Android 构建。

首次建立应用签名时执行一次 `pnpm android:signing-init`。妥善备份仓库根目录下的 `.android-signing/`（Git 已忽略）。更换构建机时恢复整个目录，或通过 `YINZHOU_KEYSTORE` 和 `YINZHOU_KEY_PASSWORD` 提供同一份 PKCS12 密钥，别名为 `yinzhou`。保留签名才能覆盖安装新版 APK。

每次正式发布运行 `pnpm build`。这条命令从同一份网页构建生成以下文件：

| 文件 | 用途 |
| --- | --- |
| `dist/` | 可直接部署到站点根目录的完整静态网站 |
| `dist/downloads/yinzhou-mahjong.apk` | 网页大厅「下载安卓版」的固定下载地址 |
| `dist/updates/web-<版本号>.zip` | 已安装客户端按需下载的 HTML、JS、CSS、图片和音频 |
| `dist/updates/latest.json` | 客户端检测版本、长度和 SHA-256 的清单 |
| `artifacts/android/<版本号>/yinzhou-mahjong-<版本号>.apk` | 本次独立构建的签名 APK 留档 |

GitHub Actions 读取仓库 Secrets 中的 `YINZHOU_KEYSTORE_BASE64`（同一份 PKCS12 的 Base64 编码）和 `YINZHOU_KEY_PASSWORD`。每次成功的生产构建均可从对应运行下载签名 APK，也可在 Git 发布提交中找回历史版本。本地核对已提交的 EdgeOne 发布文件时运行 `pnpm build:edgeone` 和 `node --test scripts/edgeone-download.test.mjs`。仅调试网页时使用 `pnpm build:web`。

APK 内置本次发布的全部游戏资源。断网也能首次开局。客户端启动或返回前台时检查更新（同一次运行最多每 15 分钟检查一次）。玩家确认后才下载，校验和解包完成后可选择立即重启或下次启动使用。更新沿用相同的本地网页来源，保留金币和牌谱。网页下载入口仅在浏览器大厅显示。修改 Android 容器、权限或其他原生功能时，用户需要安装新 APK。

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
