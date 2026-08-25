# AgentTape 项目交接

更新时间：2026-08-25
当前阶段：0.4.1 开源 Codex 插件已完成真实项目和 CI 闭环验收

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
- 当前正式版：`v0.4.1`
- 安装源：`codex plugin marketplace add jiangkoumo/agenttape`
- 插件安装：`codex plugin add agenttape@agenttape`
- 公共 CI、GitHub Release、隔离安装和真实 Codex MCP 调用均已通过。

`v0.3.0` 因未将预构建 MCP bundle 纳入 Git 而被 `v0.3.1` 取代。发布 CI 现在会同时检查 bundle 已被 Git 跟踪且重新构建后无差异。

## 后续方向

1. 在 2–3 个真实 Codex 工程中积累经过人工检查的 regression fixture，优先覆盖权限、超时和外部 API 失败。
2. 根据真实 fixture 扩展结构化 replay 断言，同时保持 tape v1 向后兼容。
3. Branch Canvas、Sites 和远程 HTTP MCP 仅在有明确需求时继续，不作为本地插件安装依赖。

0.4.1 的实际 Bash 退出 7、脱敏、MCP 分叉保存和离线 CI 证据见 [`V0_4_1_VALIDATION.md`](./V0_4_1_VALIDATION.md)。
