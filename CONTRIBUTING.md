# 维护指南

面向本插件的维护与二次开发；使用方式见 [README](README.md)。

## 开发

```sh
pnpm install
pnpm test        # 纯逻辑单测（跳过决策 / profile 映射 / readiness / token）
pnpm typecheck   # 对已发布 @deepseek-ai/* 类型的严格检查
pnpm build       # 产出 lib/index.js（node half）+ lib/client.js（浏览器 loader 格式）
```

浏览器产物是 `window.__ModuleLoader__.load` 包装的 CJS bundle，外部依赖仅限
dsh 平台模块表（react 系、`dsh-client-ui-primitives`、`dsh-client-runtime/client`），
其余一律内联；`@deepseek-ai/*` 值导入超出平台表会直接构建失败（纯度门禁）。
界面样式使用 dsh 真实设计变量（`--dsw-alias-*`），自动跟随明暗主题。

### 目录

```
cordis.patch.yml        # 禁用 llm-deepseek + 插入 ui-tokensforce client 行
src/index.ts            # node half（空 apply，纯客户端插件）
src/client/index.ts     # 注册 onboarding 步骤 + 设置头部动作按钮
src/client/Onboarding.tsx   # 首跑步骤外壳 + 向导各阶段渲染
src/client/LoginFrame.tsx   # 灯箱 iframe 嵌站点登录页 + postMessage 收 token
src/client/Action.tsx       # 设置面板头部「连接 TokensForce」按钮
src/client/store.ts     # ReadinessStore（三表 join）+ WizardController（状态机）
src/client/logic.ts     # 纯逻辑（可单测，无 dsh 运行时依赖；SITE_ORIGIN 常量）
src/client/api.ts       # tokensforce /api/* 浏览器直连客户端
src/client/chrome.tsx   # 样式注入 + 弹窗/选项/按钮等共用件
```

### 向导流程（相位）

```
login（iframe 嵌 SITE_ORIGIN/login?embed=<dsh origin>&theme=<明暗>&cb=<防缓存>，收 token）
  → linking（GET /api/user/orgs）
  → orgs（单个自动跳过，多个选择，必要时 switch-org 换 token）
  → groups（GET /api/user/groups；单个自动跳过，多个选择）
  → saving（GET /api/user/key?group_id= 拿模型表；relay 地址用登录会话的 origin 拼接，
           不信任网关回传 host 的 scheme；
           settings.mutate 写 llm-pi-ai providers.tokensforce-<gid>；
           credentials.set 写 TOKENSFORCE_<GID>_API_KEY）
  → done
```

部署地址是 `logic.ts` 里的 `SITE_ORIGIN` 常量（默认 `https://tokensforce.com`）；
OEM / 自建发行改这一个常量重新构建。

readiness 与官方 DeepSeek 首跑步骤同构：已有任一可用 provider 即自动跳过，
加载失败不弹窗，只有「已加载且无可用 provider」才出现向导。

### tokensforce 站点侧的配套要求

1. `nginx` 的 `location = /login` 放行嵌入（不发 `X-Frame-Options`，响应 `Cache-Control: no-cache`）；
2. 登录页识别 `?embed=<parent_origin>`（无白名单，任意来源可嵌），成功后
   `postMessage({type: 'tokensforce:login', token}, parent_origin)`；
3. `?theme=dark|light` 固定明暗。

## 发版

已发布：[npm `dsh-tokensforce`](https://www.npmjs.com/package/dsh-tokensforce)，MIT。
流程：改动落库 → `package.json` 版本号 +1 → `pnpm build && npm publish`
（2FA 账号需带 OTP；`files` 已只含 `lib` 与 `cordis.patch.yml`）。

## 版本对齐

依赖锁定 `@deepseek-ai/dsh-*@0.1.0-rc.8`（当前 npm 版本）。dsh 处于开发者预览，
升级时回归点：onboarding 步骤契约、`llm-pi-ai` 设置 schema、client bundle 纯度规则、
`--dsw-alias-*` 变量名。
