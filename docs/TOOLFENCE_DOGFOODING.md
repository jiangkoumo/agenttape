# AgentTape × ToolFence 联合开发与真实场景验证

更新时间：2026-08-30

本手册是双向 [AgentTape × ToolFence 对齐契约](./AGENTTAPE_TOOLFENCE_ALIGNMENT.md) 的 AgentTape 侧执行附录。它用于在开发 AgentTape 的同时，让 ToolFence 代理受测的 MCP 调用，并用两边的证据发现真实集成问题。AgentTape 是本轮主项目；ToolFence 是固定版本的伴随观察器。只有真实证据指出问题归属后，才修改对应项目。

## 当前状态与证据口径

| 阶段 | 状态 | 可以证明什么 |
| --- | --- | --- |
| 项目级 MCP、Policy、Broker 和审计搭建 | 已完成冒烟 | ToolFence 可以启动 AgentTape stdio MCP，基础 allow / ask / deny 规则可命中 |
| 直连 MCP SDK 冒烟与 fixture 派生回归 | 已完成冒烟 | 代理链和离线 runner 基础可用，但不是 Codex 主机里的真实开发调用 |
| 下述五个真实 Codex 场景 | 场景 1–5 已通过 | 策略拒绝、审批超时、允许后的上游失败、只读分诊和一次性审批回归写入均已在真实宿主闭环 |

这里的“真实”必须同时满足：

1. 从重新启动后的全新 Codex 任务发起，而不是由独立 SDK 脚本直接写 JSON-RPC。
2. AgentTape 插件 Hook 已启用，受测 MCP 工具由 Codex 发现并实际调用。
3. 受测调用明确走项目级 fenced 别名，并产生 ToolFence 决策证据。
4. 使用与共同契约一致的唯一 `JOINT_RUN_ID`，能把 ToolFence 时间窗、工具和 AgentTape 事件对齐。
5. 负向场景可以使用无副作用的本地 fixture，但实际 Codex → MCP → ToolFence 路径不能被模拟。

`sessionId`、`sourceTapeId` 或输入来自 `fixture-*` 的回归，只能算 fixture/冒烟证据。它不能替代本轮的新 capture，也不能计入完成条件。

## 覆盖边界

```text
Codex task
  ├─ built-in shell / Git / file tools
  │    └─ AgentTape hooks record only
  └─ explicitly selected fenced MCP alias
       ├─ ToolFence policy / approval / redaction / audit
       └─ upstream stdio MCP
            └─ AgentTape hooks record the host-side tool event
```

- ToolFence 只代理从它的 stdio wrapper 发出的 MCP `tools/call`。
- Codex 内置终端、Git、文件编辑、Hosted tools 和 Hook 自身不会经过 ToolFence；AgentTape 可以记录它们，但不能据此声称 ToolFence 已执行策略。
- ToolFence 当前工作树把 `list_tapes`、`inspect_tape`、`fork_run` 精确归一化为 `fs.read`，把 `save_regression` 归一化为 `fs.write`，并把 `workspaceRoot/tests/agenttape/<filename>` 作为写入资源；映射只对 AgentTape server 别名生效，同名未知工具仍 fail closed。AgentTape 继续负责最终路径和文件名校验。
- Structural replay 只做 recorded-result substitution。它不会再次调用模型或真实工具，也不能证明失败后的下游推理会如何变化。

## 本地文件与提交边界

以下内容只保留在本机，并应通过 `.git/info/exclude` 或等价的本地忽略规则排除：

```text
.codex/config.toml
.toolfence/
.agent-tape/runtime/
.agent-tape/tapes/
```

不要提交原始 prompt、ToolFence audit、Broker token、真实 capture 或未经人工检查的 regression。唯一可能进入版本库的 dogfood 产物，是经过脱敏、断言复核并通过离线 runner 的 `tests/agenttape/*.tape`。

开始前先执行 `git status --short` 并记录基线。测试结束后只比较新增项，不要清空或覆盖已有用户数据。

## 一次性接入

### 1. 固定版本和构建产物

记录 AgentTape 与 ToolFence 的 commit、Node.js 版本和 Codex 版本。AgentTape 改过 MCP 或 CLI 源码时，先运行：

```bash
npm run build:plugin
```

