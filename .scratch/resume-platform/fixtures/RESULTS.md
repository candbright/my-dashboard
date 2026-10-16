# Spike 结果：CJK 渲染可提取性（工单 00 / ADR-0002）

**日期**：2026-10-13
**环境**：Windows，Node v24.13.1，npm 11.8.0
**版本**：`@formepdf/core@0.28.0`、`@formepdf/next@0.28.0`、`@formepdf/html@0.28.0`（精确锁版本）
**字体**：`C:\Windows\Fonts\simhei.ttf`（9.3 MB，28,562 字形）
**测试材料**：[`fixture.html`](./fixture.html)（由 [`cjk-test-document.md`](./cjk-test-document.md) + [`src/classic-corpus.txt`](./src/classic-corpus.txt) 生成，16,605 汉字 / **2,271 个不同汉字**，11 页）

## 判定：**FAIL → 终态引擎为 headless Chromium（ADR-0001 分支二）**

判据 5 未通过，差距 **3.0 倍**，且为**单条判据的硬失败**。按 ADR-0002 的判定规则「任一 FAIL → Chromium」，结论是 Chromium。

## 逐条判据

| # | 判据 | 通过标准 | 实测 | 判定 |
|---|---|---|---|---|
| 1 | 中文可提取 | 逐字正确，无 `�`/`?`/缺字 | 11 页全部还原；`�` 0 处；`CJK_MISSING=[]`；`MISSING_CHARS=[]` | **PASS** |
| 2 | `/ToUnicode` 有效 | Chrome 与 Acrobat 各搜一个中文词能搜到并高亮 | 结构性证据：输出含 `/ToUnicode` + `/Identity-H` + `/CIDFontType2` + `/FontFile2`。**交互搜索未做**（需真人操作 Chrome 与 Acrobat） | **未验证** |
| 3 | 复制粘贴正确 | Chrome 全选复制无乱码，段落顺序正确 | **未做**（交互） | **未验证** |
| 4 | 渲染耗时 | P95 < 1,500 ms | min 481 / median 615 / **P95 860** / max 860 ms | **PASS** |
| 5 | 峰值内存 | Node RSS 峰值 < 512 MB | **峰值 1,521.8 MB**；第 1 次渲染即 610.9 MB；12 次连续渲染后 RSS 只升不降 | **FAIL** |
| 6 | 输出体积 | < 1.5 MB | 490,326 B = **0.468 MB** | **PASS** |
| 7 | warnings 可接受 | 逐条读懂；出现"文字被丢弃"类告警即 FAIL | **0 条告警** | **PASS** |
| 8 | 构建通过 | Next 16.2.6 + Turbopack 编译 WASM import，无需额外 webpack 配置 | `next build` 成功，`ƒ /api/pdf` 路由产出，**零 webpack 配置** | **PASS** |

判据 2、3 是交互式的，本轮**未做**，如实标注为未验证而非通过。它们不影响结论：判据 5 已单独构成 FAIL。

## 判据 5 的实测明细

`simhei.ttf`，同一进程连续渲染 12 次 [`fixture.html`](./fixture.html)：

| run | ms | RSS (MB) | heap (MB) | warns |
|---|---|---|---|---|
| 1 | 860 | 610.9 | 326.8 | 0 |
| 2 | 615 | 849.1 | 595.6 | 0 |
| 3 | 781 | 1097.1 | 326.8 | 0 |
| 4 | 481 | 1111.1 | 618.0 | 0 |
| 5 | 543 | 1129.6 | 867.8 | 0 |
| 6 | 645 | 1404.4 | 1136.1 | 0 |
| 7 | 704 | 1493.0 | 326.8 | 0 |
| 8 | 525 | 1506.3 | 617.8 | 0 |
| 9 | 698 | 1493.6 | 326.8 | 0 |
| 10 | 525 | 1507.7 | 599.1 | 0 |
| 11 | 528 | **1521.8** | 867.4 | 0 |
| 12 | 585 | 1493.5 | 326.8 | 0 |

第 1 次渲染后的 RSS = 610.9 MB，**已经超过 512 MB 上限**；第 2 次之后的最低 RSS = 849.1 MB。RSS **从未回落到基线**。

峰值随渲染次数单调上升，这一点本身就是结论（`evidence/criteria-report.json` 是 7 次渲染的运行，峰值 1,103 MB；上表是 12 次渲染的运行，峰值 1,521.8 MB）。也就是说在长驻服务里，**内存不会稳定在某个值**，而是随服务处理过的请求数持续增长——6 次渲染后已到 1,404 MB。

