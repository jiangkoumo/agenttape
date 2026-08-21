# AgentTape 项目交接

更新时间：2026-08-21
权威工作区：`/Users/jiangkoumo/Documents/ChatGPT/#`
当前阶段：0.2.3 local release candidate，Phase 2 闭环完成

## 当前可用成果

- Repository-local Codex 插件：`plugins/agenttape/`。
- Repository marketplace：`.agents/plugins/marketplace.json`。
- Hooks recorder、redaction、tape v1 schema、validator 和固定 fixtures。
- Bundled stdio MCP：`list_tapes`、`inspect_tape`、`fork_run`、`save_regression`。
- Structural replay、4 种 injection、assertion runner 和 CLI exit semantics。
- Branch Canvas 已接入真实 workspace tape；公开 build 会进入生成的只读 Demo 模式。
- AgentTape 0.2.3 已通过本地 marketplace 安装和全新 Codex 进程工具调用。
- Sites 构建输出位于 `dist/client/`、`dist/server/` 和 `dist/.openai/`。

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

## 发布接力

1. 使用当前成功 build 保存并部署 Sites 版本。
2. 保留 repo marketplace 作为 Codex 本地分发方式。
3. Universal public submission 是独立 Phase 3：需要稳定 HTTPS Streamable MCP endpoint、公开开发者/隐私/条款 URL 和提交门户审核。不要把 bundled stdio 安装描述为 universal plugin 发布。

## 不要修改

除非 Sites 合约本身变化，保持 `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs` 和 `tests/sites-worker.test.mjs` 的既有结构。当前 `#` 路径由 `scripts/run-vite.mjs` 处理，不要绕过它直接运行 Vite。
