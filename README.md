# dsh-tokensforce-login

[TokensForce](https://tokensforce.com) 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件：把 tokensforce 网关做成 dsh 的模型提供方，**登录即配置**。

## 它做什么

- **首跑登录向导**：dsh web 首次启动且没有任何可用模型时，自动弹出近全屏灯箱，
  1:1 渲染 tokensforce 站点登录页（邮箱验证码、滑块验证都由站点自己处理）。
  登录后多企业选企业、多组选组（只有一个则自动跳过），自动把该组的 API Key
  与网关地址写入模型配置，全程无需手填任何东西。
- **复用官方引擎**：提供方走 dsh 自带的 `llm-pi-ai`（OpenAI 兼容协议），每组写入一个
  `tokensforce-<组ID>` provider 档；官方 DeepSeek 路由（`llm-deepseek`）由本插件的 patch 层禁用。
- **再加组**：设置面板头部「连接 TokensForce」按钮随时重开向导（登录态 7 天内免重登，
  直达选组）；「模型」页里每个组都是一行，可编辑/删除/发现模型。
- 密钥经 dsh 凭据机制（`credentials.set`）存在宿主侧；浏览器只留登录态（JWT）。
- 灯箱跟随 dsh 明暗主题（`&theme=`），并附 `&cb=` 防缓存参数规避发版后旧文档缓存。

## 前置条件（tokensforce 侧）

站点需支持**嵌入登录**（配套的 tokensforce 仓库改动，已在生产）：

1. `nginx` 的 `location = /login` 放行嵌入（不发 `X-Frame-Options`，响应 `Cache-Control: no-cache`）；
2. 登录页识别 `?embed=<parent_origin>`（无白名单，任意来源可嵌），成功后
   `postMessage({type: 'tokensforce:login', token}, parent_origin)`；
3. `?theme=dark|light` 固定明暗。

## 安装

```sh
dsh plugin --profile web add dsh-tokensforce-login        # 从 npm（发布后）
dsh plugin --profile web add github:spirits001/dsh-tokensforce-login   # 从 GitHub
dsh plugin --profile web add /path/to/dsh-tokensforce-login            # 本地路径
dsh web
```

> pnpm ≥10 在 profile workspace root 上执行 `add` 时如报 `ERR_PNPM_ADDING_TO_ROOT`，
> 可手动在 `~/.dsh/profiles/web` 下 `pnpm add -w <包>` 并把包名追加进
> `package.json` 的 `dsh.profile.bundles`，效果等同。
> 从 GitHub 安装需要仓库带 `prepare` 脚本先构建（见下「发布到 npm」）。

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

### 向导流程

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

部署地址是 `logic.ts` 里的 `SITE_ORIGIN` 常量（默认 `https://tokensforce.com`），
用户无需填写；OEM / 自建发行改这一个常量即可。

readiness 与官方 DeepSeek 首跑步骤同构：已有任一可用 provider 即自动跳过，
加载失败不弹窗，只有「已加载且无可用 provider」才出现向导。

## 发布到 npm

包名 `dsh-tokensforce-login`（无 scope，无需组织）。首次发布前：

1. `package.json` 去掉 `"private": true`，确定 `license`（目前 UNLICENSED，见文末）；
2. 在 [npmjs.com](https://npmjs.com) 注册账号后，仓库内 `npm login`；
3. `pnpm build && npm publish`（`files` 已只含 `lib` 与 `cordis.patch.yml`）；
4. 发布后用户即可 `dsh plugin --profile web add dsh-tokensforce-login` 一条命令安装。

从 GitHub 直装（不发 npm 的替代路径）：需要 `package.json` 加
`"prepare": "pnpm build"`，pnpm 拉 git 依赖时会自动构建。

## 版本对齐

依赖锁定 `@deepseek-ai/dsh-*@0.1.0-rc.6`（当前 npm 版本）。dsh 处于开发者预览，
升级时回归点：onboarding 步骤契约、`llm-pi-ai` 设置 schema、client bundle 纯度规则、
`--dsw-alias-*` 变量名。

## License

TBD（发布 npm 前需确定）