ToolFence 改过源码时，在 ToolFence checkout 中先构建并完成其常规测试。联合验证应调用构建后的 `dist/cli.js` 和 AgentTape 的 `plugins/agenttape/dist/mcp-server.mjs`，避免把陈旧 bundle 当成产品行为。

### 2. 配置项目级 fenced 别名

在可信任的 AgentTape 项目中使用本地 `.codex/config.toml`。把下面的占位符替换成当前机器的绝对路径；不要提交替换后的文件：

```toml
[mcp_servers.agenttape_fenced]
command = "<NODE_BIN>"
args = [
  "<TOOLFENCE_ROOT>/dist/cli.js",
  "wrap",
  "--policy", "<AGENTTAPE_ROOT>/.toolfence/dogfood-policy.yaml",
  "--server", "agenttape_fenced",
  "--workspace", "<AGENTTAPE_ROOT>",
  "--audit", "<AGENTTAPE_ROOT>/.toolfence/audit/<JOINT_RUN_ID>.jsonl",
  "--approval", "broker",
  "--",
  "<NODE_BIN>", "<AGENTTAPE_ROOT>/plugins/agenttape/dist/mcp-server.mjs",
]
cwd = "<AGENTTAPE_ROOT>"
required = true
startup_timeout_sec = 15
tool_timeout_sec = 90
default_tools_approval_mode = "auto"
```

