# 00 — Spike：CJK 渲染可提取性验证

- **Type**：research
- **Status**：ready-for-agent
- **Blocked by**：无
- **Blocks**：23（渲染服务实现）、一切渲染相关工作的引擎选择
- **ADR**：[ADR-0002](../../../docs/adr/0002-cjk-render-spike.md)

## 问题

[ADR-0001](../../../docs/adr/0001-render-engine-selection.md) 的引擎选择悬在一个**无法从文档回答**的问题上：**Forme 产出的中文 PDF，文字能否被正确提取？**

已核实：Forme 的输出确实有文字层（redaction 移除的是内容流 `Tj`/`TJ`；PDF/UA-1 经 veraPDF 验证；`pdfjs-dist` 是其测试依赖）。

**但**其 redaction 文档明确声明 *"CJK… cannot be found by text search"*——说明它用 CID/Identity-H 写中文，而**是否输出正确的 `/ToUnicode` CMap 完全无文档**。

若中文提取不出来，Forme 对本项目的核心目标**价值为零**。

## 判据（先定后跑，不可事后调整）

环境：`@formepdf/{core,next,html}@0.28.0`，**精确锁版本**。

测试材料：**真实中文简历**（非合成），3–5 页、≥2,000 不同汉字、含中英混排、含 `，。、；：（）` 与英文标点混用、含 `2022.03 - 2024.06` 格式日期。

| # | 判据 | 方法 | 通过标准 |
|---|---|---|---|
| 1 | 中文可提取 | `pdftotext` 或 `pdfjs-dist` `getTextContent()` | 中文**逐字正确**，无 `�` / `?` / 缺字 |
| 2 | `/ToUnicode` 有效 | Chrome 与 Acrobat 各搜索一个中文词 | 能搜到并高亮 |
| 3 | 复制粘贴正确 | Chrome 全选复制 → 粘进编辑器 | 无乱码，段落顺序正确 |
| 4 | 渲染耗时 | 计时完整渲染 | **P95 < 1,500 ms** |
| 5 | 峰值内存 | Node 进程 RSS 峰值 | **< 512 MB** |
| 6 | 输出体积 | PDF 字节数 | **< 1.5 MB**（验证子集化生效） |
| 7 | warnings 可接受 | 收集 `renderHtml()` 的 `warnings[]` | 逐条读懂并判定可接受；出现"文字被丢弃"类告警即 FAIL |
| 8 | 构建通过 | Next 16.2.6 + Turbopack 编译 WASM import | 无需额外 webpack 配置 |

**补充（信息性，非判据）**：断点是否与 Chrome 打印一致、`break-inside: avoid` 是否生效、页眉重复与 `counter(page)` 是否工作、CJK 序列化实测耗时（对照 issue #182 声称的 85 ms）。

## 任务

1. 在独立分支/临时目录搭建最小 Node 脚本（**不要污染主仓库依赖**，或用 `--no-save`）
2. 准备真实中文简历测试文档，落盘到 `.scratch/resume-platform/fixtures/`
3. 逐项执行 8 条判据，**保留原始输出**（抽取文本、耗时、内存、体积、warnings 全文）
4. 按判定规则给出结论

## 判定规则

```
全部通过  → Forme 为终态引擎（ADR-0001 分支一）
任一 FAIL → headless Chromium 为终态引擎（ADR-0001 分支二）
结果暧昧  → Chromium（如"中文可提取但偶发缺字"）
```

> **若结果暧昧不清，选 Chromium。** 一个中文简历产品不能把正确性建立在"大多数情况下可以"之上。

## 验收标准

- [x] 8 条判据逐项有**可复现的命令与原始输出**
- [x] 测试文档落盘，成为**常驻回归用例**的输入（不只是本次一次性使用）
- [x] 在 `spec.md` 与 ADR-0002 末尾记录结论
- [ ] 若选 Forme：记录精确版本号，并在 ADR-0001 中标注"依赖 pre-1.0 单维护者项目"的风险接受
- [x] 若选 Chromium：记录中文字体方案（自带字体路径 + 显式注册方式）

