# AgentTape 0.4.2 跨项目验收记录

日期：2026-08-25

## 验收目标

验证公开安装的 AgentTape 能在独立现有工程中完成：真实失败捕获、检查、结构化分叉、保存回归和离线执行。验收对象为 ToolFence；本次没有修改或发布 ToolFence 业务源码。

## 真实失败

在 ToolFence 中由 Codex 本地 Bash 直接执行：

```bash
node dist/cli.js policy check --policy ./toolfence.yaml
```

命令因缺少 `toolfence.yaml` 以退出码 1 失败。AgentTape 生成 `tape_8f5c9e2b14fb`，验收结果为：

- 状态：`failed`
- 覆盖：`supported-local-hooks`
- 事件：5 个，顺序为 `SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → Stop`
- 工具调用：1 个，失败工具调用：1 个
- 首个失败：事件 4，工具 `Bash`，原因 `Codex recorded tool exit code 1`
- 明显未脱敏密钥：未发现

另一次通过 context-mode 包装执行的同类诊断被记录为 `captured` 而不是 `failed`。这是正确行为：Codex 看到的是包装工具成功返回诊断，而不是本地 Bash 工具自身失败。

## 结构化分叉和回归

从失败 tape 的事件 3 边界对事件 4 注入 `permission_denied`：

- 分支：`branch_420bde46e26a`
- 结构重放：completed
- replay confidence：0.7 / medium
- 分叉前 model calls：0
- live tool calls：0
- 保存路径：`tests/agenttape/policy-check-permission-denied.tape`
- 断言：`final_status`、`tool_present`、`max_retries`、`min_replay_confidence`，共 4 条

该 regression 仅保留在本地 ToolFence 工作区，未经人工发布决策不会提交到 ToolFence 仓库。

## 真实安装缺口与修复

公开 `v0.4.1` 安装缓存中的源 CLI 会在独立工程报 `ERR_MODULE_NOT_FOUND: ajv`。根因是 Git marketplace 会复制插件文件，但不会为插件源脚本安装仓库 npm 依赖；此前只有 MCP server 被打包。

`v0.4.2` 的修复：

- 发布自包含 `dist/agenttape-cli.mjs`
- 发布自包含 `dist/verify-capture.mjs`
- capture skill 改为调用安装缓存中的 bundled CLI
- CI 检查三个 dist bundle 均被 Git 跟踪并可重复构建
- release test 把 CLI 和 verifier 复制到仓库外临时目录，在没有 `node_modules` 的环境执行

## 公开安装复验

PR #2 的 4 个检查全部通过，合并后的 main workflow 和 `v0.4.2` Release workflow 均通过。随后移除旧安装，从公开标签重新安装：

```bash
codex plugin marketplace add jiangkoumo/agenttape --ref v0.4.2
codex plugin add agenttape@agenttape
```

ToolFence 中直接调用公开安装缓存的 CLI：

```text
PASS tape_regression_420bde46e26a 4/4 assertions
PASS 1/1 regression tapes
```

公开安装缓存中的 verifier 同时确认 tape 状态为 failed、5 个要求的 Hook 事件齐全、失败工具调用为 1、无明显密钥模式且整体 passed。

## 边界

- 本次仍是 structural replay，不是 bit-exact 或 complete replay。
- 分叉在 injected tool result 处停止，不生成新的下游 model reasoning。
- Hosted tools 和未捕获 external state 不在本地 Hook coverage 内。
- ToolFence 当前仅新增本地 `.agent-tape/` 运行数据和 `tests/agenttape/` 回归文件，均未提交或推送。
