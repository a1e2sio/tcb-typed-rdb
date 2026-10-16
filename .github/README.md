# GitHub 配置说明

本目录用于存放 GitHub 仓库级配置。配置文件应保持职责单一，并与根目录 `package.json` 中的脚本保持一致。

## 配置文件职责

| 路径 | 用途 | 当前状态 |
| --- | --- | --- |
| `.github/workflows/*.yml` | 定义 GitHub Actions，例如类型检查、构建和发布流程。 | 尚未添加工作流；新增时应优先调用 `pnpm typecheck` 和 `pnpm build`。 |
| `.github/dependabot.yml` | 配置 Dependabot 检查 npm/pnpm 依赖更新的频率和目录。 | 尚未启用。 |
| `.github/ISSUE_TEMPLATE/` | 提供 Bug、功能请求等 Issue 模板，收集复现步骤、期望行为和环境信息。 | 尚未添加模板。 |
| `.github/PULL_REQUEST_TEMPLATE.md` | 统一 PR 描述，记录变更内容、验证方式和兼容性影响。 | 尚未添加模板。 |
| `.github/CODEOWNERS` | 指定代码审查责任人，帮助 GitHub 自动请求 Review。 | 尚未添加。 |

## 维护约定

- 工作流使用仓库声明的 `pnpm` 版本，并通过锁文件安装依赖。
- TypeScript 变更至少执行 `pnpm typecheck`；发布相关变更还应执行 `pnpm build`。
- 不要在 GitHub 配置文件中提交 CloudBase 环境 ID、访问密钥或其他凭据，应使用 GitHub Actions Secrets 或 Environments。
- 修改配置文件时，在 PR 描述中说明触发条件、权限范围和失败时的处理方式。
