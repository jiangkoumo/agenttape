# AgentTape 项目交接

更新时间：2026-08-21
权威工作区：`/Users/jiangkoumo/Documents/ChatGPT/#`
当前阶段：0.3.0 remote MCP release candidate，Phase 2 闭环和 owner-only Sites 发布完成

## 当前可用成果

- Repository-local Codex 插件：`plugins/agenttape/`。
- Repository marketplace：`.agents/plugins/marketplace.json`。
- Hooks recorder、redaction、tape v1 schema、validator 和固定 fixtures。
- Bundled stdio MCP：`list_tapes`、`inspect_tape`、`fork_run`、`save_regression`。
- Structural replay、4 种 injection、assertion runner 和 CLI exit semantics。
- Branch Canvas 已接入真实 workspace tape；公开 build 会进入生成的只读 Demo 模式。
- AgentTape 0.2.3 已通过本地 marketplace 安装和全新 Codex 进程工具调用。
- Sites 构建输出位于 `dist/client/`、`dist/server/` 和 `dist/.openai/`。
- Owner-only Sites 版本已部署到 `https://agenttape.jiangkoumo.chatgpt.site`。
- `remote/worker.mjs` 提供无状态 Streamable HTTP MCP；本地 MCP v2 客户端和 Wrangler dry-run 已通过。

## 验证命令

```bash
npm test
npm run build
```

浏览器主流程还应覆盖：tape selector、timeout 注入、Details、保存回归、本地空状态和公开 Demo fallback。

## 重要边界

- 不要声称 bit-exact、complete 或 blanket deterministic replay。
- Structural replay 在 injected tool result 处停止；不会生成新的下游 model reasoning。
- Hosted tools 和未捕获 external state 不在 Hook coverage 内。
- 不要把真实 `.agent-tape/runtime/` 或未经人工检查的 capture 提交到仓库。
- 公共 Demo 不连接访客本地文件；本地写操作只允许 `tests/agenttape/` 且默认不覆盖。

## 后续发布接力

1. 保留 repo marketplace 作为 Codex 本地分发方式。
2. 完成 Cloudflare 登录后部署 `agenttape-mcp-jiangkoumo`，再对生产 `/mcp` 做全工具回归。
3. 只有在用户明确批准后，才把当前 owner-only Sites 访问策略改为 public 或其他共享范围。
4. Universal public submission 还需要开发者身份、Apps Management 权限、域名验证和提交门户审核。不要把 bundled stdio 安装或 release candidate 描述为 universal plugin 发布。

## 不要修改

除非 Sites 合约本身变化，保持 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和 `tests/sites-worker.test.mjs` 的既有结构。当前 `#` 路径由 `scripts/run-vite.mjs` 处理，不要绕过它直接运行 Vite。
