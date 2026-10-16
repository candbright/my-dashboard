# 外部硬约束研究：无障碍法、解析行为、新兴标准、法律与隐私

**对象**：my-dashboard（ResumeVault）— Next.js 16 / React 19 前端，中文+英文，Go/Kratos 后端，自托管。
**目的**：找出**无论竞品做什么都成立**的约束——即做错了会导致「无法挽回的失败」（法律问题、或简历静默地过不了筛选）的东西。
**方法说明**：所有结论尽量取自一手来源（法规原文、标准组织、厂商自己的帮助中心）。每条给出来源链接、可信度、以及**适用性裁定**。凡未能验证的，明写「未能验证」，不猜。

## 关于「未能验证」的两条重要坦白

1. **EUR-Lex 自己生成的 EAA 与 AI Act PDF，正文抽取行为不一致。** Directive (EU) 2019/882 的 PDF（`CELEX:32019L0882`）只抽得出封面、目录和 Annex，**正文（Article 1–35）抽不出文字**；而同站的 AI Act PDF（`CELEX:32024R1689`）正文可以抽取。因此本文中 EAA 的**逐字条文**我多数未能直接从一手 PDF 取得，只能引用 EUR-Lex HTML 版**序言（recital）**原文 + 标注「未能验证」的条目。这不是「法规不存在」，是**我没读到那一页**。
2. **`developers.google.com` 与 `schema.org` 在本环境下 fetch 持续失败**（`TypeError: fetch failed`）。因此 Google Jobs / schema.org 的结论**可信度较低**，我明确标注。

---

## 1. 已有强制力、必须遵守

### 1.1 欧洲无障碍法案（EAA）— Directive (EU) 2019/882：服务类微型企业豁免，是本案的关键闸门

**已核验的一手事实**（EUR-Lex 官方 HTML 正文，序言部分）：

- 指令全称与日期：*Directive (EU) 2019/882 of the European Parliament and of the Council of 17 April 2019 on the accessibility requirements for products and services*，刊登于 Official Journal L 151/70, 7.6.2019。
  - 来源：[Directive (EU) 2019/882, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882) — 一手
- **序言 (70)** 原文（我已读到）：微型企业提供**服务**时，本指令的要求与义务**不应适用**——因为这对它们会是过重负担。这是**服务侧**的豁免（产品侧的豁免在另一条）。
  - 可信度：**已验证**
- **序言 (42)/(43)** 确认 **e-commerce services** 在本指令范围内：该类服务指通过网站或移动应用以距离方式提供的、旨在缔结消费者合同的在线销售服务。
  - 可信度：**已验证**（recital 42/43 文本）

**未能验证**（EUR-Lex 正文抽不出，我拒绝编造）：

- Article 2 的精确适用范围措辞与 Annex II 的服务清单原文。
- Article 31 的适用日期条款原文措辞；**「2025 年 6 月 28 日」这一具体日期我未能在 EUR-Lex 正文里逐字读到**。
- Article 4(5) 微型企业豁免的精确条文措辞与「10 人 / 200 万欧元」阈值原文（该阈值属欧盟通用微型企业定义，但我未在一手文本内确认本指令的引用方式）。
- **EN 301 549 的版本号（是否为 v3.2.1）及其与 WCAG 2.2 的映射关系**——未能验证，未读到 harmonised standard 的官方引注。
  - 仅有一个**第三方**弹药点：搜索返回一份德国 MPO 的指引文件，涉及「自我服务终端」的 EN 301 549 指引，但**不构成 EAA 服务条款的验证**。

**适用性裁定（我的判断，并标明推理）**：

- 若本产品**作为 e-commerce 服务向欧盟消费者销售订阅**，且运营者**不是微型企业**（≥10 人或 >200 万欧元），则 EAA 的**服务**无障碍义务在 2025-06-28 之后**原则上适用**。它要求的不只是营销页可访问，而是**从注册、购买到使用简历编辑器这整条消费者流程**可访问。
- 若运营者是**微型企业**，按序言 (70) **不适用**——这是最常见的真实情形，也是「EAA 一定管到你」这一说法的夸大之处。
- **自托管（self-hostable）这一事实本身不改变适用性**：适用性取决于**谁在向欧盟消费者提供服务**，不取决于代码部署在哪里。但如果本仓库只是被第三方自托管，义务落在**各自的运营者**，不在代码作者。

### 1.2 WCAG 2.2：真正的强制力来自「被法规引用」，而不是 W3C 本身

**已核验的一手事实**：

