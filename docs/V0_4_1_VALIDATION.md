# AgentTape 0.4.1 验收记录

验收日期：2026-08-25

## 目标

本次补丁完成三个可验证目标：覆盖 Codex 当前 11 类 Hook；在真实 Codex 项目中验证失败捕获与脱敏；让保存到 `tests/agenttape/` 的回归文件由本地和 CI 使用同一条命令执行。

## Hook 覆盖

插件现在注册：

- 会话：`SessionStart`、`SessionEnd`
- 提示与压缩：`UserPromptSubmit`、`PreCompact`、`PostCompact`
- 工具与权限：`PreToolUse`、`PostToolUse`、`PermissionRequest`
- 子 Agent：`SubagentStart`、`SubagentStop`
- 回合结束：`Stop`

事件详情统一经过递归脱敏。主 transcript 和子 Agent transcript 的本地路径不写入 tape；只保留是否可用。并发 Hook 写入通过项目内运行时锁串行化，测试覆盖 24 个同时写入者，最终序号连续且无丢失。

## 真实 Codex 项目验证

验证环境：Codex CLI 0.149.0、Node.js 项目、隔离的临时 Git 仓库。

真实任务要求 Codex 执行一个退出码为 7 的 `npm test`。验证中发现，当前 Codex 的 Bash `PostToolUse.tool_response` 只包含输出文本，不包含退出码；AgentTape 因此增加了 transcript 证据回退，只提取匹配 `tool_use_id` 的 `status` 和 `exit_code`，不复制 transcript 内容或路径。

最终捕获结果：

```text
status: failed
events: SessionStart → UserPromptSubmit → PreToolUse → PostToolUse → Stop
failed tool calls: 1
failure: Codex recorded tool exit code 7
redaction marker: present
obvious unredacted secret pattern: false
```

验证命令：

```bash
node plugins/agenttape/scripts/verify-capture.mjs \
  --root <real-project> \
  --must-fail \
  --require-redaction \
  --require-event SessionStart \
  --require-event UserPromptSubmit \
  --require-event PreToolUse \
  --require-event PostToolUse \
  --require-event Stop
```

验证时使用的是专门构造的伪密钥。验证器确认 `.tape` 中存在脱敏标记，并且没有残留常见的未脱敏 API key 或 Bearer token 模式。该检查不能证明任意自由文本中绝对没有敏感信息，公开分享前仍需人工检查。

## 失败到 CI 的闭环

同一个真实捕获依次通过插件自己的 MCP 工具完成：

1. `list_tapes` 找到失败 tape。
2. `inspect_tape` 确认 Bash 退出码 7、覆盖边界和脱敏状态。
3. `fork_run` 在序号 3 后将序号 4 的结果替换为 timeout；证据为 0 次模型调用、0 次真实工具调用。
4. `save_regression` 写入 `tests/agenttape/real-bash-exit-timeout.tape`，包含 4 条断言。
5. 目录级 runner 输出：

```text
PASS tape_regression_60468d473ef9 4/4 assertions
PASS 1/1 regression tapes
```

仓库通过 `npm run test:tapes` 执行相同的目录级命令。新增的 `.tape` 文件不需要再单独修改 CI 配置。

## 边界

- Hosted tools 不在 Codex 本地 Hook 覆盖范围内。
- Transcript 回退只读取当前会话、当前工具调用的状态和退出码，并限制读取文件尾部大小；它不会把 transcript 作为 artifact 保存。
- Structural replay 在注入的工具结果处停止，不生成新的下游模型推理。
- 以上验证证明当前范围内的结构化捕获和回归流程可用，不代表 bit-exact、完整或 hermetic replay。
