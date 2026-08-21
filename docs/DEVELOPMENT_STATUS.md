# AgentTape 开发状态

更新时间：2026-08-21
版本状态：0.3.0 / remote MCP release candidate
当前里程碑：Phase 2 本地闭环与 owner-only Sites 发布完成，Phase 3 HTTPS MCP 已通过本地协议/构建验证

## 一句话状态

AgentTape 已经完成本地“捕获 → 检查 → 分叉 → 注入 → 结构化重放 → 断言 → 保存回归”闭环和 owner-only Sites 发布。0.3.0 进一步提供无状态 Streamable HTTP MCP，真实 MCP v2 客户端测试、Cloudflare Worker dry-run 和 Wrangler 本地 runtime 全工具验收均已通过；生产 Worker 部署仍需要 Cloudflare 登录授权。

## 当前能力

| 领域 | 状态 | 已验证事实 |
| --- | --- | --- |
| Hooks recorder / redaction | 完成 | 支持本地 Codex 生命周期、权限和工具事件，输出 redacted tape v1 |
| Tape schema / fixtures | 完成 | JSON Schema、validator、3 个固定 fixture |
| MCP server | 完成 | 4 个工具具有输入输出 schema、安全注解和 stdio 集成测试 |
| Structural replay | 完成 | 4 种 recorded-result injection，0 model calls / 0 live tools |
| Assertions / CLI | 完成 | 6 类断言；通过为 0，失败为非零且 diff 脱敏 |
| Branch Canvas | 完成 | 真实 list/inspect/fork/save；加载、空、错误和 Demo 状态 |
| Local plugin install | 完成 | `agenttape@personal` 0.2.3 已安装并由全新 Codex 进程实际调用 |
| Offline public demo | 完成 | 构建时由核心 replay 引擎生成；公开模式只读，不访问访客本地文件 |
| CI / security / privacy | 完成 | GitHub Actions、SECURITY、privacy notes |
| Sites production deployment | 完成 | 0.3.0 v3 部署成功，owner-only URL：`https://agenttape.jiangkoumo.chatgpt.site` |
| Stateless HTTPS MCP | 发布候选完成 | 4 个只读工具，MCP v2 客户端、Worker dry-run 与 Wrangler runtime 端到端通过 |
| Universal plugin submission | 待外部步骤 | 需要部署稳定 HTTPS MCP、Cloudflare/OpenAI 身份与提交门户权限 |

## 关键验证证据

- UI 从 `.agent-tape/tapes/permission-denied.tape` 加载 `github.create_issue` 失败。
- 浏览器把注入条件切换为 timeout，并保存 `tests/agenttape/fixture_permission_denied-timeout.tape`。
- 保存后的回归由 CLI 执行：`PASS tape_regression_9f680719a4a7 4/4 assertions`。
- Codex 0.2.3 实机调用 `agenttape/list_tapes`，返回 `tape_fixture_permission_denied`。
- MCP 路径遍历、符号链接、超大文件、无效 schema、重复写入和覆盖请求均有拒绝测试。
- Sites v3 保存版本与已推送源码 `efb7878e35f1f0e02fcb70342d30539838e515d9` 和本地打包产物一致；生产部署状态为 `succeeded`。
- HTTP MCP 列出并调用 `validate_tape`、`inspect_tape`、`fork_run`、`run_assertions`；未脱敏、超大和跨域输入均被拒绝。
- `npm run verify:http-mcp -- http://127.0.0.1:8799` 已针对 Wrangler runtime 通过：4 个工具、4 条断言。

## 当前架构

```text
Codex hooks
    ↓
record-hook.mjs
    ↓
.agent-tape/runtime + .agent-tape/tapes
    ├── CLI validate/test
    ├── bundled stdio MCP (list / inspect / fork / save)
    └── local HTTP adapter → Branch Canvas

redacted fixture → build-agenttape-demo.mjs → public read-only Demo mode
```

## 明确边界

- Structural replay 在注入后的工具结果处停止，不生成新的下游 agent 推理。
- Hosted tools 和未捕获外部状态不在本地 Hook 覆盖范围内。
- Replay confidence 会根据覆盖、redaction 和外部状态捕获情况降级。
- 公共 Sites 展示的是生成的 redacted fixture；真实 workspace 读写仅发生在本地模式。
- Universal Plugins Directory 需要远程 HTTPS Streamable MCP；bundled stdio 只覆盖 Codex 本地安装。

## 发布门槛

1. 全量离线测试与 production build 通过。
2. 1440 × 1024 和 1024 × 768 的本地静态 Demo 主流程通过浏览器验收。
3. Sites 版本保存并部署成功；当前访问策略为 owner-only。
4. 若要进入 universal directory，部署独立远程 MCP、补齐公开 URL/隐私条款并通过官方提交审核。

## 远程验收说明

托管端已确认部署成功并设置 current live URL。当前自动化浏览器访问 `chatgpt.site` 时被 Cloudflare 边缘安全策略拦截，未到达应用页面，因此不能把这次自动化请求作为远程 UI 冒烟通过的证据；本地使用完全相同的 `dist/client` 静态产物已通过浏览器验收。
