# AgentTape 开发状态

更新时间：2026-08-23
版本状态：0.4.0 / 已公开发布并完成 Git marketplace 实机验收
当前里程碑：扩展故障注入与顺序断言能力

## 一句话状态

AgentTape 已完成本地“捕获 → 检查 → 分叉 → 注入 → 结构化重放 → 断言 → 保存回归”闭环。Codex 插件是正式产品；Branch Canvas 和远程 HTTP MCP 是可选开发组件，不是安装或开源发布前置条件。

## 当前能力

| 领域 | 状态 | 已验证事实 |
| --- | --- | --- |
| Hooks recorder / redaction | 完成 | 支持本地 Codex 生命周期、权限和工具事件，输出 redacted tape v1 |
| Tape schema / fixtures | 完成 | JSON Schema、validator、3 个合成 fixture |
| Bundled stdio MCP | 完成 | `list_tapes`、`inspect_tape`、`fork_run`、`save_regression` |
| Structural replay | 完成 | 5 种 recorded-result injection（含 rate_limited 429），0 model calls / 0 live tools |
| Assertions / CLI | 完成 | 7 类断言（含 tool_order 时序断言）；通过为 0，失败为非零且 diff 脱敏 |
| Repository marketplace | 完成 | marketplace 名为 `agenttape`，插件源为 `./plugins/agenttape` |
| Plugin validation | 完成 | 当前 Codex 插件校验器、单测和重新安装后的实机 MCP 调用通过 |
| Open-source metadata | 完成 | MIT、README、SECURITY、CONTRIBUTING、Code of Conduct、Changelog |
| Public GitHub release | 完成 | `jiangkoumo/agenttape`、`v0.4.0` Release 和公共 GitHub Actions 均已验证 |

## 关键验证证据

- UI 从合成的 permission-denied tape 加载工具失败，并可生成 timeout 分支。
- 保存后的回归由 CLI 执行：`PASS tape_regression_9f680719a4a7 4/4 assertions`。
- 从公开 GitHub `v0.3.1` 全新安装后，只读 Codex 进程经工具搜索实机调用 `agenttape/list_tapes`，返回 `tape_fixture_permission_denied`。
- MCP 路径遍历、符号链接、超大文件、无效 schema、重复写入和覆盖请求均有拒绝测试。
- 当前插件通过 `plugin-creator` 校验器；标准 `.mcp.json` 配置已在安装缓存中验证。
- 插件发行测试和 bundle 构建通过；可选组件仍有独立全量测试与构建。

## 当前架构

```text
Codex hooks
    ↓
record-hook.mjs
    ↓
.agent-tape/runtime + .agent-tape/tapes
    ├── CLI validate/test
    ├── bundled stdio MCP (list / inspect / fork / save)
    └── optional local HTTP adapter → Branch Canvas
```

## 明确边界

- Structural replay 在注入后的工具结果处停止，不生成新的下游 agent 推理。
- Hosted tools 和未捕获外部状态不在本地 Hook 覆盖范围内。
- Replay confidence 会根据覆盖、redaction 和外部状态捕获情况降级。
- 用户安装开源插件不需要网站、Cloudflare、远程 MCP 或 OpenAI 插件目录审核。

## 开源发布验收

1. 公共仓库 `github.com/jiangkoumo/agenttape` 已创建并推送。
2. GitHub Actions 的 `plugin-release` 和 `optional-surfaces` 检查均通过。
3. 带注释的 `v0.3.1` 标签和 GitHub Release 已发布。
4. 已从公共标签运行 `codex plugin marketplace add jiangkoumo/agenttape --ref v0.3.1` 并安装 `agenttape@agenttape`。
5. GitHub 安装的插件已在新只读 Codex 进程中完成 `list_tapes` MCP 实机调用。

`v0.3.0` 首次发布缺少被 Git 跟踪的预构建 MCP bundle；`v0.3.1` 已修复，并在 CI 中新增 bundle 跟踪检查以防回归。

Branch Canvas 托管和远程 HTTP MCP 保留为可选后续方向，不计入上述完成条件。
