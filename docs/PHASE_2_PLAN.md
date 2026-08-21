# AgentTape Phase 2 计划：可操作的失败证据

计划日期：2026-08-21
目标状态：从“能捕获证据”推进到“能安全分叉、结构化重放并保存可执行回归测试”。

## Phase 2 核心目标

用一个完全离线的 Codex failure fixture 打通以下闭环：

```text
capture → inspect → fork → inject → structural replay → assert → save regression
```

完成后，Branch Canvas 不再展示硬编码 fixture，而是读取真实 `.tape`，并能把一次验证成功的分支保存为可在 CLI/CI 执行的回归测试。

## Phase 2 明确不做

- 第二个 agent adapter。
- 云端存储、团队协作、账号或计费。
- LLM-as-a-judge。
- 自动执行真实的破坏性工具副作用。
- 通用 analytics dashboard。
- 在外部状态未捕获时声称 Hermetic replay。

## Workstream A：冻结 `.tape` 合约

### 目标

把当前证据文件升级为可供 MCP、replay runner、UI 和 CI 共同消费的稳定逻辑 schema。

### 交付物

- `.tape` version 1 JSON Schema。
- run、event、artifact、redaction、fork、injection、assertion 的字段定义。
- schema migration / unsupported-version 错误策略。
- 至少 3 个固定 fixture：permission denied、timeout、malformed JSON。
- replay confidence 的计算输入和降级规则。

### 验收标准

- fixture 能通过 schema validator。
- 缺少必填字段或使用未知 major version 时返回明确错误。
- secrets 不出现在 fixture、日志或错误消息中。
- schema 文档可以脱离实现单独阅读。

## Workstream B：本地 MCP server

### 目标

让 Codex 可以通过插件工具直接读取并操作 AgentTape 数据，而不是依赖 shell 文本解析。

### 首批工具

- `list_tapes`：列出捕获记录及失败摘要。
- `inspect_tape`：读取 run、event、failure 和 replay confidence。
- `fork_run`：从明确 event boundary 创建 branch manifest。
- `save_regression`：把已验证 branch 保存为 regression `.tape`。

### 验收标准

- 工具输入输出有稳定 schema。
- 默认只读取当前 workspace 的 `.agent-tape/`。
- 路径遍历、符号链接逃逸和越界输出被拒绝。
- 写操作不会覆盖已有文件，除非调用方显式提供允许覆盖的选项。
- MCP server 可由插件 manifest 启动，并有独立集成测试。

## Workstream C：Structural replay 与 failure injection

### 目标

在不重新调用模型的情况下重放 fork boundary 之前的已捕获事件，并对一个受支持条件执行分支验证。

### 首批 injection

- `permission_denied`
- `timeout`
- `malformed_json`
- `truncated_response`

### 安全规则

- 默认只允许 recorded-result substitution。
- live tool 或 live model 调用必须显式进入 Live fork 模式。
- 未知工具、缺失依赖或不完整状态必须停止并降低 confidence。
- 可能产生外部副作用的工具默认拒绝 live execution。

### 验收标准

- fixture 的 fork boundary 之前模型调用数为 0。
- 相同 fixture 和 injection 产生稳定的结构化结果。
- 原始失败与 fork 结果可以生成机器可读 diff。
- 不受支持的 replay 明确返回 Playback only 或失败原因。

## Workstream D：Assertions 与 CI runner

### 目标

让保存后的 regression `.tape` 成为真正可执行的测试工件。

### 首批 assertion

- event/result 字段等值断言。
- 必须出现 / 不得出现的工具调用。
- 最大重试次数。
- 最终状态。
- replay confidence 下限。

### CLI 目标

```bash
agenttape test tests/github-permission.tape
```

### 验收标准

- 断言全部通过时退出码为 0。
- 任一断言失败时退出码非 0，并输出可读 diff。
- runner 在无网络、无 API key 条件下运行 fixture。
- 提供最小 GitHub Actions 示例。

## Workstream E：Branch Canvas 接入真实数据

### 目标

保留已通过 Design QA 的界面结构，用 MCP 返回的数据替换硬编码状态。

### 交付物

- tape selector / 当前 tape 加载状态。
- 真实 event graph、failure marker 和 fork result。
- loading、empty、unsupported、redacted 和 replay-failed 状态。
- `Change condition` 调用 `fork_run`。
- `Turn branch into test` 调用 `save_regression`。

### 验收标准

- 参考 fixture 能完整走通 UI 主流程。
- 原始失败与结构化 injected fork 的 diff 来自真实数据。
- UI 明确显示 replay confidence 和 0 model calls 证据。
- 1440 × 1024 主流程无遮挡、无异常溢出、无 console error。
- 更新后的 `design-qa.md` 为 `passed`。

## 推荐执行顺序

1. Workstream A：schema + fixtures。
2. Workstream B：只读 MCP 工具 `list_tapes` / `inspect_tape`。
3. Workstream C：branch manifest、injection 和 structural replay。
4. Workstream D：assertions runner 和 CLI exit semantics。
5. Workstream B 写工具：`fork_run` / `save_regression`。
6. Workstream E：UI 接入真实数据。
7. 端到端离线 demo 与 CI 示例。

不要从 UI 接口开始倒推 schema；先让 fixture 在 CLI 中完成闭环，再接入视觉层。

## Phase 2 Definition of Done

- [x] version 1 schema 和 3 个 fixture 已提交。
- [x] 4 个 MCP 工具都有 schema、测试和安全边界。
- [x] permission denied fixture 能完成 structural replay。
- [x] fork boundary 之前新增模型调用数为 0。
- [x] 4 种 injection 至少都有一个确定性测试。
- [x] `.tape` assertions 可在本地和 CI 运行。
- [x] assertion 失败返回非零退出码。
- [x] Branch Canvas 使用真实 `.tape` 数据完成主流程。
- [x] replay confidence 与 redaction 状态在 CLI 和 UI 一致。
- [x] build、plugin tests、Sites tests、MCP tests、replay tests 全部通过。
- [x] 浏览器交互和 Design QA 通过。

## 建议拆分的首批开发任务

1. `tape-schema-v1`：schema、validator、fixtures。
2. `mcp-read-tools`：MCP server + list/inspect。
3. `branch-manifest`：fork boundary 和 injection schema。
4. `structural-replay`：recorded-result substitution engine。
5. `assertion-runner`：CLI test 与退出码。
6. `mcp-write-tools`：fork/save regression。
7. `canvas-data-adapter`：真实 tape 接入 UI。
8. `offline-demo-ci`：fixture、README quickstart、GitHub Actions。
