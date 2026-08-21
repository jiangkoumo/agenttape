# AgentTape 开发状态

更新时间：2026-08-21
版本状态：0.3.0 / 开源 Codex 插件发布候选
当前里程碑：公开 Git marketplace、版本标签和公开安装验收

## 一句话状态

AgentTape 已完成本地“捕获 → 检查 → 分叉 → 注入 → 结构化重放 → 断言 → 保存回归”闭环。Codex 插件是正式产品；Branch Canvas 和远程 HTTP MCP 是可选开发组件，不是安装或开源发布前置条件。

## 当前能力

| 领域 | 状态 | 已验证事实 |
| --- | --- | --- |
| Hooks recorder / redaction | 完成 | 支持本地 Codex 生命周期、权限和工具事件，输出 redacted tape v1 |
| Tape schema / fixtures | 完成 | JSON Schema、validator、3 个合成 fixture |
| Bundled stdio MCP | 完成 | `list_tapes`、`inspect_tape`、`fork_run`、`save_regression` |
| Structural replay | 完成 | 4 种 recorded-result injection，0 model calls / 0 live tools |
| Assertions / CLI | 完成 | 6 类断言；通过为 0，失败为非零且 diff 脱敏 |
| Repository marketplace | 完成 | marketplace 名为 `agenttape`，插件源为 `./plugins/agenttape` |
| Plugin validation | 完成 | 当前 Codex 插件校验器、单测和重新安装后的实机 MCP 调用通过 |
| Open-source metadata | 完成 | MIT、README、SECURITY、CONTRIBUTING、Code of Conduct、Changelog |
| Public GitHub release | 待外部步骤 | 需要恢复 GitHub CLI 登录、创建公开仓库、推送 tag 和 Release |

## 关键验证证据

- UI 从合成的 permission-denied tape 加载工具失败，并可生成 timeout 分支。
- 保存后的回归由 CLI 执行：`PASS tape_regression_9f680719a4a7 4/4 assertions`。
- 全新只读 Codex 进程实机调用 `agenttape/list_tapes`，返回 `tape_fixture_permission_denied`。
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

## 开源发布门槛

1. 创建 `github.com/jiangkoumo/agenttape` 公共仓库并推送当前源码。
2. GitHub Actions 的 `plugin-release` 检查在公共仓库通过。
3. 创建签名或带注释的 `v0.3.0` 标签和 GitHub Release。
4. 从公开仓库运行 `codex plugin marketplace add jiangkoumo/agenttape`。
5. 新 Codex 任务安装 `agenttape@agenttape` 并实机调用 `list_tapes`。

Branch Canvas 托管和远程 HTTP MCP 保留为可选后续方向，不计入上述完成条件。
