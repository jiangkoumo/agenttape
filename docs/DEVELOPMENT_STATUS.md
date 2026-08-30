# AgentTape 开发状态

更新时间：2026-08-30
版本状态：0.4.3 / 已完成联合测试修复、可提交回归收口和发布门禁加固
当前里程碑：让真实 Codex 失败稳定变成可提交的离线回归

## 一句话状态

AgentTape 已完成本地“捕获 → 检查 → 分叉 → 注入 → 结构化重放 → 断言 → 保存回归”闭环。Codex 插件是正式产品；Branch Canvas 和远程 HTTP MCP 是可选开发组件，不是安装或开源发布前置条件。

## 当前能力

| 领域 | 状态 | 已验证事实 |
| --- | --- | --- |
| Hooks recorder / redaction | 完成 | 覆盖当前 11 类 Codex Hook；真实 Bash 退出码、提示词脱敏、24 路并发写入，以及缺失 `PostToolUse` 时带 transcript provenance 的脱敏合成终止边界均已验证 |
| Tape schema / fixtures | 完成 | JSON Schema、validator、3 个合成 fixture |
| Bundled stdio MCP | 完成 | `list_tapes`、`inspect_tape`、`fork_run`、`save_regression` |
| Structural replay | 完成 | 5 种 recorded-result injection（含 rate_limited 429），0 model calls / 0 live tools；raw capture 可在 fork 前派生 confidence，合成终止边界保守标为 low |
| Assertions / CLI | 完成 | 7 类断言（含 tool_order）；自包含 bundled CLI 可在无仓库依赖的安装缓存中执行全部已保存回归 |
| Repository marketplace | 完成 | marketplace 名为 `agenttape`，插件源为 `./plugins/agenttape` |
| Plugin validation | 完成 | 当前 Codex 插件校验器、单测和重新安装后的实机 MCP 调用通过 |
| Open-source metadata | 完成 | MIT、README、SECURITY、CONTRIBUTING、Code of Conduct、Changelog |
| Public GitHub release | 完成 | `jiangkoumo/agenttape`、`v0.4.3` Release 和公共 GitHub Actions 均已验证 |

## 关键验证证据

- 真实 Codex CLI 项目执行 `npm test` 并退出 7；capture 状态为 failed，5 个实际 Hook 事件连续，伪密钥未出现在 tape 中。
- 同一真实 capture 经 `list_tapes → inspect_tape → fork_run → save_regression` 保存后，由目录级 runner 输出 `PASS 1/1 regression tapes`。
- 保存后的回归由 CLI 执行：`PASS tape_regression_9f680719a4a7 4/4 assertions`。
- 从公开 GitHub `v0.3.1` 全新安装后，只读 Codex 进程经工具搜索实机调用 `agenttape/list_tapes`，返回 `tape_fixture_permission_denied`。
- MCP 路径遍历、符号链接、超大文件、无效 schema、重复写入和覆盖请求均有拒绝测试。
- 当前插件通过 `plugin-creator` 校验器；标准 `.mcp.json` 配置已在安装缓存中验证。
- 插件发行测试和 bundle 构建通过；可选组件仍有独立全量测试与构建。
- 在独立的 ToolFence 工程中，真实 Bash 命令以退出码 1 失败；AgentTape 捕获 5 个连续 Hook 事件、标记 1 个失败工具调用，并把 `permission_denied` 结构分支保存为 4 断言回归。
- 从公开 `v0.4.2` 标签干净安装后，ToolFence 回归由安装缓存中的 bundled CLI 输出 `PASS 1/1 regression tapes`；ToolFence 业务源码未修改或推送。
- 联合验证场景 1 的真实 Codex 任务 `20260829-agenttape-deny-s1-a3` 已通过：ToolFence 仅产生 1 个 `deny-dogfood-cat` 决策、无 result、上游调用为 0；AgentTape 产出 `tape_e8e95525a4ed`，状态 `failed`，4 个真实 Hook 事件中计入 1 次工具调用和 1 次失败，测试 marker 零泄漏。
- 联合验证场景 2 的真实任务 `20260829-agenttape-approval-s2-a1` 已完成但未通过：ToolFence 在约 60 秒后以 `Approval timed out` fail closed，pending 清理、无 result、零上游；AgentTape tape `tape_89066408abc0` 虽为 `failed`，却把 transcript 中可用的审批超时结果降格为通用 `tool_error / status failed`，且因缺失 `PostToolUse` 只能进行 `playback_only` 分叉。
- 独立重测 `20260829-agenttape-approval-s2-a2` 稳定复现同一问题：ToolFence 再次正确超时拒绝且零转发，AgentTape `tape_78cdc376b9d5` 仍丢失 transcript 中的 `Approval timed out` 语义；这不是偶发宿主时序问题。
- 修复后的 `20260829-agenttape-approval-s2-a3` 已通过：ToolFence 再次在约 60 秒后 fail closed、pending 清理、无 result、零上游；AgentTape `tape_3f9f9323292c` 明确记录 `timeout / The recorded approval request timed out.`，且未保存原始 ToolFence 错误文本或规则名。
- 五场景复盘后的加固已完成：新 capture 可把缺失 `PostToolUse` 的明确拒绝/超时转成带 provenance 的可分支安全边界；Stop/迟到 Post 只生成一份连续 tape；`save_regression` 不再保存原始 tool input/output、嵌套 inspect/list inventory、绝对路径或不可安全重建的 expected；全量 `npm test` 通过。

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
3. 带注释的 `v0.4.3` 标签和 GitHub Release 已发布。
4. 已从公共标签运行 `codex plugin marketplace add jiangkoumo/agenttape --ref v0.4.3` 并安装 `agenttape@agenttape`。
5. GitHub 安装的插件已在 ToolFence 中通过 capture verifier 和离线回归 runner 实机调用。