**峰值的绝对值随机器负载浮动**：同一命令在同一台机器上重复运行，12 次渲染的峰值在 **1,290–1,522 MB** 之间波动（另一次运行实测 1,289.6 MB）。波动不改变判定——**每次运行都远超 512 MB 上限 2.5 倍以上，且首渲染就已超标**。引用具体数字时应连同"存在 ±15% 浮动"一起说，不要把它当成一个精确常数。

### 内存开销与文档规模无关

这是本结果最关键的一点：**开销不随文档大小或用字数量增长**。

| 变体 | HTML | 汉字总数 | 不同汉字 | 首次渲染 RSS | 峰值 RSS |
|---|---|---|---|---|---|
| 极小文档 | 342 B | 18 | 17 | 578.9 MB | 867.1 MB |
| 真实简历（去掉古籍附录） | 8.9 KB | 1,936 | 494 | 643.3 MB | 1,260.4 MB |
| 完整 fixture | 53 KB | 16,605 | 2,271 | 647.6 MB | 1,267.8 MB |

一份 **342 字节**、只有 **17 个不同汉字**的文档，首次渲染就吃掉 578.9 MB。所以这不是"2,000 字用字的极端情况"，而是**注册一个中日韩字体后每次渲染的固定代价**。

### 内存开销来自「注册了字体」，不是来自中文

同一份极小文档（含中文），只改注册的字体：

| 字体 | 文件大小 | 首次渲染 heap | 第 3 次渲染 heap | 第 3 次渲染 RSS |
|---|---|---|---|---|
| 不注册字体 | — | 5.2 MB | 5.2 MB | 84.6 MB |
| `arial.ttf`（纯拉丁） | 1.0 MB | 39.8 MB | 105.7 MB | 267.0 MB |
| `simhei.ttf` | 9.3 MB | 327.1 MB | 327.1 MB | 851.3 MB |

不注册字体时开销**完全平坦**（85 MB，不增长）。注册任何字体后，heap 随**每次渲染**累积。中日韩字体把单次代价从约 35 MB 抬到约 320 MB。

`auditContent`、`lang`、`pdfSize` 等选项均**不**影响该行为（三者结果逐次一致），因此不是本 Spike 的测量方式造成的。

## 复现命令

`scripts/` 下的测量脚本住在**仓库内**，而 `@formepdf` 装在仓库**外**（主仓库不得引入该依赖）。因此用 `SPIKE_ENGINE_DIR` 指向隔离安装的 `node_modules`。

```bash
# 1. 隔离安装（不污染主仓库依赖）；--cache 绕过可能被沙箱拦截的 npm 缓存
SPIKE="$TEMP/forme-spike"
npm install --prefix "$SPIKE" --cache "$TEMP/npmcache-forme" \
  @formepdf/core@0.28.0 @formepdf/html@0.28.0 @formepdf/next@0.28.0 pdfjs-dist@4.10.38

# 2. 由已提交的 fixture 生成 HTML（确定性，无网络/时间戳）
node .scratch/resume-platform/fixtures/scripts/build-cjk-fixture.mjs

# 3. 环境变量
export SPIKE_ENGINE_DIR="$SPIKE/node_modules"
export SPIKE_CJK_FONT="$WINDIR/Fonts/simhei.ttf"     # 任选一份覆盖字集的中文 TTF

FIX=.scratch/resume-platform/fixtures/scripts

# 4. 判据 4/5/6/7：耗时、峰值内存、输出体积、warnings
node "$FIX/spike-criterion5.mjs"     # 12 次渲染，逐次 RSS/heap
node "$FIX/spike-criteria.mjs"       # 判据报告 → fixtures/evidence/criteria-report.json

# 5. 判据 1：抽取比对（对上一次生成的 PDF）
node "$FIX/spike-extract.mjs" .scratch/resume-platform/fixtures/evidence/out-document.pdf \
  陈嘉禾 '高级后端工程师 / 平台架构' '2022.03 - 2024.06' 'Go、Rust、TypeScript'

# 6. 附带发现 A/B 的对照实验
node "$FIX/spike-root-boundary.mjs"  # 哪些选择器能让 font-family 生效
node "$FIX/spike-mechanism.mjs"      # 确认是"<body> 不继承 <html>"
node "$FIX/spike-font-cost.mjs"      # 无字体 / 拉丁字体 / 中日韩字体 的开销对照
node "$FIX/spike-baseline.mjs"       # 极小 / 真实简历 / 完整 fixture 三档对照

# 7. 判据 8：独立 Next 工程构建（零 webpack 配置）
NEXT="$TEMP/forme-next-spike"
npm install --prefix "$NEXT" --cache "$TEMP/npmcache-forme" next@16.2.6 react@19.2.4 react-dom@19.2.4 \
  @formepdf/core@0.28.0 @formepdf/next@0.28.0 @formepdf/html@0.28.0
npm --prefix "$NEXT" run build
```