> 第 4 条**不适用**：Spike 未选 Forme，故无需接受该风险；ADR-0001 中该风险条目已改为"该依赖未被引入"。此处保留 `[ ]` 以示它未被勾选，而非被遗漏。

## 备注

- npm 元数据里的 `formepdf/forme` 是**过期链接**，真实仓库是 [danmolitor/forme](https://github.com/danmolitor/forme)。
- 沙箱可能拦截 npm 缓存（`EPERM` on `%LOCALAPPDATA%\npm-cache`）；可用 `--cache $env:TEMP\npmcache-forme` 绕过。
- 无需为 Spike 写生产代码——**产出是知识，不是功能**。

## Comments

### 结论：判据 5 失败 → 终态引擎为 headless Chromium（2026-10-13）

产出物全部落在 `.scratch/resume-platform/fixtures/`：`README.md`（材料与坑）、`RESULTS.md`（逐条判据与原始数据）、`cjk-test-document.md` + `src/classic-corpus.txt`（测试文档，唯一事实来源）、`fixture.html`（生成物）、`scripts/`（生成脚本 + 全部测量脚本）、`evidence/`（原始 JSON 报告）。

#### 逐条判据

| # | 判据 | 通过标准 | 实测 | 判定 |
|---|---|---|---|---|
| 1 | 中文可提取 | 逐字正确，无 `�`/`?`/缺字 | 11 页全部还原，`�` 0 处，`CJK_MISSING=[]` | **PASS** |
| 2 | `/ToUnicode` 有效 | Chrome/Acrobat 搜索一个中文词 | 结构性证据齐备（`/ToUnicode` + `/Identity-H` + `/CIDFontType2` + `/FontFile2`）；**交互搜索未做** | 未验证 |
| 3 | 复制粘贴正确 | Chrome 全选复制无乱码 | **未做**（交互） | 未验证 |
| 4 | 渲染耗时 | P95 < 1,500 ms | P95 **860 ms** | **PASS** |
| 5 | 峰值内存 | RSS < 512 MB | 峰值 **1,521.8 MB**；首次渲染即 610.9 MB | **FAIL** |
| 6 | 输出体积 | < 1.5 MB | **0.468 MB** | **PASS** |
| 7 | warnings 可接受 | 无"文字被丢弃"类告警 | **0 条** | **PASS** |
| 8 | 构建通过 | Next 16.2.6 + Turbopack，零额外 webpack 配置 | `next build` 成功，`ƒ /api/pdf` 产出 | **PASS** |

判据 2、3 需真人操作浏览器与 Acrobat，**本轮未做，如实标为未验证而非通过**。它们不影响结论：判据 5 已单独构成 FAIL，按 ADR-0002 预注册规则"任一 FAIL → Chromium"。

#### 判据 5 为何是决定性的

关键不在"1,521 MB 很大"，而在**开销与文档规模、用字数量都无关**：

| 文档 | HTML 大小 | 不同汉字 | 首次渲染 RSS | 峰值 RSS |
|---|---|---|---|---|
| 极小 | 342 B | 17 | 578.9 MB | 867.1 MB |
| 真实中文简历 | 8.9 KB | 494 | 643.3 MB | 1,260.4 MB |
| 完整 fixture | 53 KB | 2,271 | 647.6 MB | 1,267.8 MB |

一份 **342 字节、17 个不同汉字**的文档首次渲染就占 578.9 MB ⇒ 这不是"2,000 字用字的极端情况"，而是**注册字体后每次渲染的固定代价**。

对照实验定位来源是"注册了字体"而非"中文"：

| 注册的字体 | 文件 | 首次渲染 heap | 第 3 次 heap | 第 3 次 RSS |
|---|---|---|---|---|
| 无 | — | 5.2 MB | 5.2 MB | 84.6 MB |
| `arial.ttf`（拉丁） | 1.0 MB | 39.8 MB | 105.7 MB | 267.0 MB |
| `simhei.ttf`（中日韩） | 9.3 MB | 327.1 MB | 327.1 MB | 851.3 MB |

不注册字体时开销**完全平坦**；注册后 heap 随**每次渲染**累积。`auditContent`/`lang` 等选项不影响（三种配置结果逐次一致），故不是测量方式造成。

RSS **从不回落到基线**：12 次渲染中第 2 次之后最低 RSS = 849.1 MB，峰值随渲染次数单调上升。对 ADR-0007 描述的常驻渲染单元，内存不收敛比"单次偏重"严重得多。

#### 附带发现（不改变判定，但必须记录）

**A. `font-family` 声明在 `<html>` 上被静默忽略。** 引擎把 `<body>` 当作独立布局根：`html{}`、`:root{}`、`html > body{}` 全部无效且**不告警**；`body{}`、`div{}`、`p{}`、`*{}` 正常。用 `html{已注册字体}` + `body{未注册字体}` 对照确认：body 上的值干净作用于全部后代 ⇒ html 上的值根本没参与继承。真实模板常把 `font-family` 放在 `html`/`:root`，这类模板会**静默产出整篇 `?` 的 PDF**——与引擎自称"never silent"的设计承诺矛盾。

**B. HTML 路径与 React 路径字体参数形状不同。** `@formepdf/html` 用 `{family, data, weight?, italic?}`；`@formepdf/next`/`@formepdf/react` 用 `{family, src, fontWeight?, fontStyle?}`。传错时序列化器**静默丢弃字体**，随后由 Rust 侧报 `missing field 'src'`，错误信息不指向真正传错的属性。

**C. 无内建 CJK 回退。** 不注册字体时只用内建 Helvetica，汉字全渲染成 `?`，输出无 `/ToUnicode`，并逐字产生 "render defect" 告警。

顺带：`@formepdf/html` 与 `@formepdf/next` **两条路径的中文提取都合格**，且 `simhei.ttf` 覆盖 fixture 全部 2,271 个不同汉字（0 条缺字）。

#### 测试材料

`fixture.html` 由已提交的 `cjk-test-document.md` + `src/classic-corpus.txt` **确定性生成**（无网络、无时间戳、无随机）：

- 16,605 汉字 / **2,271 个不同汉字** / 11 页 / 52,674 字节
- 中英混排：`Go、Rust、TypeScript，Python、Java;PostgreSQL，Redis、Kafka；Kubernetes/Docker，React / Vue、Next.js`
- 全角标点 `，。、；：（）` 与英文逗号混用；日期含 `2022.03 - 2024.06` 等 4 组

**用字来源**：现代简历正文取自公开的中文简历指导/模板页面（已滤除导航与推广语，人名等全部虚构）；多样性来自公共领域古籍（千字文 1,226 + 增廣賢文 1,512 + 道德經 403 + 論語 386 + 三字經 371 + 幼學瓊林 341 个不同汉字，维基文库）。

**一个必须记录的矛盾**：ADR 同时要求"3–5 页"与"≥2,000 个不同汉字"，这在中文里**互相矛盾**——真实中文简历 3–5 页只有约 500–700 个不同汉字。本 fixture 优先满足用字多样性（那才是判据 1/6 真正压的东西），因此是 11 页。已在 `fixtures/README.md` 显式说明，而非悄悄放宽。

#### 复现

见 `fixtures/RESULTS.md` 的「复现命令」一节：隔离安装（`--cache $env:TEMP\npmcache-forme`，不污染主仓库依赖）→ 生成 fixture → `spike-criterion5.cjs` 测时间/内存/体积/告警 → `spike-extract.cjs` 抽取比对 → 独立 Next 工程 `npm run build` 验判据 8。

#### 对后续工单的影响

- **工单 03（浏览器打印导出）不受影响**，它走的是阶段一的浏览器原生打印，已实施通过。
- **工单 23（渲染服务）** 的实现目标由"Chromium/Forme 二选一"确定为 **Chromium**；ADR-0007 的接口形态不变。
- **Chromium 中文字体方案**：Spike 实测 Windows 自带 `simhei.ttf` 覆盖全部字集（0 缺字），可作为自带字体候选；容器（`debian:bookworm-slim`）需自带并**显式注册**，不能依赖 Fontconfig 匹配。
- 判据 5 的失败**不等于**"Forme 不可用"：若其将来修复内存行为，本 fixture 与测量脚本可直接复用重新裁定，届时再决定是否重开 ADR-0001。

