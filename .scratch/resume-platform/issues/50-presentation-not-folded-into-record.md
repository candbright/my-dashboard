# 50 — 保存的模板到不了详情页：回复里的 `presentation` 没有人折叠进记录

- **Type**：defect
- **Status**：done（2026-10-15）
- **Blocked by**：—
- **Blocks**：—
- **ADR**：0004（展示态随读一起回来）、0008（模板决定 UI 风格）
- **证据日期**：2026-10-15（真实 Chromium + 真实前后端，无 API mock）

## 背景

现象：**在向导里选了「绿野通栏」保存后，打开这份简历仍然是默认模板**（ATS 安全单栏）——重新打开也一样，而且**没有任何报错**。

样式并没有丢在后端：数据库 `resumes.presentation` 里存得好好的（`template`、`accentColor`、`sectionOrder`、`pageMargin` 全在）。丢在**前端边界上**：

- ADR-0004 把展示态放在**记录旁边**，不是记录里面。`api/resumevault/v1/resume.proto` 的 `ResumeInfo` 只有 1–23 号字段，**没有**展示态字段；读回复（`GetResumeReply.presentation = 5`）与 `PATCH /presentation` 回复把它作为**兄弟字段**返回。
- 而组件读的是 `resume.presentation`：`ResumeDisplay.tsx`、`ResumePrintView.tsx` 都是。全仓**没有任何生产代码调用 `presentationFromApi`**（唯一知道读回复拼写、同时认 snake_case 与 camelCase 的函数只在测试里出现）。于是兄弟字段在边界上被丢掉，`presentationFromRecord(undefined)` 解析成**产品默认**。
- 这个失败**不可能报错**：缺展示态是文档化的默认值，看上去与「这份简历从来没选过样式」一模一样。

`PUT /api/resumes/{id}` 把同一个洞挖深一层：它的回复是 `{resume, markdown, content}`，**没有** `presentation`，而 `ResumePageClient.applyServerRecord` 原本是 `setResume(data.resume)` **整体替换**——所以每次保存正文都会把屏幕上已解析好的样式清成默认（库里仍在，刷新才回来），即使用户选的是默认模板也一样会经历一次「闪回」。

## 修复

1. `src/lib/resume-presentation.ts` 新增 `resumeWithPresentation(record, replyPresentation)`：把回复的展示态折叠进记录，值交给 `presentationFromApi` 读（它认两种拼写）；回复没有时回落到记录自己已有的那份。
2. `src/app/resume/[slug]/page.tsx`：`ResumeDetail` 增加 `presentation?: unknown`，渲染时 `resume={resumeWithPresentation(resume, presentation)}`。
3. `src/components/ResumePageClient.tsx`：`applyServerRecord` 改为
   `setResume((current) => resumeWithPresentation(data.resume, data.presentation ?? current.presentation))`
   ——回复带展示态（`PATCH /presentation`、历史恢复、重新读）时以它为准；回复不带（`PUT`）时保留屏幕上那一份。

## 证据

- `src/lib/resume-presentation.test.ts`（新增，7 例）：按**真实线格式**（`protojson` 的 snake_case）折叠出 `verdant-banner` / `#8b9d77` / `['关于我','工作经历']`；camelCase 也认；回复没有时保留记录自己的；两边都有时回复优先；两边都没有 → 默认；畸形回复（字符串、数字）不抛。
- `src/app/resume/[slug]/page.test.tsx`（+2 例）：回复里的兄弟 `presentation` 被折叠进 `resume.presentation`；没有样式的简历仍是默认模板（**唯一**允许回落的一种情况，所以与折叠断言写在一起）。
- `src/components/ResumePageClient.record-writes.test.ts`：棘轮改为钉住「折叠赋值」恰好一处，并新增一条**禁止** `setResume(data.resume)` 的规则——那正是丢样式的形状（这条规则在修复前是失败的）。
- **真实运行（重启后的前后端 + 真实 Chromium，真实登录，未安装任何 `/api/**` mock）**：自建一份 `verdant-banner` / `#8b9d77` 的简历，带所有者 cookie 打开 `/resume/verdant-live`，点「切换到模板视图」后读 DOM 内联样式（横幅块就是 `background: <accent>`，见 `resume-render/verdant.tsx`）：

  | 页面 | 鼠尾草横幅块 | 鼠尾草内联样式 |
  |---|---|---|
  | 折叠前（临时把页面改回 `resume={resume}`） | **0** | 0 |
  | 折叠后 | **1** | 5 |

  两种情况下「解析视图」都是 0：它是**独立**的解析渲染（工单 48 第 4 条的要求），本来就不该画模板。同一个 `#8b9d77` 在修复前**整个页面一次都不出现**——这就是「选了模板却看到默认模板」的字面证据。探针简历已删除。
- 诚实边界：验证用的是自建游客简历；用户自己那份（`王昱皓`）的 `presentation` 列没有存下模板（在旧后端上创建的），所以这次修复**不会**改变它现在的样子——它本来就该是默认模板。

## 备注：为什么不给 `ResumeInfo` 加字段

那样能让每条回复自洽，但代价是动 proto 与生成代码，而且嵌套进记录后会落进 `presentationFromRecord`（它只认 camelCase 对象或字符串列）。服务端有两种编码器在跑（`ctx.Result` 的 protojson 是 camelCase，`writeJSON` 的 `encoding/json` 是 snake_case），嵌套字段在其中一种下会**静默**解析成默认——正是本工单要消灭的那种失败。ADR-0004 的设计本来就是「展示态随读一起回来」，缺的是前端按它读。

## 相关

- 工单 48（模板优先的创建流程）：向导第 3 步的预览传的是**未保存**的展示态，所以它一直是对的；坏的只有保存之后、从记录读回来的那一路。
- 工单 47：同为「读回来的东西在边界上被丢掉」，只是那次丢的是**失败原因**。
