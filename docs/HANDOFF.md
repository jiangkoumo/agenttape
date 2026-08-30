# AgentTape 项目交接

更新时间：2026-08-30
当前阶段：0.4.3 已收口五场景联合测试缺陷并完成 GitHub 发布

## 正式产品

- Codex 插件：`plugins/agenttape/`。
- Git marketplace：`.agents/plugins/marketplace.json`，公开名称为 `agenttape`。
- 覆盖当前 11 类 Codex Hook 的 recorder、redaction、tape v1 schema、validator 和 fixtures。
- Bundled stdio MCP：`list_tapes`、`inspect_tape`、`fork_run`、`save_regression`。
- Structural replay、5 种 injection、7 类 assertion runner 和 CLI exit semantics。
- MIT License、开源贡献规范、安全政策和 GitHub Actions。

Branch Canvas、Sites 构建适配和远程 HTTP MCP 是可选开发组件。它们不得被描述成安装本地 Codex 插件的依赖。

## 验证命令

```bash
npm ci
npm run test:plugin-release
npm run test:tapes
npm run build:plugin
git diff --check
```

只有修改可选 Branch Canvas、Sites 或远程 HTTP MCP 时才需要额外运行 `npm test` 和 `npm run build`。

插件发布还应通过当前 `plugin-creator` 校验器，并在公开 Git marketplace 安装后由全新只读 Codex 进程实际调用一次 `list_tapes`。

## 重要边界

- 不要声称 bit-exact、complete 或 blanket deterministic replay。
- Structural replay 在 injected tool result 处停止；不会生成新的下游 model reasoning。
- Hosted tools 和未捕获 external state 不在 Hook coverage 内。
- 不要把真实 `.agent-tape/runtime/` 或未经人工检查的 capture 提交到公共仓库。
- 回归写操作只允许 `tests/agenttape/` 且默认不覆盖。

## 已完成发布

- 公共仓库：`https://github.com/jiangkoumo/agenttape`
- 当前正式版：`v0.4.3`
- 安装源：`codex plugin marketplace add jiangkoumo/agenttape`
- 插件安装：`codex plugin add agenttape@agenttape`
- 公共 CI、GitHub Release、隔离安装和真实 Codex MCP 调用均已通过。

`v0.3.0` 因未将预构建 MCP bundle 纳入 Git 而被 `v0.3.1` 取代。`v0.4.1` 又在 ToolFence 跨项目验证中暴露出离线 CLI 依赖仓库 `node_modules` 的问题，因此 `v0.4.2` 将 MCP、CLI 和 capture verifier 全部作为自包含 bundle 发布。发布 CI 会检查三个 bundle 已被 Git 跟踪且重新构建后无差异。

## 后续方向

1. 先遵循双仓库镜像的 [`AGENTTAPE_TOOLFENCE_ALIGNMENT.md`](./AGENTTAPE_TOOLFENCE_ALIGNMENT.md)，再使用 AgentTape 侧 [`TOOLFENCE_DOGFOODING.md`](./TOOLFENCE_DOGFOODING.md)。五个真实 Codex 场景已经全部通过；复盘加固进一步完成了带 provenance 的合成终止边界、fork 前 replay confidence、递归 regression 隐私最小化，以及 ToolFence 审批/转发审计与 AgentTape 动作归一化。
2. 场景 5 的真实回归为 `tests/agenttape/real-agenttape-list-tapes-malformed-json.tape`：来自场景 4 capture，原运行经 Broker `allow-once` 批准；加固后由官方保存实现重生成成不含原始 tool input/output 的事件骨架，5 条安全断言通过、confidence 为 `0.40 / low`，发布目录级 bundled CLI 为 2/2。fixture 派生回归仍不能代替真实轮次。
3. 只有人工复核、脱敏且 bundled CLI 通过的 `.tape` 才能进入 `tests/agenttape/`；raw capture、audit、Broker 数据和本地 MCP 配置不得提交。
4. 后续只根据新的真实失败扩展结构化 replay 断言，同时保持 tape v1 向后兼容；历史缺失 Hook 的 capture 不做静默改写。
5. Branch Canvas、Sites 和远程 HTTP MCP 仅在有明确需求时继续，不作为本地插件安装依赖。

0.4.1 的实际 Bash 退出 7、脱敏、MCP 分叉保存和离线 CI 证据见 [`V0_4_1_VALIDATION.md`](./V0_4_1_VALIDATION.md)。ToolFence 跨项目使用、安装态 CLI 修复和公开 `v0.4.2` 验证见 [`V0_4_2_VALIDATION.md`](./V0_4_2_VALIDATION.md)。
