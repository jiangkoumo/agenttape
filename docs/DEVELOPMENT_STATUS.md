# AgentTape 开发状态

更新时间：2026-08-21
版本状态：0.2.3 / local release candidate
当前里程碑：Phase 2 功能闭环完成，进入发布验收

## 一句话状态

AgentTape 已经完成“捕获 → 检查 → 分叉 → 注入 → 结构化重放 → 断言 → 保存回归”的离线闭环；本地 Codex 插件和真实 Branch Canvas 均已通过端到端验证，剩余工作是发布托管与外部目录提交。

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
| Sites production deployment | 进行中 | 构建合约已通过，待保存版本和部署 |
| Universal plugin submission | 待外部步骤 | 需要稳定 HTTPS MCP endpoint、开发者资料和提交门户权限 |

## 关键验证证据

- UI 从 `.agent-tape/tapes/permission-denied.tape` 加载 `github.create_issue` 失败。
- 浏览器把注入条件切换为 timeout，并保存 `tests/agenttape/fixture_permission_denied-timeout.tape`。
- 保存后的回归由 CLI 执行：`PASS tape_regression_9f680719a4a7 4/4 assertions`。
- Codex 0.2.3 实机调用 `agenttape/list_tapes`，返回 `tape_fixture_permission_denied`。
- MCP 路径遍历、符号链接、超大文件、无效 schema、重复写入和覆盖请求均有拒绝测试。

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
2. 1440 × 1024 本地和公开 Demo 主流程无 console error。
3. Sites 版本保存并部署成功。
4. 若要进入 universal directory，部署独立远程 MCP、补齐公开 URL/隐私条款并通过官方提交审核。