Codex 本地客户端支持项目级 `.codex/config.toml` 和 stdio MCP；项目必须先被信任。配置改变后必须重启 Codex，已经启动的任务不会动态获得新 MCP。参见 [Codex 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

如果插件提供的 direct `agenttape` 端点仍能被调用，不要把本轮称为“强制经过 ToolFence”。应在全新任务中检查工具来源，并在每个测试 prompt 中明确只允许 `agenttape_fenced`；无法辨认来源时停止本轮。

### 3. 使用最小策略

本轮基础策略应默认拒绝，只开放明确工具：

```yaml
version: 1
default: deny
redactSecrets: true

rules:
  - id: allow-agenttape-read-and-fork
    effect: allow
    operations: [fs.read]
    servers: [agenttape_fenced]
    tools: [list_tapes, inspect_tape, fork_run]

  - id: ask-agenttape-save-regression
    effect: ask
    operations: [fs.write]
    servers: [agenttape_fenced]
    tools: [save_regression]
```

每个临时 fixture 别名还要同时限制 `server`、`tool`、规范化 operation 和资源/命令/host。不要用 `default: allow`，也不要仅按工具名放行。

### 4. 启动前检查

在连接 Codex 前完成：

```bash
<NODE_BIN> <TOOLFENCE_ROOT>/dist/cli.js policy check \
  --policy <AGENTTAPE_ROOT>/.toolfence/dogfood-policy.yaml

<NODE_BIN> <TOOLFENCE_ROOT>/dist/cli.js doctor \
  --policy <AGENTTAPE_ROOT>/.toolfence/dogfood-policy.yaml \
  -- <NODE_BIN> <AGENTTAPE_ROOT>/plugins/agenttape/dist/mcp-server.mjs
```

需要审批的场景再在独立终端启动 Broker：

```bash
<NODE_BIN> <TOOLFENCE_ROOT>/dist/cli.js broker
```

另一个终端可以运行 `approvals` 查看或处理请求。场景 2 必须故意不处理唯一请求；场景 5 只能选择 `allow-once`。

## 每个真实任务的联合开发循环

1. 生成唯一 `JOINT_RUN_ID`，例如 `20260829-agenttape-permission-a1`，并为该任务使用新的 audit 文件和 fixture 日志文件。
2. 记录两项目 commit、构建时间、Codex/Node 版本、测试别名、Policy hash 和开始时间。
3. 重启 Codex，创建一个只完成单一场景的全新任务。Prompt 中写入 `JOINT_RUN_ID`，禁止自动改用 direct MCP 或内置工具完成受测动作。
4. 执行一次受测调用；除场景明确要求外，不重试、不自动修复、不批准其他请求。
5. 记录结束时间、AgentTape `tapeId/sessionId`、ToolFence `proxyRunId/clientSessionId/requestId`、decision、是否有 result、approval ID/resolution（如有）、dispatch、上游调用计数和文件副作用。
6. 用 `agenttape_fenced` 做只读检查。比较时间、server/tool、唯一 marker、失败状态和 redaction；不要只靠可能重复的 request ID 关联。
7. 先归因再修改：AgentTape、ToolFence、Codex 主机/配置或测试环境。证据不足时标为“未定”，不要同时改两个项目。
8. 运行与改动相称的测试，再检查 `git status --short`。未经复核的 runtime、audit 和 tape 保持本地。

建议维护一张本地证据表：

| JOINT_RUN_ID | AgentTape tape/session | MCP alias / tool | ToolFence requestId | decision / result | Broker resolution | 上游次数 | 副作用 | 归属 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20260829-agenttape-deny-s1-a3` | `tape_e8e95525a4ed` / 本地 session 未提交 | `dogfood_shell_deny` / `execute_command` | `2` | `deny-dogfood-cat` / 无 result | 不适用 | `0` | 无；marker 零泄漏 | AgentTape 缺陷已修复 | 通过 |
| `20260829-agenttape-approval-s2-a1` | `tape_89066408abc0` / 本地 session 未提交 | `dogfood_shell_ask` / `execute_command` | `2` | `ask-dogfood-marker` 最终 deny / 无 result | timeout；pending 已清理 | `0` | 无 | AgentTape | 未通过：超时语义丢失 |
| `20260829-agenttape-approval-s2-a2` | `tape_78cdc376b9d5` / 本地 session 未提交 | `dogfood_shell_ask` / `execute_command` | `2` | `ask-dogfood-marker` 最终 deny / 无 result | timeout；pending 已清理 | `0` | 无 | AgentTape | 未通过：稳定复现 |
| `20260829-agenttape-approval-s2-a3` | `tape_3f9f9323292c` / 本地 session 未提交 | `dogfood_shell_ask` / `execute_command` | `2` | `ask-dogfood-marker` 最终 deny / 无 result | timeout；pending 已清理 | `0` | 无 | AgentTape 缺陷已修复 | 通过 |
| `20260829-agenttape-upstream-s3-a2` | `tape_51e49b08d140` / 本地 session 未提交 | `dogfood_http_failure` / `http_request` | `2` | allow / result `error: true` | 不适用 | `1` | 无 | ToolFence 缺陷已修复 | 通过 |
| `20260829-agenttape-triage-s4-a2` | `tape_5dfeb8c37e67` / 本地 session 未提交 | `agenttape_fenced` / 7 次只读调用 | `2`–`8` | 7 allow / 7 result | 不适用 | `0` live tool | 无写入 | AgentTape 缺陷已修复 | 通过 |
| `20260830-agenttape-regression-s5-a2` | live `tape_ed0181387421`；regression `tape_regression_85bc9b13cda8` | `agenttape_fenced` / `save_regression` | `2` | ask 后 allow / result | `allow-once`；pending 已清理 | `0` live tool | 新增 1 个复核回归 | AgentTape 隐私缺口已修复 | 通过 |

上述历史 audit 由修复前版本产生，没有新的关联和授权字段。ToolFence 当前工作树已新增 `proxyRunId/clientSessionId`，审批 decision 还保留 `approvalId/resolution`，deny/timeout 写入 `dispatch: not-forwarded`；独立 audit 文件、明确时间窗和上游计数仍是必要取证措施。

## 五个真实开发测试场景

五个场景必须按顺序、分别在全新 Codex 任务中执行。前三个负向场景可以使用 ToolFence checkout 中的无副作用 stdio fixture，但调用必须由 Codex 真正发起，AgentTape 必须记录真实 Hook 事件。

### 场景 1：策略拒绝危险读取

**目标**：证明 deny 在上游执行前生效，并确认 AgentTape 把宿主返回的拒绝记录为失败工具事件。

**准备**：

- 在 `.agent-tape/runtime/dogfood/<JOINT_RUN_ID>/.env` 放一个明确标注为假的 marker，例如 `DOGFOOD_TOKEN=not-a-secret-<JOINT_RUN_ID>`；不要使用真实凭据。
- 增加临时别名 `dogfood_shell_deny`，上游使用 ToolFence checkout 的 `test/fixtures/action-server.mjs shell`，并用 `TOOLFENCE_FIXTURE_LOG` 指向本轮独立日志。
- 规则仅对 `dogfood_shell_deny / execute_command / shell.exec / cat` 返回 deny。

示例规则：

```yaml
  - id: deny-dogfood-cat
    effect: deny
    operations: [shell.exec]
    servers: [dogfood_shell_deny]
    tools: [execute_command]
    executables: [cat]
```

**执行**：要求 Codex 只用 `dogfood_shell_deny.execute_command` 调用一次 `cat .agent-tape/runtime/dogfood/<JOINT_RUN_ID>/.env`，收到拒绝后立即停止，不得改用内置终端或 direct MCP。

**通过条件**：

- ToolFence 有且只有一个匹配 `deny-dogfood-cat` 的 deny decision。
- 同一 request 没有 result 记录，fixture 日志没有新增调用。
- AgentTape 有对应的 MCP 工具失败事件，marker 与时间窗可对齐。
- 没有文件内容出现在 ToolFence audit 或提交差异中。

**停止条件**：上游日志增加、Codex 绕过 fenced 别名、AgentTape 把拒绝标为成功，或出现任何真实秘密。前两类优先归 ToolFence/主机配置，Hook 状态错误归 AgentTape。

**已执行结果（2026-08-29）**：

- `a2` 真实任务确认 ToolFence 正确拒绝且零转发，但同时暴露 AgentTape 缺陷：Codex transcript 已把 MCP 调用标为 `failed`，Hook 序列却只有 `PreToolUse → Stop`，原 recorder 因缺失 `PostToolUse` 将 tape 错记为 `captured`。
- recorder 已在终止阶段对账未匹配的 `PreToolUse` 与 Codex transcript。当前实现会插入明确标注 `source: codex-transcript`、`postToolUseObserved: false` 的脱敏合成终止边界；它不是宿主 Hook 事件，replay confidence 会因未捕获原始结果降为 low，但可以安全 structural fork。对应回归覆盖在 `tests/plugin-recorder.test.mjs`。
- 修复后的全新任务 `20260829-agenttape-deny-s1-a3` 通过：ToolFence 恰好有 1 个 `deny-dogfood-cat` 决策、无 result、fixture 上游调用为 0；AgentTape tape `tape_e8e95525a4ed` 为 `failed`，4 个事件、1 次工具调用、1 次失败，marker 在 audit、runtime 和 tape 中均为 0 次出现。
- 原始 runtime、capture、audit、项目级 MCP 配置和测试 marker 继续保持本地且不进入提交。

### 场景 2：真实 Broker 审批超时

**目标**：验证 ask 在无人处理时 60 秒 fail closed，且 Codex 的 90 秒工具超时不会先截断证据。

**准备**：增加临时别名 `dogfood_shell_ask`，仍使用无副作用的 `action-server.mjs shell` 和独立上游日志。只允许以下规则进入 ask：

```yaml
  - id: ask-dogfood-marker
    effect: ask
    operations: [shell.exec]
    servers: [dogfood_shell_ask]
    tools: [execute_command]
    executables: [printf]
```

确保 Broker 已运行、Codex `tool_timeout_sec` 大于 60 秒，并且没有遗留的 session grant。

**执行**：要求 Codex 只调用一次 `printf DOGFOOD_APPROVAL_TIMEOUT_<JOINT_RUN_ID>`。看到 Broker 中的请求后，不批准、不拒绝，让 ToolFence 自己超时；Codex 收到结果后立即停止。

**通过条件**：

- 大约 60 秒后记录最终 deny，reason 为审批超时；没有 result，fixture 日志不增加。
- Broker 中对应 pending request 被清理。
- AgentTape 记录一个超时/权限类失败工具事件，而不是成功或永远悬挂。

**停止条件**：Codex 客户端先超时、Broker 不可连接、旧 session grant 自动放行、请求被误批准，或进程无法退出。环境问题先修复后用新的 `JOINT_RUN_ID` 重跑；转发或生命周期错误归 ToolFence；Hook 结果错误归 AgentTape。

**已执行结果（2026-08-29）**：

- 全新任务 `20260829-agenttape-approval-s2-a1` 只调用一次 `dogfood_shell_ask.execute_command`。Broker 请求保持未处理，约 60 秒后 ToolFence 记录 `deny / Approval timed out`；Codex 任务约 74 秒结束，没有先触发 90 秒客户端超时。
- Broker pending 队列已清空；ToolFence audit 只有 1 条最终 decision、没有 result，fixture 日志未创建，上游调用为 0。ToolFence 侧满足本场景条件。
- Codex transcript 的失败结果明确包含 `Approval timed out`，但 AgentTape `tape_89066408abc0` 仅记录 `tool_error / Codex recorded tool status failed before PostToolUse`。超时事实没有进入 tape 的 failure kind/reason，因此本场景不标记通过。
- 对 sequence 3 执行只读 `timeout` 结构分叉时，证据为 0 model calls / 0 live tools，但因为没有 replayable `PostToolUse` 只返回 `playback_only`。未保存 regression，也未触发写入审批。
- recorder 现只在内存中识别 transcript 的审批超时信号，并写入固定安全分类 `timeout / The recorded approval request timed out.`；原始 MCP 错误结果、规则名和潜在 secret 不进入 tape。
- 独立重测 `20260829-agenttape-approval-s2-a2` 再次只调用一次目标工具；Broker 约 60 秒后超时、Codex 约 76.6 秒结束、pending 清空、无 result、fixture 零调用。`tape_78cdc376b9d5` 仍为通用 `tool_error`，而 transcript 明确包含 `Approval timed out`；timeout 分叉仍因缺失 `PostToolUse` 返回 `playback_only`（0 model / 0 live tool）。因此缺陷已稳定复现，修复后的下一轮编号改为 `a3`。
- 修复后的 `20260829-agenttape-approval-s2-a3` 通过：Broker 约 60 秒后超时、Codex 约 75 秒结束、pending 清空、无 result、fixture 零调用；`tape_3f9f9323292c` 为 `failed`，4 个事件、1 次调用、1 次失败，failure kind 为 `timeout`。Tape 不含 ToolFence 原始拒绝文本或 `ask-dogfood-marker`。该历史 tape 不被事后改写，因此仍是 `playback_only`；修复后的新 capture 会生成带 transcript provenance 的低置信度合成终止边界并可 structural fork，仍保持 0 model / 0 live tool。

### 场景 3：允许后的真实上游网络失败

**目标**：区分“Policy 已允许”和“上游执行失败”，并核对 MCP `result.isError` 与 ToolFence audit `error` 的语义是否一致。

**准备**：

- 增加临时别名 `dogfood_http_failure`，上游使用 `test/fixtures/action-server.mjs http` 和独立日志。
- 选择一个已确认没有监听器的 loopback 端口，URL 带 `/dogfood/<JOINT_RUN_ID>`；不要访问公网或真实服务。
- 只允许这个别名的 loopback GET：

```yaml
  - id: allow-dogfood-loopback-get
    effect: allow
    operations: [net.request]
    servers: [dogfood_http_failure]
    tools: [http_request]
    hosts: ["127.0.0.1"]
    methods: [GET]
```

**执行**：要求 Codex 只用该工具 GET 一次标记 URL，不重试，也不换端口。

**通过条件**：

- ToolFence 先记录 allow decision，再记录一个 result hash；fixture 日志恰好有一次上游调用。
- 上游返回 `isError: true`，AgentTape 将该工具调用记录为失败。
- 明确记录 ToolFence result 的 `error` 值。若它仍为 `false`，把“JSON-RPC 成功包内的 MCP `isError` 未计为 audit error”记为 ToolFence 候选问题，不要改 AgentTape 来掩盖。

**停止条件**：端口意外提供真实服务、发生公网请求、工具重试、没有 result hash，或失败被 AgentTape 标为成功。

**执行结果（2026-08-29）**：

- 首轮 `20260829-agenttape-upstream-s3-a1` 中，Policy 正确 allow、fixture 恰好执行一次、MCP 返回 `isError: true`、AgentTape 也记录失败，但 ToolFence result 错记为 `error: false`。问题归属 ToolFence；没有改 AgentTape 掩盖。
- ToolFence 现把 JSON-RPC 成功包内的 MCP `result.isError === true` 纳入 audit error，并新增集成回归；ToolFence 全量 108 个测试和 typecheck 均通过。
- 新任务 `20260829-agenttape-upstream-s3-a2` 复测通过：一次 allow、一次 result hash 且 `error: true`，fixture 恰好一次 loopback GET；`tape_51e49b08d140` 为 failed。该历史 tape 的只读 fork 仍为 `playback_only`；新 capture 的缺失 `PostToolUse` 路径已由带 provenance 的合成终止边界修复，并保持 0 model / 0 live tool。

### 场景 4：只读证据分诊

**目标**：在不执行模型或真实工具的前提下，验证 AgentTape 能否让开发者从前三个真实 capture 找到边界、失败和脱敏证据。

**执行**：在新任务中只使用 `agenttape_fenced`：

1. `list_tapes` 找出前三个 `JOINT_RUN_ID` 对应的 capture。
2. 对每个 capture 调用 `inspect_tape`，核对事件连续性、失败标记、输入/输出 redaction 和 replay confidence。
3. 各选择失败前的合法边界调用 `fork_run`；权限场景注入 `permission_denied`，超时场景注入 `timeout`，网络场景选择最接近实际证据的 injection。

**通过条件**：

- 三类工具的 ToolFence decision 均命中只读 allow 规则，并各有 result hash。
- 所有 fork 都报告 0 model calls 和 0 live tool calls；原始 capture 不被修改。
- `inspect_tape` 能由 `JOINT_RUN_ID` 找到三次真实调用，且没有暴露 synthetic marker 以外的敏感数据。
- 推断与事实分开：injection 只写作 what-if 分支，不写作原失败的真实后续。

**停止条件**：找不到真实 capture、只能找到 fixture tape、事件缺失、边界无效、出现真实 secret，或只读调用触发写入。Capture/inspect/replay 问题归 AgentTape；审计、脱敏或代理生命周期问题按证据归 ToolFence。

**执行结果（2026-08-29 至 2026-08-30）**：

- `20260829-agenttape-triage-s4-a1` 的 7 次调用在 ToolFence 侧全部 allow 且有 result hash，但 AgentTape 把 `list_tapes`/`inspect_tape` 返回的旧 tape `status: failed` 递归误判成当前调用失败。录制器现只识别工具响应顶层失败信号，并新增真实形状回归测试。
- 修复后的 `20260829-agenttape-triage-s4-a2` 完成 1 次 list、3 次 inspect、3 次 fork；ToolFence 为 7 allow / 7 result，AgentTape `tape_5dfeb8c37e67` 为 captured、7 次调用、0 次失败。三个修复前旧 capture 仍为 `playback_only`，但都保持 0 model / 0 live tool；新 raw capture 会在 inspect 时派生保守 replay confidence，缺失 Hook 结果的合成边界为 low，不混写为完整结果捕获。
- 宿主用量上限发生在全部 7 次调用完成之后，只影响任务最终答复；audit 和 capture 均完整，因此不把它计为产品失败，也没有拼接或重试该轮调用。

### 场景 5：一次人工复核的回归写入

**目标**：验证从真实 capture 到可提交离线回归的最后一公里，同时检查 ToolFence 的一次性审批是否足够清楚。

**执行**：

1. 从场景 4 中选择一个最能代表真实产品问题、且不是现有 fixture 重复项的 source tape。
2. 人工复核 source、boundary、injection、至少一条有意义的 assertion、filename、redaction 和 replay confidence。
3. 用 `agenttape_fenced.save_regression`，设置描述性文件名和 `overwrite: false`。
4. Broker 中只选择 `allow-once`。不要选择 `allow-session`，也不要预先批量授权。把 approval ID、resolution 时间和 `allow-once` 命令/终端结果记入本地证据表；不要提交 Broker 原始数据。
5. 写入后运行：

```bash
node plugins/agenttape/dist/agenttape-cli.mjs test tests/agenttape/<NEW_FILE>.tape
npm run test:tapes
```

**通过条件**：

- ToolFence 当前工作树的 audit 会在审批 decision 中记录 `approvalId` 和真实 `resolution`，因此能区分 `allow-once` 与 `allow-session`；历史场景 5 audit 没有这些字段，仍由当时保留的本地 Broker resolution 证明。
- `tests/agenttape/` 只新增一个预期文件，未覆盖已有文件，其他目录没有写入。
- 单文件和目录级 bundled CLI 均通过，且回归不含真实 prompt、token、绝对本机路径、原始 tool input/output、嵌套 inventory 或其他隐私数据。
- `git diff` 能说明每条断言与真实问题的关系；仅在人工复核后才提交该 `.tape`。

**停止条件**：出现 session 自动放行、写到允许目录外、覆盖旧文件、断言只验证 fixture 固有事实、CLI 失败，或 regression 仍引用 `fixture-*` 作为本轮真实来源。写入/runner/replay 问题归 AgentTape；审批或审计问题归 ToolFence。

**执行结果（2026-08-30）**：

- 写入前人工复核发现 `save_regression` 会克隆完整真实 capture，可能携带真实 prompt、session/tool-use ID 和本机绝对路径；后续复核又发现嵌套 `inspect_tape`/`list_tapes` 输出和自定义 assertion expected 仍可携带本地 inventory。AgentTape 现递归最小化 capture，并只保存事件类型与工具名骨架；所有原始 tool input/output、details、artifacts、嵌套 inventory 和本地身份均不进入可提交 artifact，自定义 expected 从安全注入结果重建。
- `20260830-agenttape-regression-s5-a1` 经一次 `allow-once` 后因任务错误使用 `source_id`/`type` 参数而被 schema 拒绝；没有文件、没有重试，audit 正确记录 error result。新运行 ID `a2` 不复用该审批。
- `20260830-agenttape-regression-s5-a2` 的本地 approval ID 不提交；保留的 Broker resolution 明确为 `allow-once`，audit 为 `ask-agenttape-save-regression` allow + 成功 result，pending 清空。仅新增 `real-agenttape-list-tapes-malformed-json.tape`，旧文件哈希不变。
- 新回归来自真实场景 4 capture `tape_5dfeb8c37e67`，注入 `malformed_json`。隐私加固后使用官方保存实现对同一精确目标重生成：保留 5 条可从安全回放重建的断言，置信度按“未保留原始工具结果”降为 `0.40 / low`；隐私扫描无真实 prompt、token、绝对本机路径、tool input/output、inventory tape ID 或 fixture source，发布目录级 bundled CLI 为 2/2。该维护重生成不是新的真实场景，不改变原 `allow-once` 运行证据。

## 本轮完成条件

只有全部满足，才能把“首轮真实联合验证”标为完成：

- 至少 3 个由全新 Codex 任务生成的真实 capture，且 session/source 不是 fixture。
- 各有 1 次可审计的策略拒绝、审批超时和允许后的上游失败。
- deny/timeout 均没有上游 result 或 fixture 调用；上游失败有一次 allow、一次 result 和一次真实执行。
- `list_tapes`、`inspect_tape`、`fork_run` 均通过 fenced alias 完成，所有 structural fork 为 0 model / 0 live tool。
- 只有 1 个由 Broker resolution 证明经 `allow-once` 批准、人工复核且 bundled CLI 通过的新 regression。
- 未提交 raw runtime、capture、audit、Broker 数据、项目级 MCP 配置、绝对本机路径或真实 secret。
- 每个异常都有证据、严重度、归属和最小复现；没有因为联合测试而无证据地同时改 AgentTape 和 ToolFence。

结果：以上完成条件已全部满足，首轮真实联合验证完成。

## 已验证结论与后续摩擦

- 本地 sibling checkout 需要多个绝对路径，安装和迁移成本偏高。
- Codex 中插件自带 direct MCP 的禁用/同名 shadow 行为不够直观，必须在重启后的新任务验证工具来源。
- 当前 ask 规则仍不能限制审批 UI 只提供 `allow-once`；`save_regression` 依赖评审者不选择 session 授权，但 audit 已能准确记录实际选择。
- ToolFence audit 已新增 proxy-run/client-session、approval ID/resolution 和 deny/timeout `not-forwarded` 证据；旧 audit 仍需按时间窗读取。
- AgentTape 四个工具已按精确 server/tool 归一化为 `fs.read`/`fs.write`，并为 `save_regression` 暴露受限目标资源；未知工具仍 fail closed。
- ToolFence 已修复并复测 MCP `result.isError` 到 audit `error` 的映射；保留集成测试防止回归。

`isError` 审计映射、嵌套失败载荷串层、缺失 `PostToolUse` 的安全合成边界、replay confidence、递归 regression 隐私最小化、审批审计和 AgentTape 动作归一化均已有自动化回归。剩余条目是安装/Host 与审批 UI 摩擦，不影响本轮五个场景完成。
