# CJK 渲染回归测试文档（ADR-0002 工单 00）

这份文档是 [ADR-0002](../../../../docs/adr/0002-cjk-render-spike.md) 预注册的**测试材料**，也是 Spike 之后**常驻的回归用例输入**。

它的存在理由很简单：ADR-0001 的引擎选型悬在一个无法从文档回答的问题上——**中文 PDF 的文字能否被正确提取？** 回答它需要一份满足硬性指标的文档，而不是一个合成小样本。

## 文档指标（实测）

| 指标 | ADR 要求 | 本文件实测 |
|---|---|---|
| 页数 | 3–5 页 | **11 页**（见下方说明） |
| 不同汉字 | ≥ 2,000 | **2,271** |
| 汉字总数 | — | 16,605 |
| 中英混排 | 必须 | `Go、Rust、TypeScript，Python、Java;PostgreSQL，Redis、Kafka；Kubernetes/Docker，React / Vue、Next.js` |
| 全角标点 | `，。、；：（）` 与英文逗号混用 | 全部覆盖，见 `fixture.html` |
| 日期格式 | `2022.03 - 2024.06` | 覆盖，另含 `2019.07 - 2022.02`、`2013.09 - 2017.06`、`2023.01 - 2024.05` |

**页数说明（需留意）**：ADR 的"3–5 页"与"≥2,000 个不同汉字"这两个要求**在中文里互相矛盾**——一份真实的中文简历 3–5 页只有约 500–700 个不同汉字。本文件优先满足**用字多样性**（那是判据 1/6 真正要压的东西），因此篇幅超出 3–5 页。这不是疏忽，而是两个指标无法同时满足时的取舍，已在此显式记录。

## 内容来源（可追溯）

文档分两部分，来源不同，都不含任何真实个人信息：

1. **现代简历正文**（约 8 KB，含姓名"陈嘉禾"等全部为虚构）
   取自公开网页上的中文简历撰写指导与简历模板页面，抓取正文句子并按 `scripts/` 中的过滤规则剔除导航栏、日期列表、推广语等网页外壳。来源页面：
   - [简历中工作经历该怎么写？](https://www.100fenjianli.com/job_message/job_power/14)
   - [软件工程师岗位项目经验范文](https://www.jianliben.com/article/detail/15708)
   - [云计算后端工程师简历模板（猎聘）](https://www.liepin.com/mould/yjshdgcsqoea94j.shtml)
   - [中级后端研发简历模板（猎聘）](https://www.liepin.com/mould/zjhdyf72a0t2h.shtml)

2. **用字覆盖语料**（`src/classic-corpus.txt`，约 50 KB）
   公共领域古籍原文，取自维基文库（中文）。它们提供现代简历**不可能**提供的用字多样性：

   | 来源 | 汉字数 | 不同汉字 |
   |---|---|---|
   | 千字文 | 1,817 | 1,226 |
   | 增廣賢文 | 9,229 | 1,512 |
   | 道德經 | 1,021 | 403 |
   | 論語 | 908 | 386 |
   | 三字經 | 859 | 371 |
   | 幼學瓊林 | 672 | 341 |
   | **合计** | **14,506** | **2,089** |

   合并现代正文后达到 2,271 个不同汉字。

## 复现

```bash
# 由已提交的 fixture 重新生成 fixture.html（确定性，无网络、无时间戳）
node scripts/build-cjk-fixture.mjs

# 只看 HTML，不写文件
node scripts/build-cjk-fixture.mjs --stdout
```

`cjk-test-document.md` 与 `src/classic-corpus.txt` 是**唯一事实来源**；`fixture.html` 是生成物。重新生成必须是逐字节相同的——若不同，说明构建脚本变了，而不是渲染器变了。

## 怎么用它做回归

```bash
# 需要 @formepdf/{core,html,next}@0.28.0 与一份中文 TTF。
# 关键：font-family 必须声明在 body 上，不能声明在 html 上（见下）。
node scripts/build-cjk-fixture.mjs
node <渲染脚本>   # 读 fixture.html，注册字体，产出 PDF
```

回归必须断言的性质（这是本 fixture 的用途，不只是"能跑"）：

1. **判据 1**：抽出的文本**逐字正确**——不得出现 `�`、不得有无源 `?`、不得缺字。用 `pdfjs-dist` 的 `getTextContent()` 或 `pdftotext`。
2. **判据 6**：输出 < 1.5 MB（验证字体子集化真的生效——未子集化时嵌入 9 MB 字体必然超标）。
3. **判据 7**：`warnings[]` 中不得出现"文字被丢弃"类告警。

## ⚠️ 使用本 fixture 时必须知道的坑（Spike 实测）

### 1. `font-family` 声明在 `<html>` 上会被静默忽略

引擎把 `<body>` 当作**独立的布局根**，因此任何声明在 `<html>` 上的可继承属性都不会进入 `<body>`：

```
html{font-family:"X"}          → 忽略，全部汉字渲染成 "?"
html > body{font-family:"X"}   → 忽略（同上）
body{font-family:"X"}          → 正确
div{font-family:"X"}           → 正确（body 之下的继承正常）
*{font-family:"X"}             → 正确
```

**更糟的是它不告警**：`html` 上的声明被丢弃不会进入 `warnings[]`，只会让文本变成 `?` 并触发大量 "render defect" 告警。真实模板常把 `font-family` 放在 `html` 或 `:root`（本仓库的 `globals.css` 就是按 `html`/`body` 分层的），这类模板会**静默产出不可读的 PDF**。

本 fixture 的 `fixture.html` 因此把 `font-family` 声明在 `body` 上。

### 2. HTML 路径与 React 路径的字体形状不同

| 路径 | 字体形状 |
|---|---|
| `@formepdf/html` `renderHtml(html, { fonts })` | `{ family, data: Uint8Array\|string, weight?, italic? }` |
| `@formepdf/next` / `@formepdf/react`（`<Document fonts>`、`Font.register`） | `{ family, src: string\|Uint8Array, fontWeight?, fontStyle? }` |

形状传错时 **`data` 会被静默丢弃**，引擎随后报 `missing field 'src'`——错误信息不指向出错的属性名。

### 3. 未注册字体时没有内建 CJK 回退

不注册字体时引擎只用内建 `Helvetica`/`Helvetica-Bold`（`/Subtype /Type1`），每个汉字都渲染成 `?`，输出里**没有 `/ToUnicode`**。必须显式注册含目标字形的 TTF。

## 判据结果

Spike 的完整结果见 [ADR-0002](../../../../docs/adr/0002-cjk-render-spike.md) 末尾的「Spike 结果」一节与工单 00 的 Comments。摘要：判据 1、4、6、7、8 通过；**判据 5（峰值内存 < 512 MB）失败**，实测峰值 1,522 MB，且进程 RSS 在连续渲染中持续攀升不回落。