> 注意 `@formepdf/html` 的入口是 `./index.js`，其余包是 `./dist/index.js`——脚本的 `engineUrl()` 从各包自己的 `package.json` 的 `main` 读取，避免写死布局。

## 原始证据

| 文件 | 内容 |
|---|---|
| [`evidence/criteria-report.json`](./evidence/criteria-report.json) | 7 次渲染的时间/内存/体积/告警 + PDF 结构（`/ToUnicode`、`/Identity-H`、`/FontFile2`） |
| [`evidence/criterion5-report.json`](./evidence/criterion5-report.json) | 判据 5 的逐次 RSS/heap 轨迹 |
| [`evidence/out-document.pdf`](./evidence/out-document.pdf) | 产生的 PDF 本身（490,326 字节） |

## 除判据之外、必须记录的两个缺陷

这两个缺陷**不改变判定**（判据 5 已单独构成 FAIL），但它们是 Spike 的主要附带收获，直接影响将来任何渲染方案：

### 缺陷 A：`font-family` 声明在 `<html>` 上被静默忽略

引擎把 `<body>` 当作独立布局根，因此声明在 `<html>` 上的可继承属性不会进入 `<body>`，且**不产生任何告警**。

| 选择器 | 结果 |
|---|---|
| `html{font-family:"X"}` | 忽略 |
| `:root{font-family:"X"}` | 忽略 |
| `html > body{font-family:"X"}` | 忽略 |
| `body{font-family:"X"}` | 生效 |
| `div{font-family:"X"}` | 生效（body 之下继承正常） |
| `p{font-family:"X"}` | 生效 |
| `*{font-family:"X"}` | 生效 |
| `body class="r"` + `.r{...}` | 生效 |

机制已确认：**不是 `<html>` 被忽略，而是 `<body>` 不继承 `<html>`**。证据：`html{font-family:"ResumeCJK"}` + `body{font-family:"NoSuchFont"}` 的结果是**未注册字体**胜出——即 body 上的值干净地作用于全部后代，html 上的值根本没参与。

后果：真实模板常把 `font-family` 放在 `html`/`:root`，这类模板会**静默产出整篇 `?` 的 PDF**。这与引擎自己"everything outside the documented subset is named — never silent"的设计承诺相矛盾。

### 缺陷 B：HTML 路径与 React 路径的字体形状不同，且传错时静默丢数据

| 路径 | 期望形状 |
|---|---|
| `@formepdf/html` `renderHtml(html, { fonts })` | `{ family, data, weight?, italic? }` |
| `@formepdf/next` / `@formepdf/react`（`<Document fonts>`、`Font.register`） | `{ family, src, fontWeight?, fontStyle? }` |

把 `data` 传给 React 路径时，序列化器**静默丢弃**字体数据，产出的文档随后被 Rust 侧拒绝：`missing field 'src'`——错误信息不指向真正传错的属性。

## 补充测试（信息性，非判据）

- **两个代码路径的中文提取都通过**：`@formepdf/html` 与 `@formepdf/next` 两条路径产出的 PDF 均含 `/ToUnicode` + `/Identity-H` + `/CIDFontType2`，抽取均逐字正确。
- **两处渲染的告警均为 0**：在正确注册字体且字体覆盖全部字形的前提下，`warnings[]` 为空。
- **`simhei.ttf` 覆盖全部 2,271 个不同汉字**：0 条 "not covered by any available font" 告警。Windows 自带的中日韩字体足以覆盖本 fixture。
- **页码/断点/`counter(page)`/页眉重复**：本轮**未测**。

## 未做

- 判据 2、3 的交互式验证（Chrome 搜索、Acrobat 搜索、全选复制粘贴）——需真人操作。
- 断点是否与 Chrome 打印一致、`break-inside: avoid` 在条目级是否生效、页眉重复与 `counter(page)`、issue #182 声称的 CJK 序列化 85 ms 对照。
