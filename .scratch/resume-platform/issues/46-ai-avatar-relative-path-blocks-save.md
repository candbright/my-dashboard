# 46 — AI 解析出的相对路径头像链接会让整份简历存不进平台

- **Type**：defect
- **Status**：ready-for-agent
- **Blocked by**：—
- **Blocks**：—
- **ADR**：ADR-0003（元数据在列上，frontmatter 只是交换格式）

## 背景

现象：**AI 智能解析**出来的简历，编辑区「基本信息」的**头像链接**里是 `images/X13.png`，并提示「链接格式不正确，请以 http:// 或 https:// 开头」，**整份简历无法保存**。用户的绕行办法是手动把这个链接删掉。

根因不在校验，而在**解析结果的落地**：

1. AI 拿到的是一份真简历的文本，模型会把源文档**自己媒体目录里的相对路径**（`images/X13.png`）当成头像链接回吐出来。它不是网址——相对的是一个本产品从未见过的文件，浏览器永远解析不了。
2. `ResumeBuilderPage.openEditor` 把 frontmatter 里的值**原样**灌进表单；
3. `handleSaveToServer` 在保存前跑 `collectMetadataErrors(metadataValues)`，**任一字段不合法就整份拒存**（这是对的：保存前必须拦下非法值），于是一个**用户从未填写过**的字段挡住了「保存到平台」；
4. 假如存进去了，这个值会写进 `avatar` 列并在在线简历上渲染成一张坏图——`draftDocument()` 会把表单元数据写回 frontmatter，创建接口按 ADR-0003 解析进列。

三件事叠在一起，用户看到的是「保存按钮因为我没填过的字段而失灵」。

## 已修复

在**机器输出变成表单值的那一个边界**丢掉不合法的链接，并把丢掉的东西说出来：

- `src/lib/resume-metadata.ts`
  - 新增 `METADATA_URL_KEYS`：从字段规格里 `type === 'url'` 派生，链接字段只有这一处清单，校验和清理不会各自漂移；
  - 新增 `metadataValuesWithoutInvalidUrls(values)`：对链接字段跑**同一个** `validateMetadataField`，不通过的清空并记在 `dropped` 里返回；
  - 新增 `invalidMetadataUrlNotice(dropped)`：生成「解析出的头像链接不是有效网址，已忽略：images/X13.png。可在「基本信息」中改为 http:// 或 https:// 开头的地址。」，没有内容要报告时返回 `null`。
- `src/components/ResumeBuilderPage.tsx`：`openEditor` 先清理再 `setMetadataValues`，并用既有 `notice` 横幅（`role="status"`）告知被忽略的字段与值。

**只作用于解析/导入的 frontmatter，不动用户自己输入的值**——人填的值仍然展示、仍然报错、仍然由人来改。`example.com` 这类无协议但带点的写法依旧接受（`isAcceptableMetadataUrl` 的本意），只有真正无法使用的值才会被丢掉。

## 证据

- `src/lib/resume-metadata.test.ts`：相对路径被丢掉、干净解析一个不动、只碰链接字段（`summary` 超长与 `name` 的空格都保持原样）、丢掉之后 `collectMetadataErrors` 为空、`javascript:`/`data:` 同样被拒、纯空白视为无值。
- `src/components/ResumeBuilderPage.test.tsx`：「ignores the relative avatar path an AI parse supplies, and still lets the resume be saved」——SSE 喂入带 `avatar: images/X13.png` 的 frontmatter，断言头像输入框为空、界面不出现「链接格式不正确」、被忽略的值有提示，并且**「保存到平台」真的发出 `POST /api/resumes`**。反向验证过：把清理改回原样，该用例在 `expect(avatar.value).toBe('')` 处失败。
