# 01 — 建立前端测试基建

- **Type**：task
- **Status**：ready-for-agent
- **Blocked by**：无
- **Blocks**：02、04、05、06
- **ADR**：—

## 背景

前端仓库**零测试文件、零测试框架**（`package.json` 的 `scripts` 只有 `dev`/`build`/`start`/`lint`，无 vitest/jest 依赖）。

而本计划要动的是**简历内容本身**——PDF 导出、Markdown 解析、回写幂等。一次解析 Bug 就是用户数据损坏。**在没有测试的情况下改核心链路是盲飞。**

对比：后端已有 63 个 stdlib 测试（覆盖 AI 与配置），基建明显更好。前端需要补上。

## 任务

1. 引入 **vitest**（对 React 19 / ESM / TS 支持最省事），加 `jsdom` 或 `happy-dom` 环境
2. 在 `package.json` 加脚本：`test`、`test:watch`
3. 与现有 eslint 配置并存，不破坏 `npm run build`
4. 写**第一个真实测试**作为脚手架验证——建议直接做工单 02 的 PDF 文字层断言（若 02 尚未开始，则先测一个纯函数如 `parseSections`）
5. 在 `AGENTS.md` 的「构建与验证」章节补充 `npm run test`

## 验收标准

- [ ] `npm run test` 可运行且通过
- [ ] `npm run build` 仍通过（vitest 不污染生产构建）
- [ ] 至少一个**有实际价值**的测试（不是 `expect(true).toBe(true)`）
- [ ] 测试文件命名与位置有约定并记录（建议与被测文件同目录 `*.test.ts`）

## 备注

- **不要**为了"提高覆盖率"写无意义测试。本计划的测试目标是**防回归**，优先覆盖：PDF 文字层、解析/回写幂等、日期与技能分隔符边界、YAML 序列化的特殊字符。
- 前端测试不连后端；后端行为由 Go 侧的测试负责。

## Comments

### 实施结果（已完成）

| 改动 | 文件 |
|---|---|
| vitest 5.0.4 + happy-dom + `@types/node` 升到 `^24` | `package.json` |
| `test` / `test:watch` 脚本 | `package.json` |
| vitest 配置（原生 `@/*` 别名、默认 node 环境） | `vitest.config.mts`（新增） |
| 解析器防回归测试，30 个用例 | `src/lib/resume-parser.test.ts`（新增） |
| 序列化 + 往返幂等测试，9 个用例 | `src/lib/resume-builder.test.ts`（新增） |
| 测试位置/命名/环境/范围约定 + `it.fails` 记录法 | `AGENTS.md`「构建与验证」 |

**依赖决策**：`vitest@5` 的 peer 要求 `@types/node@^22 || >=24`，而项目锁在 `^20`。真实运行时是 **Node v24.13.1**，所以把类型定义升到 `^24` 是修正而非将就——比 `--legacy-peer-deps` 干净。

**没有安装 `vite-tsconfig-paths`**：vite 已原生支持从 tsconfig 解析路径（`resolve.tsconfigPaths`），插件是多余的。首次运行时 vite 自己提示了这一点。

**测试环境选 `node` 而非 `jsdom`**：本计划要保护的是纯函数，DOM 只会拖慢速度。真正需要 DOM 的测试（工单 02 的 PDF 文字层可能需要）在文件首行加 `// @vitest-environment happy-dom` 按需开启。

### 顺带发现的真实缺陷（已用 `it.fails` 固化为证据）

调试「第一个真实测试」时发现并**经实验证实**了一个数据损坏缺陷，不是推测：

`editableToMarkdown` 把 frontmatter 值当裸标量写入，**完全不做 YAML 转义**：

| 用户输入 | 实际结果 |
|---|---|
| `张: 三` | gray-matter **抛异常** `incomplete explicit mapping pair` |
| `&张三` | 解析回 **`null`**（静默丢数据） |
| `[张三]` | 解析回 **`["张三"]`**（类型变了，`.trim()` 会炸） |
| `{张三}` | 解析回 **对象** |
| `*张三` | gray-matter **抛异常** `unidentified alias` |
| `张\n三` | gray-matter **抛异常** `multiline key may not be an implicit key` |

**影响面**：`parseResumeMarkdown` 在 **8 处无保护调用**，其中 `src/app/resume/[slug]/page.tsx:56` 是**公开简历页的服务端渲染**。所以用户把自己的名字改成「张: 三」后能保存成功，然后自己的公开页 500。

**这不是凭空断言**——是用 vitest 探针逐例跑出来的，并在测试里留下了断言。共 9 个 `it.fails` 用例（6 个转义 + 2 个解析器健壮性 + 1 个 CR-only 文件）。

附带确认的另一个事实：gray-matter **无法识别 CR-only 换行的 frontmatter**（报 `engine not registered`），但 CR-only 的**正文**能正常解析（`parseSections` 自己做了归一化）。

**为什么用 `it.fails` 而不是删掉或改宽断言**：套件保持绿色，同时缺陷保留**可复现的证据**。修复后该用例会自动转为失败，提醒把它改回普通 `it`。工单 17 会以设计方式退役这个缺陷（元数据搬进数据库列，frontmatter 降级为交换格式），届时转义的要求被收窄到导出路径。

### 验收

| 验收标准 | 结果 |
|---|---|
| `npm run test` 可运行且通过 | ✅ `2 passed`，`30 passed \| 9 expected fail` |
| `npm run build` 仍通过（vitest 不污染生产构建） | ✅ `Compiled successfully` + `Finished TypeScript` |
| 至少一个**有实际价值**的测试 | ✅ 65 个 `expect()` 断言，**零** `expect(true).toBe(true)` |
| 测试文件命名与位置有约定并记录 | ✅ `AGENTS.md`「测试约定」表格 |

**额外确认**：`npm run lint` 对我的新文件**零告警**（既有 38 个问题全部在别的文件，未受影响）。

### 交接给后续工单

- **工单 02**（`assertPdfText`）现在可以直接 `npm install -D pdfjs-dist` 并写测试。
- **工单 04/05/06**（分页、Markdown 渲染、纯文本导出）测试位置按同目录 `*.test.ts` 约定。
- **工单 17** 需要把上述 9 个 `it.fails` 转成普通 `it`。

### 遗留（不属本工单）

- `npm run lint` 既有 **16 errors + 22 warnings**（如 `AuthContext.tsx` 的 `set-state-in-effect`、多处未使用导入）。`build` 不跑 lint，所以不阻塞，但值得单独清理。

