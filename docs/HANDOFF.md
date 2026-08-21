# AgentTape 项目交接

更新时间：2026-08-21
当前阶段：0.3.0 开源 Codex 插件发布候选

## 正式产品

- Codex 插件：`plugins/agenttape/`。
- Git marketplace：`.agents/plugins/marketplace.json`，公开名称为 `agenttape`。
- Hooks recorder、redaction、tape v1 schema、validator 和合成 fixtures。
- Bundled stdio MCP：`list_tapes`、`inspect_tape`、`fork_run`、`save_regression`。
- Structural replay、4 种 injection、assertion runner 和 CLI exit semantics。
- MIT License、开源贡献规范、安全政策和 GitHub Actions。

Branch Canvas、Sites 构建适配和远程 HTTP MCP 是可选开发组件。它们不得被描述成安装本地 Codex 插件的依赖。

## 验证命令

```bash
npm ci
npm run test:plugin-release
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

## 发布接力

1. 恢复 GitHub CLI 的 `jiangkoumo` 账户认证。
2. 创建公开仓库 `jiangkoumo/agenttape` 并推送 `main`。
3. 等待 GitHub Actions 通过。
4. 创建 `v0.3.0` 标签和 GitHub Release。
5. 从 `jiangkoumo/agenttape` 添加 marketplace，安装 `agenttape@agenttape`，在新 Codex 任务中调用工具。