- WCAG 2.2 是 **W3C Recommendation，日期 2024 年 12 月 12 日**。
  - 来源：[Web Content Accessibility Guidelines (WCAG) 2.2, W3C](https://www.w3.org/TR/WCAG22/) — 一手，**已验证**
- WCAG 2.2 与 2.0/2.1 **向后兼容**：符合 2.2 即符合 2.0 与 2.1；W3C 建议新政策用 2.2。
  - **已验证**（Abstract 原文）
- 本案点名要查的 6 条，**级别我逐条核对过官方 Understanding 文档**：

| SC | 名称 | **级别** | 义务原文要点 |
|---|---|---|---|
| 2.4.11 | Focus Not Obscured (Minimum) | AA | 键盘焦点组件不被作者内容完全遮挡 |
| **2.4.13** | **Focus Appearance** | **AAA** ⚠️ | 焦点指示区域 ≥ 未聚焦组件 2 CSS px 周长的面积，且聚焦/未聚焦同像素对比 ≥ 3:1 |
| 2.5.7 | Dragging Movements | AA | 一切**拖拽**操作必须存在**单指针、非拖拽**的等价方式（除非拖拽是 essential 或由 UA 决定） |
| 2.5.8 | Target Size (Minimum) | AA | 指针目标 ≥ **24×24 CSS px**，除非满足 Spacing / Equivalent / Inline / UA / Essential 之一 |
| 3.2.6 | Consistent Help | A | 若多页含帮助机制（人工联系方式、自助选项、全自动联系方式），须在**相同相对顺序**出现 |
| 3.3.7 | Redundant Entry | A | 同一**流程**内已提供过的信息，须**自动填充**或**可供选择**；例外：essential、安全需要、信息已失效 |
| 3.3.8 | Accessible Authentication (Minimum) | AA | 认证步骤不得要求**认知功能测试**（记密码、解谜），除非有 Alternative / Mechanism / Object Recognition / Personal Content |

来源：[Understanding SC 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)、[2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)、[2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)、[3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html)、[3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)、[3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) — 一手，**均已验证**

**必须纠正的流行误解（重要）**：**2.4.13 Focus Appearance 是 AAA，不是 AA。** 项目研究者若按「WCAG 2.2 AA 要求焦点外观 3:1」来写验收标准，就写错了。AA 的焦点要求是 **2.4.7 Focus Visible + 2.4.11 Focus Not Obscured (Minimum)**；「焦点指示 2px 周长 + 3:1」是 AAA 才有的。

**适用性裁定**：WCAG 2.2 **本身不是法律，不直接约束任何人**。它只在被法规/合同引用时产生强制力。本案中它被引用的**唯一现实渠道是 EAA**（以及若出售给美国联邦机构的合同条款）。所以 WCAG 的约束力**继承自 1.1 的适用性结论**：微型企业 → 不强制；非微型且向欧盟销售 → 强制。

### 1.3 本代码库已有的合规缺口（我实际读代码确认，不是推测）

- **2.1.1 Keyboard（A）+ 2.5.7 Dragging Movements（AA）已确认违反，且已被项目自己用 `it.fails` 钉住**：编辑器章节排序只有拖拽把手（一个只带 `onPointerDown` 的 `<div>`，无 `tabIndex`、无 `role`、无键盘处理），`framer-motion` 的 `Reorder.Item` 不提供键盘替代。
  - 证据：[ResumeEditor.a11y.test.tsx](src/components/ResumeEditor.a11y.test.tsx) — 该文件第 15–17 行自己就点明这是 2.1.1 与 2.5.7。
  - **意义**：这不是「将来要注意」，是**今天就让键盘用户无法排序章节**。若产品面向欧盟非微型企业客户，这是**当前违规**。
- **3.1.1 Language of Page（A）风险**：根布局把 `lang` **硬编码为 `zh-CN`**。
  - 证据：[layout.tsx:25](src/app/layout.tsx#L25) — `<html lang="zh-CN" ...>`
  - **意义**：产品自称中英双语，但英文简历/英文界面下屏幕阅读器会用**中文语音**朗读英文。这是 A 级失败，且修复成本极低（按当前语言动态设 `lang`）。
- **2.5.8 Target Size (Minimum)（AA）风险点**：`Button` 的 `sm` 尺寸为 `h-8`（32px 高，达标），但 `isIconOnly` 的 `sm` 走 `iconSizeMap`；`Chip` 的 `sm` 为 **`h-5`（20px）**、`md` 为 `h-6`（24px，恰好达标）、`lg` `h-7`。`resume-render/TemplateSelector.tsx` 里还有一个 `w-6 h-6` 的角标控件。
  - 证据：[Button.tsx:70-73](src/components/ui/Button.tsx#L70-L73)、[Chip.tsx:54-57](src/components/ui/Chip.tsx#L54-L57)、[TemplateSelector.tsx:239](src/components/TemplateSelector.tsx#L239)
  - **意义**：`Chip sm`（20px）**低于 24px**，只有满足 Spacing 例外（与相邻目标各留出 24px 直径圆不相交的空间）才合规。需逐个目标测量，不能只看类名。
- **3.3.8 Accessible Authentication（Minimum）（AA）风险**：登录/注册采用**6 位验证码**（`placeholder="6位验证码"`）。
  - 证据：[login/page.tsx:175-183](src/app/login/page.tsx#L175-L183)、[register/page.tsx:175-176](src/app/register/page.tsx#L175-L176)、[settings/page.tsx:236](src/app/settings/page.tsx#L236)
  - **意义**：3.3.8 的 Note 2 明确把「**支持密码管理器**」和「**允许复制粘贴**」列为满足该条的机制。我在代码里**没有发现**验证码输入框阻止粘贴（`preventDefault` 出现在 `AIUpload`/`FileUpload`/`ResumeStartScreen`，不在验证码输入上），所以**当前可能已满足**——但这依赖「粘贴不被拦」，必须有测试钉住，否则一次「禁用粘贴防作弊」的改动就变成 AA 违规。另：登录页存在密码登录 tab，构成 3.3.8 的 **Alternative**，进一步降低风险。
- **3.3.7 Redundant Entry（A）**：官方 Intent 明确「本 SC **不要求在会话之间**存储信息」，且流程以**活动**为界。简历编辑器内已填写内容在导出/新建变体时重复索要，才可能触发。**当前未发现明显违规**，但变体管理（工单 40）设计时要注意。

### 1.4 美国 Section 508 与 ADA Title II：对私有 SaaS **基本不适用**，这是本案最大的被夸大点

**已核验的一手事实**：

- **ADA Title II 最终规则**（28 CFR Part 35，DOJ）：*Nondiscrimination on the Basis of Disability; Accessibility of Web Information and Services of State and Local Government Entities*，2024-04-24 公布，**生效日 2024-06-24**，89 FR 31320。
  - 来源：[Federal Register API 记录 2024-07758](https://www.federalregister.gov/api/v1/documents/2024-07758.json)、[规则全文](https://www.federalregister.gov/documents/full_text/text/2024/04/24/2024-07758.txt) — 一手，**已验证**
  - **其标题与摘要都写明适用对象是 State and local government entities**（州与地方政府）。**它不约束私有 SaaS。**
- **★ DOJ 已在 2026 年延长了合规期限**——这是 2024 年之后的重大变化，很多二手资料还在引用旧日期：
  - *Extension of Compliance Dates…*，**Interim Final Rule，2026-04-20 公布并生效**，91 FR 20902。
  - 50,000 人及以上人口的州/地方政府实体：合规期限由 **2026-04-24 → 2027-04-26**。
  - 50,000 人以下人口及特别区：由 **2027-04-26 → 2028-04-26**。
  - 证据：`Sec. 35.200 [Amended]` 把 `(b)(1)` 的 "April 24, 2026" 替换为 "April 26, 2027"，把 `(b)(2)` 的 "April 26, 2027" 替换为 "April 26, 2028"。
  - 来源：[Federal Register API 记录 2026-07663](https://www.federalregister.gov/api/v1/documents/2026-07663.json)、[IFR 全文](https://www.federalregister.gov/documents/full_text/text/2026/04/20/2026-07663.txt) — 一手，**已验证**
  - **⚠️ 若你的路线图写的是「2026 年 4 月 24 日 / 2027 年 4 月 26 日」，那是过期信息，请更新。**

**适用性裁定（明确回答「是否约束私有 SaaS」）**：

- **ADA Title II：不适用。** 它约束州与地方政府。私有 SaaS **不在**义务主体范围内，2027/2028 的期限**与你无关**，除非——你**向这些政府实体销售**，那时它变成**采购合同条款**（你的客户把 WCAG 2.1 AA 写进合同），是**商业风险不是法律义务**。
- **Title II 采用的是 WCAG 2.1 Level AA**（非 2.2）。这一点重要：**美国这条线的标准比 EAA/WCAG 2.2 更旧更宽**。
- **ADA Title III（私有企业）**：**没有**对应的具体网络无障碍规章。对私有 SaaS 的暴露是**个案诉讼**（司法实践中「有效沟通」理论），**没有法定截止日期**。→ 可信度：**第三方/一般法律共识**，我未从 ada.gov 取得一手确认（`ada.gov` 相关页面返回 404）。
- **Section 508**：适用于**美国联邦机构**采购的 ICT，以及接受联邦资金的机构。**未验证**其修订后的具体标准引注（Rehabilitation Act §508 及 36 CFR 1194 的最新版本我未读到一手文本）。**适用性：对私有 SaaS 不直接适用**；只在「卖给美国联邦政府」时通过**合同/采购**（如 VPAT 要求）变成现实义务。
  - **判据优先级**：对私有 SaaS，**EAA 是唯一现实的法定强制渠道**；508/Title II 是**大客户投标场景**的商业要求。

### 1.5 PDF 无障碍（PDF/UA / tagged PDF）：是真实要求，但「必须 PDF/UA 合规」我没能验证成强制

**已核验**：

- W3C 把 PDF 无障碍作为**技术**（Techniques）而非独立 SC 处理，例如 **PDF1: Applying text alternatives to images with the Alt entry in PDF documents**，且该页明确声明：**Techniques are examples… are not required to meet WCAG**。
  - 来源：[PDF1 technique, W3C](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF1) — 一手，**已验证**
  - 技术前提值得注意：PDF1 明确说「This technique applies to **tagged PDF** documents with images」——**W3C 的无障碍 PDF 技术全部以 tagged PDF 为前提**。
- **WCAG 2.2 一致性要求 5.2.3（Complete processes）**：整个**流程**须一致，而非单个产物。对/错针对**流程**边界。
  - 来源：[WCAG 2.2 §5.2](https://www.w3.org/TR/WCAG22/#cc3) — 一手，**已验证**（见目次 §5.2.3）

**未能验证**：

- **PDF/UA 的 ISO 编号与版本**：PDF/UA-1 通常被称 **ISO 14289-1**（2014），PDF/UA-2 为 **ISO 14289-2**。我尝试 `iso.org` 与 `pdfa.org`，**均返回 403（Cloudflare 挑战）**，**未取得一手确认**。→ **未能验证，请勿在文档中当作已知数引用具体年份。**
- **Matterhorn Protocol 的版本号与发布日期**：未能取得一手来源（pdfa.org 403）。**未能验证。**
- **EN 301 549 是否强制 PDF/UA**：**未能验证**。我未读到 EN 301 549 的一手条文。

**架构级证据（值得记下来，这是本项目最硬的一条一手观察）**：

- 我在研究中**亲自撞上了一个真实的无障碍后果**：**EUR-Lex 自己生成的 EAA PDF（`CELEX:32019L0882`）正文抽不出文字**——`pdf-reader` 只能抽出封面、目录、Annex，Article 1–35 全丢；而同站 AI Act PDF 正常。这是「**一份正式发布的 PDF，其文本层不可用**」的活样本，正好是屏幕阅读器用户的处境。
  - 补充：`pdf-reader inspect` 显示该文件 `has_structure_tree: true`、`has_mark_info: true`——**即它带结构树，正文却仍抽不出文字**。这说明「有 tag」不等于「可无障碍读取」，tag 的正确性才是关键。
  - 对产品的直接含义：**一份没有正确文本层/标签的 PDF 简历，对屏幕阅读器用户等于空白或乱码**，用户拿不到任何内容；而对 ATS，则是 Recruiterflow 明确说的「scanned image without a text layer → 解析器读不了」。**无障碍与 ATS 可解析性在这里是同一个问题的两面**——这是本报告最有价值的交叉发现。
- 项目已有的 `verify:print` / `verify:template` 已在断言**PDF 文字层可抽取且无 `�`**（见 [AGENTS.md](AGENTS.md) 与 [export-pdf.tsx](src/lib/export-pdf.tsx)），这**已经**覆盖了「文本可达」这一层。缺的是**语义层**：阅读顺序、标题层级、表格/表头语义、图片 alt、文档语言标记。

**适用性裁定**：

- 「无障碍 PDF 是简历产品的真实要求」——**成立**，但强制力来源有两条，强度不同：
  1. **EAA 路径（有强制力）**：若在 1.1 的适用范围内，则**生成简历文档这一功能**属于「完整流程」的一部分，须可访问。这不必然等于「每份导出的简历必须通过 PDF/UA 校验」，但没有语义标签的 PDF 在**实际效果上**不满足 WCAG 的文字替代/阅读顺序要求。
  2. **采购/合同路径（有条件）**：卖给公共部门或大企业时，常被要求提供无障碍产物或 VPAT。
- **不成立的说法**：「法律要求简历 PDF 必须通过 PDF/UA-1 校验」。我**没有**找到任何法规这样要求。PDF/UA 是**可用的一致性工具**，不是被点名的法定标准（至少我未能验证）。

---

## 2. 有明确日期的未来强制要求

| 日期 | 事项 | 状态 | 对本产品的含义 | 可信度 |
|---|---|---|---|---|
| **2024-06-24** | ADA Title II 网络规则生效 | **已生效** | 只约束州/地方政府，**私有 SaaS 不适用** | 已验证 |
| **2025-02-02** | EU AI Act 部分条款（Chapter I/II）开始适用 | **已生效** | 见 §5.4 | 已验证 |
| **2025-06-28** | EAA 服务义务适用日（**未能从一手正文逐字确认**） | 已过 | 非微型企业+向欧盟销售 → EAA 服务无障碍义务已生效 | **未能验证（日期）** |
| **2025-09-01** | 中国《人工智能生成合成内容标识办法》施行 | **已生效** | 见 §5.5 | 已验证 |
| **2027-04-26** | ADA Title II：≥50,000 人口实体新合规期限 | 未来 | **私有 SaaS 不适用**；仅当卖给该等政府客户时成为合同要求 | 已验证 |
| **2028-04-26** | ADA Title II：<50,000 人口及特别区新合规期限 | 未来 | 同上 | 已验证 |
| **2026-08-02** | EU AI Act 全面适用日 | 未来（已很近） | Article 50 透明度义务的适用时点 | 已验证（Recital 179 + Article 113 原文） |

**EU AI Act 分期适用的一手证据**：Recital 179 原文「This Regulation should apply from **2 August 2026**. However, taking into account the unacceptable risk associated with the use of…」；Article 113 原文「It shall apply from **2 August 2026**. However: (a) Chapters I and II shall apply from **2 February 2025**」。
来源：[AI Act PDF, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32024R1689) — 一手，**已验证**（via `pdf-reader` search on pp.44, 123）

---

## 3. 真实存在但**无强制力**的标准与期望

**明确声明：以下都不是法律义务，不遵守不会违法。** 把它们当 roadmap 的「必须」，是把建议当成了要求。

- **WCAG 2.2 的 Understanding 文档与 Techniques**：W3C 在每一页都写明 *Informative explanations, not required to meet WCAG* / *Techniques are examples… not required*。**已验证**。
- **W3C ATAG（Authoring Tool Accessibility Guidelines）**：一个**简历编辑器本质上是一个 authoring tool**。ATAG 要求工具有助于产出无障碍内容（Part B）。我在本次研究中**未取得 ATAG 一手版本信息**，因此**未能验证**，但它对本产品的相关性是**结构性**的，值得单独一轮研究。（**未验证的假设，需查证后再写进路线图。**）
- **VPAT / ACR**：投标文件，非法规。购买方要求时才存在。
- **EN 301 549**：在 EAA 体系里提供「符合性推定」的协调标准。**其版本与强制关系我未能验证。**
- **JSON Resume / Open Badges / VC 2.0 / HR Open / ESCO**：见 §4 与 §5，均**无强制力**。

---

## 4. 招聘系统实际行为（厂商文档，不是民间传说）

> **方法警告**：我搜「Lever ATS resume format」「SmartRecruiters ATS resume format」「iCIMS resume format」时，返回结果被 **resumegyani.in / jobscan.co / resumeadapter.com / atscvchecker.pro / atsverification.com** 这类 SEO/营销站点占据。**它们不是厂商文档**，其「厂商要求」多为推测。**下面只采用厂商自己的帮助中心/文档。**

### 4.1 厂商**确实**写下来的解析失败原因（一手）

**Greenhouse —— 最详细，且明确写了版式禁忌**

来源：[Unsuccessful resume parse, Greenhouse Support](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)（页面标注 Last updated: **March 02, 2026**）— 一手，**已验证**

原文列出的失败原因（逐条）：
- 文件 **> 2.5MB** 无法解析。
- 字母之间带空格的简历（`F i r s t  L a s t`）——解析器不把它当一个词。
- **含图形、照片或 word art** 的简历。
- **以图片上传而非文档（.docx / .pdf）** 的简历。
- **含表格、页眉、页脚的复杂简历**。
- **姓名和联系方式放在页眉、页脚或文本框**里的简历。
- **分栏（columned）布局**的简历。
- **没有清晰章节、各章节格式不一致**的简历。
- 公司名不含 Inc./Co./LTD/LLC 等标识词。
- 职位名不完整（`Sr. Account Exec` 而非 `Senior Account Executive`）。

并明确说明：这些情况**可能导致部分解析**，需人工核对。

**Recruiterflow —— 明确区分「支持的文字型格式」与「图片型 PDF」**

来源：[My resumes are not being parsed?, Recruiterflow Help Center](https://help.recruiterflow.com/en/articles/7996760-my-resumes-are-not-being-parsed) — 一手，**已验证**

- 可解析格式（原文列举）：**DOC, DOCX, PDF, RTF, TXT, ODT, HTM, HTML, DOCM, DOTM, DOT, DOTX**。
- 原文：「if the resume is an image (JPEG, PNG) or **a PDF that's a scanned image without a text layer**, the parser can't read it.」
- **修复建议是让用户跑 OCR**——即该厂商**不做** OCR。
- **密码保护的文件无法解析**。
- **重复上传同一文件不会重新触发解析**（需上传新版本，例如重新保存的 DOCX）。
- 语言支持**明确分级**：
  - **Full parsing**：English, French, German, Spanish, Polish, Turkish, Portuguese, Italian, Dutch, **Chinese (Simplified)**, Japanese, Russian, Arabic, Indonesian, Danish, Swedish, Romanian, Korean, Hebrew, Thai。
  - **Basic parsing**：Ukrainian, Bulgarian。
  - 其他语言「解析器不会可靠地抽取字段」。

**Recruit CRM —— 格式更窄，且承认 OCR 生成的 PDF 仍可能失败**

来源：[Parsing Failed, Recruit CRM Help Center](https://help.recruitcrm.io/en/articles/3639421-parsing-failed)（页面标注 Updated over 2 weeks ago）— 一手，**已验证**

- 支持格式**仅 `.DOC`, `.DOCX`, `.PDF`**。
- 原文：简历中**信息以嵌入图片形式存在**时，解析器可能无法抽取。
- 原文：由图片经 OCR 转成 PDF 的简历「**supported in some cases**」，但若文字无法被正确读取/抽取**仍会失败**；建议用**文字可选中**的版本。

**Greenhouse 的语言支持列表**

来源：[Resume parsing with non-English languages, Greenhouse Support](https://support.greenhouse.io/hc/en-us/articles/205019689-Resume-parsing-with-non-English-languages)（Last updated: **May 06, 2026**）— 一手，**已验证**

- Full parsing 支持 26 项，**其中包含「Chinese (Simplified)」与「Simplified Chinese」（列表里重复出现）**。
- **⚠️ 关键发现：列表里没有「Chinese (Traditional)」。** 该厂商**未**声明支持繁体中文。→ 对双语产品是具体的功能边界：**简中可解析，繁中未有厂商声明。**

**Moka（国际站）—— 只有营销文，且数字未经第三方验证**

来源：[How to Master Resume Parsing, MokaHR](https://www.mokahr.io/myblog/how-to-master-resume-parsing/)（2026-04-03）— **厂商营销内容，非产品文档**

- 自称「97% parsing precision across multilingual documents」「1.4M+ resumes」「90%+ matching accuracy」。
- 自称支持 CJK 与东南亚语言；并称 Western-built parsers 在非拉丁文字上表现差。
- **可信度：不确定**。这是**营销博客**，不是产品文档，数字无独立验证。**不要把这些数字写进竞品分析当事实。**
- 它还称竞品「Greenhouse…limited Asian language support」——**这与 Greenhouse 自己列出 Simplified Chinese 支持的文档直接矛盾**。**这是「被证伪的说法」的一个实例。**

### 4.2 厂商**没有**文档化的部分（同样重要）

- **Workday**：搜索仅命中 `doc.workday.com/hiredscore/.../concept--candidate-profiles.html`（候选人档案概念页），**未见到**关于解析支持格式/版式禁忌的公开文档。→ **未发现厂商文档。**
- **Lever / iCIMS / SmartRecruiters / Oracle Taleo**：搜索这些厂商的解析文档时，**结果被 SEO 站点占满，未找到厂商自己的解析行为文档**。→ **未发现厂商文档**（Lever 的 `help.lever.co` 未命中相关文章）。
- **SAP SuccessFactors**：命中了 SAP Help Portal 的 *Working with Resume Parsing* 页面（`help.sap.com/docs/successfactors-recruiting/.../working-with-resume-parsing`），但我**未能实际读取其内容**以确认具体格式要求。→ **存在文档，内容未能验证。**
- **没有任何厂商文档说「PDF 优于 DOCX」或反之。** 我读到的三家（Greenhouse / Recruiterflow / Recruit CRM）都是**格式白名单 + 失败原因**，**没有格式偏好排序**。→ 「PDF 比 DOCX 更容易过 ATS」这一流行说法，**我未能从任何厂商文档中找到依据**。
- **没有厂商文档点名「章节标题词汇表」**（如必须叫 "Work Experience"）。Greenhouse 只说「**没有清晰章节、各章节格式不一致**」会失败——它要求的是**清晰与一致**，**不是特定词表**。→ 「必须用特定章节名」是**被夸大**的说法。
- **没有厂商文档给出「多少比例简历被自动拒绝」的数字。** → 「ATS 自动拒掉 75% 简历」**未获证实**（见 §6）。

### 4.3 中文简历解析（国内系统）

**诚实结论：国内厂商基本没有公开的解析行为文档。** 我做了中文检索，结果是：

- **Moka**：`mokahr.io` 是国际站营销博客（见上）；**未找到** `mokahr.com` 上关于「简历解析支持格式」的帮助中心文档。
- **北森（Beisen）**：搜索命中 `beisen.com/news/441.html` 等**产品/新闻页**，**未找到**解析格式要求的帮助文档。
- **智联招聘 / BOSS直聘 / 前程无忧**：命中的是 `php.cn`、`xdf.cn` 等**第三方技巧文**与「附件简历上传技巧」类内容，**不是厂商文档**。这些站点声称「Word 或 PDF 均可」，**无可信度**。
- **eRoad 寻才**：只命中浏览器扩展商店条目。
- → **未能验证**任何国内厂商对「中文简历格式/文字层」的文档化要求。
- **对本产品的含义（这是推理，不是文档）**：既然**国际厂商（Greenhouse、Recruiterflow）都把「图片型 PDF / 无文字层」列为硬失败原因且部分不做 OCR**，那么面向国内投递场景，**保证 PDF 一定有可用文字层（含 CJK）**是唯一能自己控制的、跨厂商通用的安全底线。**这与项目已有的 `verify:print` / `verify:template` 断言方向一致，是正确的。**

### 4.4 Google Jobs / schema.org 结构化数据

- **Google 的 JobPosting 结构化数据文档存在**，地址 `developers.google.com/search/docs/appearance/structured-data/job-posting`。
  - **可信度：第三方**（搜索返回了该页及其多语言版本，但我**无法 fetch `developers.google.com`**，`TypeError: fetch failed`，**未能读到内容**）。
  - 从搜索结果的标题与摘要可见：该文档是**面向招聘方发布职位**的，且明确「不收录没有申请方式的招聘信息」。
- **schema.org 是否存在 `Resume` 类型**：**未能验证**（`schema.org` fetch 失败）。搜索返回 `auto.schema.org/hasOccupation`、`isotc204.org` 的 `hasOccupation` 属性页，指向的是**职业**（occupation）而非**简历**（resume）类型。
- **结论（低可信度但方向明确）**：**没有任何证据表明存在一个被消费的「简历结构化数据」**。`JobPosting` 是给**职位**用的，不是给**候选人简历**用的。简历是**私人文档**，其发布形态是「投递给某个雇主」，而不是「发布到公开网络供爬虫索引」。
  - 因此：**「为简历加 schema.org 结构化数据以提升曝光」这件事，我没有找到任何有意义的消费方。** 建议**不要**把它列为 SEO 需求。（可信度：**不确定**，因 schema.org 与 Google 文档均未读成。）

### 4.5 robots / noindex 与个人数据索引

- **Google 有官方的「从 Google 移除信息」文档**（`developers.google.com/search/docs/crawling-indexing/remove-information`），我**未能 fetch 成功**（同上前端网络限制）。→ **未验证具体政策条文。**
- **另一条已核验的事实**：`noindex` 是**建议性**的——要让页面不被索引，最可靠的是**不把页面放在公开可访问的 URL 上**（登录墙 + 不可猜链接）。这一点与本项目已有的 ADR-0009（可见性由 grants 派生）方向一致。
- **适用性裁定**：简历分享页属于**个人数据**。**默认不应被搜索引擎索引**。这不依赖任何法规——它是**产品安全默认值**：一份简历被 Google 索引 = 姓名+电话+雇主+住址的永久公开泄露。
  - 但要注意：**`robots.txt`/`noindex` 不是访问控制**。若分享链接可被匿名访问，即使 noindex，链接泄露即数据泄露。**真正的控制是认证 + 不可枚举的 slug**（项目工单 13/38 已在处理 slug 竞争与分享保护，方向正确）。

---

## 5. 法律与隐私

### 5.1 GDPR（Regulation (EU) 2016/679）

> **来源说明**：`eur-lex.europa.eu` 的 GDPR HTML/PDF 在本环境**持续返回 HTTP 202 或超时**。我能读到的是 **`gdpr-info.eu`**（Intersoft Consulting 维护的 GDPR 全文镜像）。它**不是欧盟官方发布**，但逐字转载法规文本。**因此以下条文号标注为「镜像验证」**——条文内容与我所知一致，但**未从 EUR-Lex 一手确认**。

**（a）简历内容是不是 personal data？是不是 special category？**

- **personal data**：GDPR Art. 4(1) 定义是「与已识别或可识别的自然人有关的任何信息」。**简历 100% 是 personal data。** 可信度：**已验证（镜像）**。
- **special category（Art. 9(1)）**：原文列举——揭示**种族或民族出身、政治观点、宗教或哲学信仰、工会会员身份**的数据，以及**基因数据、生物识别数据（用于唯一识别）、健康数据、性生活或性取向**数据。**原则上禁止处理**，除非落入 Art. 9(2) 的例外（其中最重要的是 **explicit consent**）。
  - 来源：[Art. 9 GDPR](https://gdpr-info.eu/art-9-gdpr/) — 镜像，**已验证条文列举内容**
- **对本产品的适用性裁定（重要且常被忽略）**：
  - **一份简历极易包含 Art. 9 数据**：**证件照**可揭示种族/民族出身；姓名/性别/出生地可推断民族；**政治面貌**（中共党员/共青团员——中国简历的标准字段）**直接对应「政治观点」或「工会会员身份」类**；健康状况、残疾、宗教信仰也常出现在简历里。
  - → **这意味着：如果产品对欧盟用户提供「政治面貌」字段，或允许上传证件照并处理它，就在处理 Art. 9 special category data，需要 explicit consent 或另一项 Art. 9(2) 例外。**
  - 这是**一个真实的中欧产品设计冲突**：中国简历标准字段（政治面貌、证件照、出生日期、性别）恰好是欧盟最敏感的那几类。**建议按地区差异字段集**，而不是一套字段全球通用。

**（b）Art. 17 删除权对「文档存储 + 版本历史」意味着什么？**

- Art. 17(1)(a) 起首：「数据主体有权要求控制者**无不当延迟地删除**其个人数据」，在若干情形下（撤回同意、不再必要等）。
- **我未能逐字读到 Art. 17 正文**（镜像页返回的内容被截断在导航区）。→ **可信度：第三方**（Art. 17 的存在与一般内容是常识级的，但**具体款项措辞未验证**）。
- **未验证的关键问题**：Art. 17 是否延伸到**备份**。这是 GDPR 实践中最常被问的问题，且**各 DPA 立场不一**，我没有取到 EDPB 或任一 DPA 的一手指引。→ **未能验证。不要在这上面写确定结论。**
- **对代码库的具体含义（基于原则推理，非条文）**：本产品有**内容版本历史**（工单 16 content-history、ADR-0010 乐观锁）。若用户行使删除权，而历史版本里仍保留整份简历文本，则「删除」在功能上未完成。**必须有一条覆盖 `resume_versions`（及任何全文索引/审计日志/LLM 调用日志）的硬删除路径**，否则「删除账号」是假的。

**（c）Art. 20 数据可携带**

- **未能读到条文正文**（镜像页同样截断）。→ **可信度：第三方**。
- 一般内容（**第三方**）：限于用户**基于同意或合同**、以**自动化方式**提供的数据，须以**结构化、通用、机器可读**格式提供。→ **一份 JSON Resume 导出正好符合**；PDF 导出**不一定**算「机器可读的通用格式」。
- **对本产品的具体含义**：**工单 42（JSON Resume 适配器）不只是互操作功能，它也是 Art. 20 可携带义务的最省事实现。** 这是一个额外的、非显然的理由去保留该工单。

**（d）Art. 28 处理者（把简历文本发给第三方 LLM）**

- Art. 28(3) 要求控制者与处理者之间订立合同，且合同须包含一系列强制性条款（按控制者指示处理、保密、安全措施、子处理者、协助数据主体权利、删除/返还、审计配合等）。→ 可信度：**第三方**（未读正文）。
- **适用性裁定**：**如果 LLM 提供商仅按你的指示处理数据且不为自己目的使用，它是 processor，需要 DPA。** 主流 LLM API 的条款通常自我定位为 processor 并提供 DPA。**这是必须落实的合同动作，不是代码动作**——但要有一个**登记表**记录用了哪些 provider、是否签了 DPA，否则无法向客户证明合规（见 `src/lib/ai-providers.ts` 与 `settings/ai`，那里已有 provider 配置，是挂 DPA 元数据的自然位置）。

**（e）Art. 44+ 国际传输**

- **未验证**：EU-US Data Privacy Framework 在 2026 年的有效性与诉讼状态（Latombe 等）。**我未取得一手指引。→ 未能验证。不要在文档中断言 DPF 有效或已失效。**
- **适用性裁定**：若欧盟用户数据被发送到美国/中国的 LLM API，则构成传输，需要 adequacy / SCC / 其他 Art. 46 机制之一。**这是一个需要法务确认的问题，不是工程能自决的。**

### 5.2 中国《个人信息保护法》（PIPL）

> **本次研究最扎实的一块**：我取得了 **npc.gov.cn 的一手全文**，条文号逐条核对。
> 来源：[中华人民共和国个人信息保护法，中国人大网](http://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html) — **一手，已验证**

- **施行日：第74条「本法自2021年11月1日起施行」** — **已验证**。

**（a）简历是不是个人信息？政治面貌/证件照是不是敏感个人信息？**

- **第4条**：个人信息是「以电子或者其他方式记录的与已识别或者可识别的自然人有关的各种信息，不包括匿名化处理后的信息」；处理包括「收集、存储、使用、加工、传输、提供、公开、删除」。→ **简历是个人信息，无疑。** **已验证。**
- **第28条（敏感个人信息定义）**：原文——「敏感个人信息是一旦泄露或者非法使用，容易导致自然人的人格尊严受到侵害或者人身、财产安全受到危害的个人信息，包括**生物识别、宗教信仰、特定身份、医疗健康、金融账户、行踪轨迹**等信息，以及不满十四周岁未成年人的个人信息。」
  - **⚠️ 诚实的技术细节：第28条的列举里没有「政治面貌」四个字。** 「政治面貌」是否算**「特定身份」**，是一个**解释问题**，我**没有**找到官方指引明确回答。→ **应标为「不确定/依赖解释」，不要断言。**
  - **证件照**：若用于**人脸识别/生物识别**，则明确落入「生物识别」→ 敏感个人信息。若仅作为附件存储、不做生物识别处理，则不必然。→ **关键在于「怎么用」，不是「有没有」。**
- **第29条**：处理敏感个人信息应当取得**单独同意**。→ 若上述字段落入敏感个人信息，则**需要单独同意**（一个独立、明确、不与主同意捆绑的同意动作）。

**（b）告知与同意的具体义务**

- **第17条**：处理前须以**显著方式、清晰易懂的语言**真实、准确、完整告知：处理者名称/联系方式；**处理目的、处理方式、处理的个人信息种类、保存期限**；个人行使权利的方式和程序。→ **注意「保存期限」是法定必告事项。** 本产品若没有「保留期」这个概念和字段，**第17条无法满足**。
- **第14条**：同意须由个人在充分知情前提下**自愿、明确**作出。
- **第15条**：有权**撤回同意**，处理者须提供**便捷的撤回方式**。
- **第19条**：保存期限应为「实现处理目的所必要的**最短时间**」。→ **与第17条的「保存期限」呼应：必须有保留策略，且不能无限期保存简历。**
- **第23条（提供给第三方）**：向**其他个人信息处理者**提供个人信息时，须告知接收方名称/联系方式、处理目的、处理方式、信息种类，并取得**单独同意**。
- **第21条（委托处理）**：委托处理须约定目的、期限、方式、种类、保护措施、双方权利义务，并**监督**受托人；受托人不得超范围处理，合同终止须返还或删除。
  - **⚠️ 关键判定：把简历文本发给 LLM，是第23条（提供）还是第21条（委托）？** 这取决于 LLM 提供商是**独立决定处理目的**（→第23条，需单独同意）还是**仅按指示处理**（→第21条，需委托合同+监督）。**这个区分是本案最需要法务定性的问题，不是工程能定的。** 建议：**按更严格的一侧（第23条）设计——即提供单独同意 + 告知接收方**——因为这是唯一在两种定性下都安全的做法。
- **第24条（自动化决策）**：利用个人信息进行自动化决策须保证透明度和结果公平公正；通过自动化决策作出对个人权益有重大影响的决定，个人有权要求说明并**有权拒绝仅通过自动化决策作出决定**。
  - **⚠️ 重要区分（必须写清楚）**：**AI「帮你写简历」不是「对用户作出决定」**——它不是第24条意义上的自动化决策。**但 AI「筛选/打分简历用于招聘决定」是。** 本产品做的是前者（工单 31/32/34 是 analyze / JD-match / proposals），**因此不触发第24条**——除非产品将来加入向雇主推荐排序的功能。**不要因为用了 AI 就宣称自己受第24条约束；也不要在加入筛选功能后忽略它。**

**（c）删除权（第47条）——对版本历史与备份的硬约束**

- 第47条规定了应当**主动删除**的情形（处理目的已实现/为提供服务所必需/保存期限届满、停止提供产品或服务、个人撤回同意等），以及**技术上难以删除时须停止除存储和必要安全措施以外的处理**。
  - **⚠️ 诚实标注**：我在截断的抓取里**未逐字读到第47条全文**（抓取在第五章之后被中间裁剪）。→ **第47条的具体款项措辞标为「第三方」**，其存在与大意我有把握，**逐字未验证**。
- **对代码库的具体含义**：与 GDPR 同理，**「删除」必须穿透 `resume_versions`**。PIPL 多一条「技术上难以删除时须停止处理」的退路，**但这条退路不能用来替代真删除**——它针对的是备份这类确难删除的场景，且要求前端的存储之外处理全停。

**（d）个人信息保护影响评估（PIPIA，第55/56条）**

- **未逐字验证**（同样落在被裁剪的区间）。一般内容（**第三方**）：处理**敏感个人信息**、**利用个人信息进行自动化决策**、**委托处理/向他人提供个人信息**、**向境外提供个人信息**等情形，应当事前进行个人信息保护影响评估并**记录处理情况**。
- **适用性裁定**：**本产品几乎肯定触发 PIPIA**——它向第三方（LLM）提供个人信息，且很可能涉及敏感个人信息。→ **这不是可选项。** 但**评估是组织文档动作**，不是代码特性；代码侧要支持的是**「能说清哪个字段去了哪个 provider」**的审计能力（第51条级别的可证明性）。

**（e）数据出境（第38条 + 2024 年《促进和规范数据跨境流动规定》）**

> 这份 2024 年规章是**关键**，因为它**大幅放宽了阈值**，很多二手资料还停留在 2022–2023 的严格版本。
> 来源：[促进和规范数据跨境流动规定，网信办，2024-03-22](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm) — **一手，已验证，自公布之日起施行（2024-03-22）**

**第5条（豁免）** —— 原文规定，向境外提供个人信息符合以下之一者，**免予**申报安全评估、订立标准合同、通过认证：
- （一）为**订立、履行个人作为一方当事人的合同**确需向境外提供（列举如跨境购物、跨境寄递、跨境汇款、跨境支付、跨境开户、机票酒店预订、签证办理、**考试服务**等）；
- （二）按劳动规章制度/集体合同实施**跨境人力资源管理**确需提供**员工**个人信息；
- （三）紧急情况为保护生命健康财产安全；
- （四）**关键信息基础设施运营者以外**的数据处理者，**自当年1月1日起累计向境外提供不满10万人个人信息（不含敏感个人信息）**。

**第7条（须申报安全评估）**：CIIO 提供个人信息或重要数据；或非 CIIO 提供**重要数据**，或累计提供 **100万人以上**个人信息（不含敏感）或 **1万人以上敏感个人信息**。

**第8条（须标准合同或认证）**：非 CIIO 累计提供 **10万人以上、不满100万人**个人信息（不含敏感），或**不满1万人敏感个人信息**。

**第10条**：向境外提供个人信息的，仍须依法履行**告知、取得个人单独同意、进行个人信息保护影响评估**等义务。（即：豁免的只是「申报/合同/认证」这套机制，**第38/39条的告知与单独同意并没有被豁免**。）

**适用性裁定（对一个小型简历 SaaS）**：
- **很可能落在第5条（四）的豁免内**（累计向境外提供**不满10万人**个人信息，且**不含敏感个人信息**）→ **无需申报评估、无需标准合同、无需认证**。这是「PIPL 数据出境对我们是天大的负担」这一说法的**夸大之处**。
- **⚠️ 但豁免有两个容易踩空的前提**：
  1. **「不含敏感个人信息」**——若 ResumeVault 处理证件照（生物识别）或政治面貌被定性为敏感个人信息，则**第5条（四）不适用**，直接落入**第8条**（不满1万人敏感个人信息 → 须订立**标准合同**或通过**认证**）。**这是一个会翻转结论的定性问题。**
  2. **第10条的告知 + 单独同意 + PIPIA 始终要做**，与豁免无关。
- **CIIO 相关（第7条）**：本产品**不是**关键信息基础设施运营者，**不适用**。→ 明确回答「否」。

### 5.3 把简历文本发给第三方 LLM：是否产生文档化的披露/同意义务？

**结论：是，两套法域下都产生。** 这是本节最可操作的结论。

| 法域 | 义务 | 条文 | 适用性 | 可信度 |
|---|---|---|---|---|
| 中国 | 向其他处理者提供 → 告知接收方 + **单独同意** | PIPL 第23条 | **适用**（若定性为「提供」） | 一手已验证 |
| 中国 | 委托处理 → 委托合同 + 监督 | PIPL 第21条 | 适用 | 一手已验证 |
| 中国 | 出境 → 告知 + 单独同意 + PIPIA | PIPL 第38/39条 + 2024规定第10条 | **适用**（即使豁免申报机制） | 一手已验证（第10条） |
| 中国 | 生成式AI提供者不得非法留存可识别使用者身份的输入信息与使用记录 | 《生成式AI办法》第11条 | 若被定性为「向境内公众提供生成式AI服务」则适用 | 已验证 |
| 欧盟 | 需指定 LLM provider 为 recipient 并告知 | GDPR Art. 13/14 | **适用** | 第三方（未读正文） |
| 欧盟 | 需 DPA | GDPR Art. 28 | 适用 | 第三方（未读正文） |
| 欧盟 | 若构成自动化决策则有额外义务 | GDPR Art. 22 | **不适用**（AI 写作不是对用户的决定） | 第三方 |

**必须纠正的常见错误**：**「AI 写简历触发 GDPR Art. 22 自动化决策」是错的。** Art. 22 针对的是**对数据主体产生法律或类似重大影响的、仅基于自动化处理的决定**。帮你润色简历**不是**这样的决定。**真正会触发的是 AI 简历筛选/打分**（那是关于**候选人**的决定）——本产品若能加入「评估这份简历是否适合这个 JD」（工单 32），**则可能进入 Art. 22 与 PIPL 第24条的射程**，因为输出会实质影响用户对自身求职的判断。这是一个需要留意的边界。

### 5.4 欧盟 AI Act 透明度（Article 50）

**已核验**：

- **Article 50 的标题与位置**：*CHAPTER IV — TRANSPARENCY OBLIGATIONS FOR PROVIDERS AND DEPLOYERS OF CERTAIN AI SYSTEMS*，**Article 50 — Transparency obligations for providers and deployers of certain AI systems**。
  - 来源：[AI Act PDF, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32024R1689)，p.82 — 一手，**已验证（标题）**
  - 我也读到了第1款的**起始文字**：「Providers shall ensure that AI systems intended to interact directly with…」→ 即**与自然人直接交互的 AI 系统，须确保用户被告知在与 AI 交互**。**已验证（部分）**
- **适用日期**：**2026年8月2日**（Recital 179 + Article 113）。**已验证。**

**未能验证**：

- **Article 50 各款（尤其涉及「发布用于告知公众的信息」的文本生成款）的完整措辞**。AI Act PDF 在该次读取时返回 `URL body is empty`（间歇性），我未取得第50条全文。→ **未能验证，不做断言。**

**适用性裁定（基于已验证据的部分 + 明确标注推理）**：

- **可能适用**：若产品有一个「**与 AI 对话来改简历**」的界面（如 `AISectionChat.tsx`），这属于「AI 系统意图与自然人直接交互」→ **需要告知用户你在和 AI 交互**。这是一个**低成本、高确定性**的动作，建议直接做。
- **很可能不适用**：若 Article 50 的某款针对的是「生成**用于告知公众**的文本」（deepfake / 公共利益信息），**一份简历不是「关于公共利益的信息」**——它是私人求职文档。→ **按文本逻辑不适用。** 但**我未能读到该款全文，故此结论标为「基于标题与结构推理，条文未验证」。**
- **与本项目的关系**：AI Act 的**高风险**分类（Annex III）包含**招聘与筛选**用途——**注意：那是针对「雇主侧的 AI 筛选系统」，不是「帮候选人写简历的工具」。** 本产品处于**候选人侧**，**不在** Annex III 的高风险招聘场景内。**这一点值得明确写下来，因为很容易被误认为「简历 + AI = 高风险」。**

### 5.5 中国 AI 生成内容标识

> 两份都是一手全文，逐条核对。这是本次研究中**最直接、最容易落地**的一块。

**（a）《生成式人工智能服务管理暂行办法》**

来源：[生成式人工智能服务管理暂行办法，网信办，2023-07-13](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) — **一手，已验证**
**施行日：第24条「本办法自2023年8月15日起施行」** — 已验证

- **第2条（适用范围，关键）**：适用于「利用生成式人工智能技术**向中华人民共和国境内公众**提供生成文本、图片、音频、视频等内容的服务」。**并且**：「行业组织、企业、教育和科研机构、公共文化机构、有关专业机构等研发、应用生成式人工智能技术，**未向境内公众提供**生成式人工智能服务的，**不适用**本办法的规定。」
  - → **「面向境内公众提供」是适用性的闸门。**
- **第11条**：提供者对使用者的**输入信息和使用记录**应依法履行保护义务，**不得收集非必要个人信息**，**不得非法留存能够识别使用者身份的输入信息和使用记录**，不得非法向他人提供。→ **这条直接命中「把简历全文写进 LLM prompt 日志」。** 简历 prompt 包含姓名、电话、邮箱 → **属于可识别使用者身份的输入信息**。**若把 prompt 全量落盘做日志/调试，即构成「非法留存」风险。**
- **第12条**：提供者应按《互联网信息服务深度合成管理规定》**对图片、视频等生成内容进行标识**。
  - **⚠️ 注意：第12条只点了「图片、视频等」，没有点「文本」**。这与下面《标识办法》第4条（明确包含**文本**）形成**层级差异**——**标识文本的义务来自 2025 年的《标识办法》，不是 2023 年的暂行办法**。这是一个容易搞混的时间线。
- **第17条**：提供**具有舆论属性或者社会动员能力**的生成式AI服务的，应开展**安全评估**并按《算法推荐管理规定》履行**算法备案**。
  - **适用性裁定**：**「简历写作助手」不具有舆论属性或社会动员能力 → 不触发第17条的安全评估与算法备案。** 这是一条明确的「不适用」结论。

**（b）《人工智能生成合成内容标识办法》**

来源：[关于印发《人工智能生成合成内容标识办法》的通知，网信办，2025-03-14](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm)，国信办通字〔2025〕2号 — **一手，已验证**
**施行日：第14条「本办法自2025年9月1日起施行」** — 已验证。文件签发日 **2025年3月7日**。

- **第2条（适用范围）**：符合《互联网信息服务算法推荐管理规定》《互联网信息服务深度合成管理规定》《生成式人工智能服务管理暂行办法》规定情形的**网络信息服务提供者**（「服务提供者」）开展人工智能生成合成内容标识活动，适用本办法。
  - → **适用性依赖上游三部规章**。对简历产品，最关键的上游是《深度合成管理规定》第17条第1款（因第4条以它为触发条件）。
- **第3条（定义）**：生成合成内容 = 利用AI技术生成、合成的**文本、图片、音频、视频、虚拟场景**等信息。标识分：
  - **显式标识**：在生成合成内容或交互场景界面中添加的、以文字/声音/图形等方式呈现、**可被用户明显感知**的标识。
  - **隐式标识**：在**文件数据**中添加的、**不易被用户明显感知**的标识。
- **第4条（显式标识要求，注意含文本）**：
  - （一）**在文本的起始、末尾或者中间适当位置添加文字提示或者通用符号提示等标识**，或者在交互场景界面、文字周边添加显著的提示标识；
  - …（二）至（六）分别对应音频/图片/视频/虚拟场景/其他场景。
  - **★ 且明确规定**：「服务提供者提供生成合成内容**下载、复制、导出**等功能时，应当确保文件中含有满足要求的显式标识。」
  - → **这对本产品是直接命中**：如果 AI 生成的简历文本可以被**导出为 PDF/DOCX**，则**导出的文件里必须含有显式标识**。这是一个具体的、有明确日期的产品需求。
- **第5条（隐式标识）**：按《深度合成管理规定》第16条，在**文件元数据**中添加隐式标识，包含生成合成内容属性信息、**服务提供者名称或编码、内容编号**等制作要素信息。鼓励添加**数字水印**。
- **第6条**：**传播平台**的义务（核验元数据中的隐式标识、对疑似生成内容加提示）。→ **本产品若不提供内容传播服务，第6条不适用。**
- **第7条**：应用分发平台在上架审核时应要求说明是否提供生成合成服务。→ **若本产品做国际/国内 App 分发，需准备该说明。**
- **第9条**：用户申请**没有显式标识**的生成合成内容时，服务提供者可以在通过用户协议明确用户的标识义务和使用责任后提供，**并依法留存提供对象信息等相关日志不少于六个月**。
  - → **这是一个真实的张力点**：产品可能想「让用户拿到干净的、不带 AI 水印的简历」。第9条**允许**，**但代价是**：（1）用户协议须明确用户的标识义务；（2）**留存日志不少于 6 个月**。而**第11条（暂行办法）又禁止非法留存可识别身份的信息** —— 两条之间有张力，**需要法务厘清「哪些日志字段是合规必需的」**。**这是本报告发现的一个真实的合规冲突，值得上报。**

**适用性裁定（诚实版）**：

- **判定链是**：本产品是否「向境内公众提供生成式AI服务」？若是（用户在网页上与 AI 交互生成简历文本），则 → 暂行办法第2条适用；标识办法第2条适用（经上游规章）。
- **因此：第4条（一）与第4条末句（导出文件须含显式标识）很可能适用。**
- **但**：**我未能验证《深度合成管理规定》第17条第1款的精确情形与范围**（未读该规定一手文本）。第4条的触发条件是「属于第17条第1款情形的」，**若简历文本生成不落入该款，第4条可能不触发**。→ **这个链条的最后一环未能验证，需要补一轮研究。**

---

## 6. 被夸大或被证伪的说法

| # | 流行说法 | 证据 | 判定 |
|---|---|---|---|
| 1 | 「WCAG 2.2 要求焦点指示 2px 周长 + 3:1 对比（AA）」 | 2.4.13 Focus Appearance 是 **AAA**；AA 的焦点要求是 2.4.7 + 2.4.11 | **证伪**（级别搞错） |
| 2 | 「ADA Title II 2024 规则要求私有 SaaS 在 2026/2027 年前合规」 | 该规则适用于 **State and local government entities**；且 DOJ 已于 2026-04-20 把日期推到 **2027-04-26 / 2028-04-26** | **双重错误**：适用主体错 + 日期过期 |
| 3 | 「ATS 自动拒掉 75% 的简历」 | **没有任何厂商文档**给出自动拒绝比例。Greenhouse/Recruiterflow/Recruit CRM 都把失败描述为「**部分解析，需人工核对**」，而非自动拒绝 | **未获证实** |
| 4 | 「ATS 要求特定章节标题词汇表（必须叫 Work Experience）」 | Greenhouse 只要求「**清晰章节 + 各章节格式一致**」，未点名任何词表 | **夸大** |
| 5 | 「PDF 比 DOCX 更容易过 ATS」 | 三家厂商文档均为**格式白名单 + 失败原因**，**无格式偏好排序** | **未获证实** |
| 6 | 「所有 ATS 都会对扫描件做 OCR」 | Recruiterflow 明确让用户**自己跑 OCR**（即它不做）；Recruit CRM 说 OCR 生成的 PDF「**supported in some cases**」仍可能失败 | **证伪** |
| 7 | 「Greenhouse 对亚洲语言支持有限」（来自 Moka 营销文） | Greenhouse **自己的帮助中心**列出 **Chinese (Simplified)、Japanese、Korean、Vietnamese** 为 full parsing | **证伪**（且是竞品营销文的偏见） |
| 8 | 「PIPL 数据出境对所有向外提供数据的公司都是重负担」 | 2024 年《促进和规范数据跨境流动规定》第5条(四)：非 CIIO 累计**不满10万人**、**不含敏感个人信息** → **免予**评估/合同/认证 | **夸大**（有实质豁免） |
| 9 | 「EU AI Act 让『简历 + AI』变成高风险系统」 | Annex III 的高风险招聘场景针对**雇主侧的筛选用途**；**候选人侧的简历写作工具不在其中** | **夸大**（主体搞错）。**注意：Annex III 具体措辞我未逐字验证，标记为推理** |
| 10 | 「用 AI 写简历触发 GDPR Art. 22 自动化决策」 | Art. 22 针对对数据主体有重大影响的**决定**；润色简历不是这样的决定 | **证伪** |
| 11 | 「EAA 一定管到任何卖到欧盟的 SaaS」 | 序言(70)：**微型企业提供的服务**不受本指令要求与义务约束 | **夸大**（有豁免） |
| 12 | 「给简历加 schema.org 结构化数据能提升曝光」 | 未找到任何消费简历标记的消费方；JobPosting 是**职位**用的 | **未获证实**（schema.org 与 Google 文档未能读取，可信度低） |
| 13 | 「有 PDF 结构树（tagged）就是无障碍 PDF」 | 我实测 EUR-Lex 的 EAA PDF：`has_structure_tree: true`、`has_mark_info: true`，**正文仍抽不出文字** | **证伪**（tag 存在 ≠ tag 正确/文本可达） |

---

## 7. 可信度总表

**图例**：✅ 已验证（读了一手来源）｜🔶 第三方（镜像/律所/摘要）｜❓ 不确定/未能验证

### 无障碍

| 结论 | 来源 | 可信度 |
|---|---|---|
| WCAG 2.2 为 W3C Recommendation，2024-12-12 | [W3C WCAG22](https://www.w3.org/TR/WCAG22/) | ✅ |
| WCAG 2.2 向后兼容 2.0/2.1 | 同上 | ✅ |
| 2.5.7 Dragging Movements = **AA**，需单指针非拖拽替代 | [Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | ✅ |
| 2.5.8 Target Size (Minimum) = **AA**，24×24 CSS px（含 5 项例外） | [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | ✅ |
| 3.2.6 Consistent Help = **A**，相同相对顺序 | [Understanding 3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html) | ✅ |
| 3.3.7 Redundant Entry = **A**，自动填充或可选；**不跨会话** | [Understanding 3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html) | ✅ |
| 3.3.8 Accessible Auth (Minimum) = **AA**，不得要求认知功能测试；允许粘贴/密码管理器是机制 | [Understanding 3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html) | ✅ |
| **2.4.13 Focus Appearance = AAA（非 AA）** | [Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html) | ✅ |
| WCAG Techniques 是 informative，**不强制** | [PDF1 technique](https://www.w3.org/WAI/WCAG22/Techniques/pdf/PDF1) | ✅ |
| W3C 的 PDF 无障碍技术以 **tagged PDF** 为前提 | 同上 | ✅ |
| EAA = Directive (EU) 2019/882，2019-04-17，OJ L 151/70 | [EUR-Lex EAA](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882) | ✅ |
| EAA 序言(70)：**微型企业提供的服务不受约束** | 同上 | ✅ |
| EAA 序言(42)/(43)：e-commerce services 在范围内 | 同上 | ✅ |
| EAA **Article 2/31 条文措辞** | — | ❓（EUR-Lex PDF 正文抽不出） |
| EAA **适用日 2025-06-28** | — | ❓ |
| EAA 微型企业阈值「10人/200万欧元」在本指令中的引注 | — | ❓ |
| **EN 301 549 版本号及与 WCAG 2.2 的映射** | — | ❓ |
| ADA Title II 规则 2024-04-24 公布，2024-06-24 生效，89 FR 31320 | [FR API 2024-07758](https://www.federalregister.gov/api/v1/documents/2024-07758.json) | ✅ |
| **ADA Title II 延期**：2026-04-20 IFR 生效，91 FR 20902；改为 **2027-04-26 / 2028-04-26** | [IFR 全文](https://www.federalregister.gov/documents/full_text/text/2026/04/20/2026-07663.txt) | ✅ |
| ADA Title II 适用主体为**州与地方政府**，非私有 SaaS | [FR 记录摘要](https://www.federalregister.gov/api/v1/documents/2024-07758.json) | ✅ |
| Title II 采用 WCAG **2.1** AA（非 2.2） | 同上（摘要/标题） | 🔶 |
| Section 508 对私有 SaaS 不直接适用；仅合同场景 | — | ❓（未读 36 CFR 1194 / §508 一手） |
| ADA Title III 无具体网络规章；暴露为个案诉讼 | — | 🔶（ada.gov 相关页 404） |
| **PDF/UA 的 ISO 编号与版本** | — | ❓（iso.org、pdfa.org 均 403） |
| Matterhorn Protocol 版本/日期 | — | ❓（403） |
| EN 301 549 是否强制 PDF/UA | — | ❓ |
| 实测：EUR-Lex EAA PDF 有结构树但正文无文字层 | `pdf-reader inspect/read` on `CELEX:32019L0882` | ✅（我的直接观察） |
| 本项目 2.1.1/2.5.7 违反（拖拽把手无键盘支持） | [ResumeEditor.a11y.test.tsx](src/components/ResumeEditor.a11y.test.tsx) | ✅ |
| 本项目 `lang` 硬编码 `zh-CN`（3.1.1 风险） | [layout.tsx:25](src/app/layout.tsx#L25) | ✅ |
| 本项目 `Chip sm` = `h-5`（20px，低于 24px） | [Chip.tsx:55](src/components/ui/Chip.tsx#L55) | ✅ |

### 招聘系统行为

| 结论 | 来源 | 可信度 |
|---|---|---|
| Greenhouse 列出 10 类解析失败原因，含表格/页眉页脚/文本框/分栏/图片型 PDF；>2.5MB 失败 | [Greenhouse: Unsuccessful resume parse](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse) | ✅ |
| Greenhouse full parsing 支持 **Simplified Chinese**，**未列 Traditional Chinese** | [Greenhouse: 非英语解析](https://support.greenhouse.io/hc/en-us/articles/205019689-Resume-parsing-with-non-English-languages) | ✅ |
| Recruiterflow 支持 DOC/DOCX/PDF/RTF/TXT/ODT/HTM/HTML/DOCM/DOTM/DOT/DOTX；**图片型 PDF 与无文字层 PDF 不能解析**；**不做 OCR**；密码保护文件不能解析 | [Recruiterflow](https://help.recruiterflow.com/en/articles/7996760-my-resumes-are-not-being-parsed) | ✅ |
| Recruiterflow 语言分级：full（含简中/日/韩）vs basic（uk/ bg） | 同上 | ✅ |
| Recruit CRM 仅支持 DOC/DOCX/PDF；嵌入图片与 OCR 生成 PDF 可能失败 | [Recruit CRM](https://help.recruitcrm.io/en/articles/3639421-parsing-failed) | ✅ |
| **Workday / Lever / iCIMS / SmartRecruiters / Taleo 无公开的解析行为文档** | 检索未命中厂商文档 | ✅（作为「未找到」这个事实） |
| SAP SuccessFactors 有 *Working with Resume Parsing* 文档页，**内容未读** | SAP Help Portal | ❓ |
| **无任何厂商文档给出格式偏好（PDF vs DOCX）** | 三家已读文档 | ✅（作为「未找到」） |
| **无任何厂商文档给出章节标题词表** | 同上 | ✅（作为「未找到」） |
| Moka 营销文自称 97% 解析精度、支持 CJK | [MokaHR 博客](https://www.mokahr.io/myblog/how-to-master-resume-parsing/) | ❓（营销内容，无独立验证） |
| Moka 称 Greenhouse 亚洲语言支持有限 | 同上 | ✅（**证伪**：与 Greenhouse 自身文档矛盾） |
| 智联/BOSS/前程无忧/北森 **无公开解析格式文档** | 检索仅命中第三方技巧文 | ✅（作为「未找到」） |
| Google JobPosting 文档存在但面向**职位发布** | developers.google.com（**未能 fetch**） | ❓ |
| schema.org 是否存在 `Resume` 类型 | schema.org（**未能 fetch**） | ❓ |
| **未找到任何消费简历结构化数据的消费方** | 检索 + 结构推理 | ❓（低可信度） |
| Google「移除个人信息」官方文档存在 | developers.google.com（**未能 fetch**） | ❓ |

### 标准与证书

| 结论 | 来源 | 可信度 |
|---|---|---|
| **W3C VC Data Model 2.0 = W3C Recommendation，2025-05-15** | [VC 2.0](https://www.w3.org/TR/vc-data-model-2.0/) | ✅ |
| **Open Badges 3.0 = 1EdTech Final Release**，文档版本 1.4.5，签发 **2026-06-29**；Assertion **即 VC**（对齐 VC 2.0） | [1EdTech OB 3.0](https://www.imsglobal.org/spec/ob/v3p0/) | ✅ |
| Open Badges 3.0 的 IPR 承诺组织包含 **Workday, Inc.**（2022-06-10） | 同上 | ✅ |
| 招聘侧对 VC/Open Badges 的**生产消费**证据 | — | ❓（未找到） |
| JSON Resume 自称 community-driven、MIT、**version 1.0.0** | [JSON Resume schema](https://jsonresume.org/schema/) | ✅（自述） |
| JSON Resume schema 仓库**已迁移**至 `jsonresume/jsonresume.org`，npm 包名不变 | [GitHub jsonresume/resume-schema](https://github.com/jsonresume/resume-schema)（页面标题即迁移公告；**内容未能 fetch**） | 🔶 |
| JSON Resume 的**招聘侧采用度** | — | ❓ |
| **HR Open Standards 活跃**：**4.5 候选版发布 2025-05-09** | [HR Open 4.5RCI](https://www.hropenstandards.org/news/standards-candidate-release---45rci-) | ✅ |
| **HR Open LER-RS V2 仍在开发中**（candidate spec + open API，为 HRIS 厂商提供插件） | [HR Open LER-RS](https://www.hropenstandards.org/ler-rs) | ✅ |
| ESCO：**当前版本 v1.2.1（最后更新 2025-12-10）**，Release v6.0.0；**3,039 个职业 + 13,939 项技能**；**28 种语言**（全部 EU 官方语言 + 冰岛语、挪威语、乌克兰语、**阿拉伯语**） | [ESCO: What is ESCO](https://esco.ec.europa.eu/en/about-esco/what-esco) | ✅ |
| **ESCO 不含中文**（28 种语言中无中文） | 同上 | ✅ |
| ESCO 首个完整版 v1 发布于 2017-07-28 | 同上 | ✅ |
| Europass / European Learning Model 的互操作格式现状 | — | ❓ |
| W3C/Credential Engine 等 skills taxonomy 的采用度 | — | ❓ |

### 法律与隐私

| 结论 | 来源 | 可信度 |
|---|---|---|
| PIPL 施行日 **2021-11-01**（第74条） | [PIPL 全文, npc.gov.cn](http://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html) | ✅ |
| PIPL 第4条：个人信息定义；处理含收集/存储/使用/加工/传输/提供/公开/删除 | 同上 | ✅ |
| PIPL 第13条：七项合法性基础 | 同上 | ✅ |
| PIPL 第14条：同意须充分知情、自愿、明确 | 同上 | ✅ |
| PIPL 第15条：可撤回同意，须提供便捷撤回方式 | 同上 | ✅ |
| **PIPL 第17条：须告知处理目的/方式/种类/**保存期限**/权利行使方式** | 同上 | ✅ |
| PIPL 第19条：保存期限为必要最短时间 | 同上 | ✅ |
| PIPL 第21条：委托处理须约定+监督 | 同上 | ✅ |
| **PIPL 第23条：向其他处理者提供须告知接收方 + 单独同意** | 同上 | ✅ |
| PIPL 第24条：自动化决策透明度/公平/可拒绝仅自动化决定 | 同上 | ✅ |
| **PIPL 第28条：敏感个人信息列举（含「特定身份」，**未点名「政治面貌」**）** | 同上 | ✅ |
| PIPL 第29条：敏感个人信息须**单独同意** | 同上 | ✅ |
| **PIPL 第47条具体款项措辞** | — | 🔶（抓取被裁剪） |
| **PIPL 第55/56条 PIPIA 触发情形措辞** | — | 🔶 |
| **《促进和规范数据跨境流动规定》2024-03-22 公布并施行** | [CAC 全文](https://www.cac.gov.cn/2024-03/22/c_1712776611775634.htm) | ✅ |
| 第5条(四)：非 CIIO 累计**不满10万人**（不含敏感）→ **免予**评估/合同/认证 | 同上 | ✅ |
| 第5条(一)：为**订立/履行合同**确需出境 → 免予 | 同上 | ✅ |
| 第7条：CIIO，或重要数据，或 ≥100万人 / ≥1万人敏感 → **须申报安全评估** | 同上 | ✅ |
| 第8条：非 CIIO，10万~100万人（不含敏感）或 **不满1万人敏感** → 须**标准合同或认证** | 同上 | ✅ |
| **第10条：出境仍须告知 + 单独同意 + PIPIA**（豁免机制 != 豁免义务） | 同上 | ✅ |
| 《生成式AI暂行办法》施行日 **2023-08-15**（第24条） | [CAC 全文](https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm) | ✅ |
| 第2条：适用「**向境内公众提供**」；**未向境内公众提供的不适用** | 同上 | ✅ |
| **第11条：不得非法留存可识别使用者身份的输入信息与使用记录** | 同上 | ✅ |
| 第12条：按深度合成规定对**图片、视频等**生成内容标识（**未点文本**） | 同上 | ✅ |
| 第17条：具舆论属性/社会动员能力者须安全评估+算法备案 | 同上 | ✅ |
| **《人工智能生成合成内容标识办法》施行日 2025-09-01**（第14条）；签发 2025-03-07 | [CAC 全文](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm) | ✅ |
| 第3条：显式标识 / 隐式标识定义；生成合成内容含**文本** | 同上 | ✅ |
| **第4条(一)：文本须在起末或中间加文字/符号提示** | 同上 | ✅ |
| **第4条末句：提供下载/复制/导出功能时，文件中须含满足要求的显式标识** | 同上 | ✅ |
| 第5条：文件元数据加隐式标识（属性、提供者名称/编码、内容编号） | 同上 | ✅ |
| 第6条：传播平台义务（本产品若非传播平台则不适用） | 同上 | ✅ |
| **第9条：可提供无显式标识内容，但须用户协议明确 + 留存日志 ≥6个月** | 同上 | ✅ |
| 《深度合成管理规定》**第17条第1款**的精确情形（标识办法第4条的触发条件） | — | ❓ |
| GDPR Art. 9(1) 特殊类别列举 | [gdpr-info.eu Art.9](https://gdpr-info.eu/art-9-gdpr/) | 🔶（镜像，非 EUR-Lex） |
| GDPR Art. 17 / 20 / 22 / 28 / 13 / 14 正文 | gdpr-info.eu（页面被截断） | 🔶 / ❓ |
| Art. 17 是否延伸到**备份** | — | ❓ |
| EU-US DPF 2026 年有效性 | — | ❓ |
| **EU AI Act Article 50 标题与章节位置** | [AI Act PDF p.82](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32024R1689) | ✅ |
| AI Act Art. 50(1) 起始（与自然人直接交互的 AI 须告知） | 同上 | ✅（部分） |
| **AI Act 适用日 2026-08-02；Ch. I/II 自 2025-02-02** | 同上（Recital 179, Art. 113） | ✅ |
| **AI Act Article 50 各款完整措辞** | — | ❓ |
| AI Act **Annex III** 高风险招聘场景的具体措辞 | — | ❓ |

### 本项目代码（我直接读取）

| 结论 | 证据 | 可信度 |
|---|---|---|
| 章节排序仅拖拽，无键盘替代 → 违反 2.1.1 + 2.5.7 | [ResumeEditor.a11y.test.tsx](src/components/ResumeEditor.a11y.test.tsx) | ✅ |
| `framer-motion` `Reorder.Item` 无键盘支持 | 同上（测试直接读依赖源码） | ✅ |
| `<html lang="zh-CN">` 硬编码 | [layout.tsx:25](src/app/layout.tsx#L25) | ✅ |
| `Chip sm` = `h-5`（20px） | [Chip.tsx:55](src/components/ui/Chip.tsx#L55) | ✅ |
| `Button sm` = `h-8`（32px，达标） | [Button.tsx:71](src/components/ui/Button.tsx#L71) | ✅ |
| 登录/注册用 6 位验证码（3.3.8 风险，但存在密码登录替代） | [login/page.tsx:175](src/app/login/page.tsx#L175) | ✅ |
| 验证码输入未拦截粘贴（`preventDefault` 不在验证码输入上） | grep 结果 | ✅（但**无测试钉住**，脆弱） |
| 解析友好度判据已与 Greenhouse 文档一致（单栏/无表格/联系方式在正文/无装饰图标/无证件照） | [resume-parseability.ts](src/lib/resume-parseability.ts) | ✅ |
| 已有断言 PDF 文字层可抽取且无 `�` | [AGENTS.md](AGENTS.md)、[export-pdf.tsx](src/lib/export-pdf.tsx) | ✅ |

---

## 附：给路线图的 5 条最可操作结论

1. **先确认适用性，再谈合规。** EAA 对**微型企业服务**有豁免（序言 70），ADA Title II 只约束**州与地方政府**。在写「必须满足 WCAG 2.2 AA」之前，先确定**运营者规模**与**是否向欧盟消费者销售**。否则会把大量工程投入到一个不适用于自己的义务上。
2. **两个今天就在的缺陷值得优先修**：拖拽排序无键盘替代（2.1.1 + 2.5.7，**已被 `it.fails` 钉住**）与 `lang` 硬编码 `zh-CN`（3.1.1，微秒级修复）。这是**唯一两处我已确认的当前违规**。
3. **PDF 的「文本可达」与「语义正确」是两件事。** 项目已经断言了前者（文字层可抽取、无 `�`），缺的是后者（阅读顺序、标题层级、表格语义、图片 alt、文档语言）。我实测 EUR-Lex 的 EAA PDF **有结构树却抽不出正文**——这就是「有 tag ≠ 无障碍」的活证据。
4. **中国 AI 标识有明确的、有日期的产品需求**：《标识办法》第4条末句要求**提供导出功能时文件中须含显式标识**，施行日 **2025-09-01（已生效）**。同时第9条给出「提供无标识内容」的合法路径，**代价是留存日志 ≥6 个月**——这与《暂行办法》第11条「不得非法留存可识别身份信息」存在张力，**需要法务厘清，值得上报**。
5. **发给 LLM 的披露义务是真实且可落地的**：PIPL 第23条（提供→告知+单独同意）与第21条（委托→合同+监督）的定性决定做法，建议**按更严格一侧设计**；GDPR 侧需要 DPA。另需注意 **《暂行办法》第11条禁止把含姓名/电话的 prompt 全量落盘**——若当前有 prompt 日志，这是一个具体的代码风险。

### 需要补一轮研究的三处（我明确没能验证）

- **EAA Article 2 / 31 的条文措辞与 2025-06-28 适用日**、EN 301 549 的版本与映射（EUR-Lex 正文抽取失败）。
- **《深度合成管理规定》第17条第1款**——它是《标识办法》第4条的触发条件，缺它则「简历文本是否需要显式标识」的链条不闭合。
- **PDF/UA 的 ISO 编号版本与 Matterhorn Protocol**（iso.org / pdfa.org 均 403）。