## 当前联合验证阶段

- 双向职责、共同证据字段、变更到场景映射和镜像同步规则见 [`AGENTTAPE_TOOLFENCE_ALIGNMENT.md`](./AGENTTAPE_TOOLFENCE_ALIGNMENT.md)。
- AgentTape MCP 经 ToolFence 的项目级配置、Policy 和直连 SDK/fixture 冒烟已经完成。
- 真实 Codex 场景 1（策略拒绝）已完成；它先暴露了缺失 `PostToolUse` 时失败未入 tape 的 AgentTape 缺陷，修复后由全新任务 `a3` 复测通过。fixture 派生的 timeout/permission regression 仍不得代替后续新 capture。
- 场景 2（审批超时）的失败语义丢失已修复，并由新的 `a3` 真实任务复测通过。场景 3 首轮发现 ToolFence 未把 MCP `isError: true` 计入 audit error；ToolFence 已做最小修复，并由新的 `20260829-agenttape-upstream-s3-a2` 真实任务复测通过。
- 五个真实联合场景现已全部完成。场景 4 修复了“inspect 返回旧 tape 的 failed 状态被误判为当前调用失败”的递归载荷串层；`20260829-agenttape-triage-s4-a2` 的 7 次只读调用均为成功并有 result hash。场景 5 的 live capture 是 `tape_ed0181387421`，经 Broker `allow-once` 生成 regression `tape_regression_85bc9b13cda8`；复盘后该 artifact 已由官方保存实现重生成成不含原始工具载荷的事件骨架，保留 5 条安全断言、置信度 `0.40 / low`，发布目录回归 2/2 通过。
- 在 AgentTape 仓库开发时 AgentTape 是主项目；在 ToolFence 仓库开发时角色反转，由 AgentTape 记录和分诊真实失败。每轮只改一个主项目，保留双边事件关联、隐私复核和最小复现。

0.4.1 的基础闭环证据见 [`V0_4_1_VALIDATION.md`](./V0_4_1_VALIDATION.md)，ToolFence 跨项目和公开安装版证据见 [`V0_4_2_VALIDATION.md`](./V0_4_2_VALIDATION.md)。上述五个真实场景的执行证据见 [`TOOLFENCE_DOGFOODING.md`](./TOOLFENCE_DOGFOODING.md)；后续再按已确认的实际失败类型扩展断言和 replay 边界。

Branch Canvas 托管和远程 HTTP MCP 保留为可选后续方向，不计入上述完成条件。
