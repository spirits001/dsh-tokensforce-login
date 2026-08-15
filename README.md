# dsh-tokensforce

[TokensForce](https://tokensforce.com) 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件：把 tokensforce 网关做成 dsh 的模型提供方，登录即配置。

## 它做什么

- **首跑登录向导**：dsh web 首次启动且没有任何可用模型时，弹出「连接 TokensForce」向导——
  填服务地址 → 弹层内嵌 tokensforce 登录页（邮箱验证码 + 验证码都由站点自己处理）→
  多企业选企业、多组选组（只有一个则自动跳过）→ 自动把该组的 API Key 与网关地址写入模型配置。
- **复用官方引擎**：提供方走 dsh 自带的 `llm-pi-ai`（OpenAI 兼容协议），每组写入一个
  `tokensforce-<组ID>` provider 档；官方 DeepSeek 路由（`llm-deepseek`）由本插件的 patch 层禁用。
- **设置页继续加组**：设置 → TokensForce 卡片一键再走一遍选组流程；Models 页也能用
  pi-ai 的通用编辑器手动管理。
- 密钥经 dsh 凭据机制（`credentials.set`）存在宿主侧，浏览器只保留登录态（JWT，7 天）。

## 前置条件（tokensforce 侧）

站点需支持**嵌入登录**（本仓库配套的 tokensforce 改动）：

1. `nginx/default.conf` 的 `location = /login` 放行嵌入（不发 `X-Frame-Options`）；
2. 管理后台「系统设置 → 可嵌入登录页的应用来源」填入 dsh 的来源，如
   `http://127.0.0.1:3080`（即 `embed_allowed_origins` 设置，逗号分隔，留空拒绝全部）；
3. 登录页识别 `?embed=<parent_origin>`，成功后 `postMessage({type: 'tokensforce:login', token}, parent_origin)`。

## 安装

```sh
dsh plugin --profile web add dsh-tokensforce-login        # 从 npm（发布后）
dsh plugin --profile web add /path/to/dsh-tokensforce      # 本地路径
dsh web
```

> pnpm ≥10 在 profile workspace root 上执行 `add` 时如报 `ERR_PNPM_ADDING_TO_ROOT`，
> 可手动在 `~/.dsh/profiles/web` 下 `pnpm add -w <包>` 并把包名追加进
> `package.json` 的 `dsh.profile.bundles`，效果等同。

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

### 目录

```
cordis.patch.yml        # 禁用 llm-deepseek + 插入 ui-tokensforce client 行
src/index.ts            # node half（空 apply，纯客户端插件）
src/client/index.ts     # 注册 onboarding 步骤 + 设置卡片
src/client/Onboarding.tsx   # 步骤外壳 + 向导各阶段渲染
src/client/LoginFrame.tsx   # 服务地址表单 + iframe 嵌登录页 + postMessage
src/client/Section.tsx      # 设置页 TokensForce 卡片（添加其他组）
src/client/store.ts     # ReadinessStore（三表 join）+ WizardController（状态机）
src/client/logic.ts     # 纯逻辑（可单测，无 dsh 运行时依赖）
src/client/api.ts       # tokensforce /api/* 浏览器直连客户端
```

### 向导流程

```
login（直接 iframe 嵌 SITE_ORIGIN/login?embed=<dsh origin>&theme=<明暗>，大弹窗原样渲染站点登录页，收 token）
  → linking（GET /api/user/orgs）
  → orgs（单个自动跳过，多个选择，必要时 switch-org 换 token）
  → groups（GET /api/user/groups；单个自动跳过，多个选择）
  → saving（GET /api/user/key?group_id= 拿 host+models；
           settings.mutate 写 llm-pi-ai providers.tokensforce-<gid>；
           credentials.set 写 TOKENSFORCE_<GID>_API_KEY）
  → done
```

部署地址是 `logic.ts` 里的 `SITE_ORIGIN` 常量（默认 `https://tokensforce.com`），
用户无需填写；OEM / 自建发行改这一个常量即可。

readiness 与官方 DeepSeek 首跑步骤同构：已有任一可用 provider 即自动跳过，
加载失败不弹窗，只有「已加载且无可用 provider」才出现向导。

## 版本对齐

依赖锁定 `@deepseek-ai/dsh-*@0.1.0-rc.6`（当前 npm 版本）。dsh 处于开发者预览，
升级时回归点：onboarding 步骤契约、`llm-pi-ai` 设置 schema、client bundle 纯度规则。

## License

TBD
