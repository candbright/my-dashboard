/**
 * The 12 starter documents, as Markdown bodies (ticket 20).
 *
 * # Where these came from
 *
 * They began as the `markdown` fields of the old `RESUME_TEMPLATES` entries, moved mechanically by
 * `scripts/extract-template-seeds.mjs` rather than retyped, and have since been **expanded by hand
 * into full one-page sample resumes**: quantified bullets, coherent reverse-chronological
 * timelines, and invented-but-plausible company names. The extraction proved too thin to be a
 * useful starting point in the create flow's 「案例参考」 step, which is what these bodies feed.
 *
 * This file holds the only copy of the prose, and a hand-edit that dropped a bullet would produce
 * valid TypeScript and valid Markdown — nothing would fail, the sample resume would just be
 * quietly poorer. The shape every body follows is the one `resume-parser.ts` reads:
 *
 *   - `##` names a section (关于我 / 工作经历 / 实习经历 / 项目经历 / 科研项目 / 教育背景 / 技能);
 *   - `### 职位 | 公司` names an item, with the first pipe separating title from subtitle;
 *   - a date goes on its own italic line and must carry a year **and** a month
 *     (`*2022年3月 - 至今*`); a bare `*2024年*` is not a date and would fall into the section's
 *     prose;
 *   - skills (and any other chip group) are one `- chip` line each, never a comma list.
 *     A qualifier stays inside the chip (`Excel（高级）`); `/` is not a chip separator, so
 *     `CI/CD` is one chip.
 *
 * # Why they carry no YAML frontmatter
 *
 * ADR-0003 moved candidate metadata out of the document and into database columns, so a body must
 * not carry a `---` block. The old seeds all did, and the extractor stripped it. Two consequences
 * worth knowing:
 *
 *   - The metadata those blocks held (`name`, `title`, `email`, `phone`, `location`, `github`,
 *     `website`, `linkedin`) is **not** lost from the product — it is exactly what
 *     `METADATA_FIELDS` covers and what the metadata panel edits. A user starting from a starter
 *     gets an empty metadata form rather than pre-filled sample contact details, which is the
 *     better default anyway: pre-filled fake contact details are a thing people forget to replace.
 *   - Note the old key `title` maps to the `job_title` column (`COLUMN_TO_FRONTMATTER_KEY` in
 *     `resume-parser.ts`), so nothing about that mapping is implied by these bodies.
 *
 * `blank` is the exception in spirit: it is placeholder scaffolding ("在此编写个人简介..."), which
 * is why `ResumeBuilderPage` used it for the "start blank" path too. That duplicate constant is
 * gone — see `BLANK_SEED_ID`.
 */

/** One starter document. `body` is Markdown with no frontmatter. */
export interface ResumeSeed {
  id: string;
  name: string;
  body: string;
}

/**
 * The seed id used for "start from scratch".
 *
 * Named because two call sites need to agree on it: the starter gallery's blank card and the
 * builder's "start blank" button. Before ticket 20 the same document was written out twice — once
 * as the `blank` template's `markdown` and once as `EMPTY_RESUME_MARKDOWN` in
 * `ResumeBuilderPage` — and the two copies were byte-identical, so they would have drifted
 * silently. Being able to name it is the fix; the constant is the evidence it was needed.
 */
export const BLANK_SEED_ID = 'blank';

/** All starter documents, in the order the gallery shows them. */
export const RESUME_SEEDS: readonly ResumeSeed[] = [
  {
    id: 'blank',
    name: '空白模板',
    body: `## 关于我
在此编写个人简介...

## 工作经历
### 职位名称 | 公司名称
*开始时间 - 结束时间*
- 工作描述

## 教育背景
### 学历 专业 | 学校名称
*开始年份 - 结束年份*
- 相关描述

## 技能
- 技能1
- 技能2
- 技能3`,
  },
  {
    id: 'general-standard',
    name: '标准简历',
    body: `## 关于我
3 年行政运营与综合管理经验，服务过 300 人规模的集团总部，擅长流程优化、跨部门协调与数据化管理。主导行政数字化改造项目，将平均审批时长从 2.3 天压缩至 0.8 天，年度行政采购成本降低 18%。

## 工作经历
### 行政运营专员 | 明远控股集团有限公司
*2022年6月 - 至今*
- 统筹集团总部 300 人的办公运营与 800 万元年度行政预算，通过供应商整合谈判将采购成本降低 18%
- 主导会议室、用车、差旅三套预订系统上线，员工单次预订平均耗时从 15 分钟降至 3 分钟
- 编写行政 SOP 手册 42 份，将新员工入职办理时长从 2 天压缩至 0.5 天
- 牵头组织年会、运动会等大型活动 6 场，累计参与 2000 余人次，满意度评分 4.7/5.0

### 运营实习生 | 博雅文化传播有限公司
*2021年7月 - 2022年5月*
- 协助运营 3 个企业微信公众号，独立产出推文 60 余篇，平均阅读量提升 45%
- 搭建活动数据看板，跟踪 20 场线下活动的报名与转化漏斗
- 整理 30 余家供应商报价并参与比价，协助完成年度框架合同签订

## 项目经历
### 行政数字化改造项目 | 明远控股集团
*2023年3月 - 2023年12月*
- 梳理 15 项行政审批流程并推动线上化，平均审批时长从 2.3 天缩短至 0.8 天
- 编写系统操作手册并培训 8 个部门的对接人，系统上线首月线下工单量下降 35%

## 教育背景
### 本科 工商管理 | 湖南大学
*2018年9月 - 2022年6月*
- GPA 3.5/4.0，获校级二等奖学金 2 次
- 担任校学生会办公室负责人，组织校级活动 10 余场

## 技能
- Office办公套件
- Excel（数据透视表）
- Visio
- 飞书多维表格
- 公文写作
- 数据分析
- 项目管理（PMP）
- 英语（CET-6）
- 普通话一级乙等`,
  },
  {
    id: 'tech-fullstack',
    name: '全栈工程师',
    body: `## 关于我
5 年全栈开发经验，主导过 3 个十万级用户 SaaS 产品的架构设计与落地。精通 React/Next.js 与 Go 技术栈，曾将核心链路接口 P99 延迟从 800ms 降至 120ms；关注工程化与开源，GitHub 累计获得 3000+ Star。

## 工作经历
### 高级全栈工程师 | 云杉科技（上海）有限公司
*2022年3月 - 至今*
- 主导核心 SaaS 产品「云杉协同」的前后端架构设计，服务 2000 余家企业客户、12 万日活用户
- 重构 React + TypeScript 前端架构，通过路由级代码分割将首屏加载时间从 3.2 秒降至 1.1 秒
- 设计基于 Go 的微服务架构并优化核心链路，接口 P99 延迟从 800ms 降至 120ms，单集群 QPS 从 500 提升至 5000
- 搭建 GitLab CI/CD 流水线，发布频率从每周 1 次提升至每日 3 次，异常回滚控制在 5 分钟内
- 带领 4 人小组完成 20 余个版本迭代，保持代码评审 100% 覆盖

### 前端开发工程师 | 星桥网络科技有限公司
*2020年7月 - 2022年2月*
- 负责跨境电商平台前端开发，支撑日均 PV 50 万、大促峰值 PV 300 万
- 建设内部组件库「星桥 UI」，沉淀 40 余个通用组件，业务页面开发效率提升 35%
- 优化 Webpack 构建配置与依赖结构，产物构建时间从 8 分钟降至 4.4 分钟
- 接入 Sentry 前端监控并建立告警机制，线上 JS 错误率下降 70%

## 项目经历
### ResumeVault 简历平台 | 个人项目
*2024年1月 - 至今*
- 基于 Next.js + Go（Kratos）的简历管理平台，支持 AI 解析润色与多模板 PDF 导出
- 实现服务端 Markdown 结构化解析，覆盖 6 类章节、8 种技能分隔符与多种日期写法
- 上线 6 个月积累注册用户 4000 余人，周活跃率 28%

### Flowboard 开源组件库 | 核心贡献者
*2023年3月 - 2023年12月*
- 基于 React 的企业级 UI 组件库，GitHub 2100+ Star、周下载量 1.2 万次
- 设计主题定制与国际化方案，支持 12 种语言
- 补齐单元测试与文档站点，测试覆盖率从 55% 提升至 92%

## 教育背景
### 本科 计算机科学与技术 | 上海交通大学
*2016年9月 - 2020年6月*
- GPA 3.8/4.0，专业排名前 5%
- 获 ACM-ICPC 亚洲区域赛银牌

## 技能
- TypeScript
- JavaScript
- Go
- Python
- SQL
- React
- Next.js
- Vue3
- Node.js
- TailwindCSS
- PostgreSQL
- Redis
- MongoDB
- Kafka
- Docker
- Kubernetes
- Git
- CI/CD
- Linux
- AWS
- 阿里云`,
  },
  {
    id: 'tech-backend',
    name: '后端工程师',
    body: `## 关于我
6 年后端开发经验，专注高并发交易系统与分布式架构，主导过日均 100 万订单的核心交易系统设计，将核心接口 P99 延迟从 200ms 降至 30ms。熟悉微服务治理、消息队列与多级缓存，连续 3 年大促保障零故障。

## 工作经历
### 资深后端工程师 | 凌霄信息技术有限公司
*2021年4月 - 至今*
- 负责核心交易系统的设计与开发，支撑日均订单 100 万+、大促峰值 800 万单
- 主导单体应用向 Go 微服务架构拆分，落地 12 个服务，模块耦合度下降 70%，独立部署周期从 2 周缩短至 2 天
- 重构数据库索引并设计 Redis 多级缓存策略，核心接口 P99 延迟从 200ms 降至 30ms
- 设计基于 Kafka 的异步对账系统，日终对账耗时从 4 小时降至 25 分钟
- 主持技术方案评审 30 余场，结对指导 5 名初级工程师

### 后端开发工程师 | 蜂鸟网络科技有限公司
*2018年7月 - 2021年3月*
- 参与电商平台后端开发，服务千万级注册用户，负责订单与库存两个核心域
- 重构订单查询链路并引入 CQRS 模式，订单列表查询性能提升 5 倍
- 搭建统一日志与监控平台（ELK + Prometheus），故障平均发现时间从 30 分钟缩短至 5 分钟
- 设计基于分布式锁的库存扣减方案，大促期间超卖事故降为零

## 项目经历
### goretry 分布式重试组件 | 开源项目
*2022年6月 - 2023年12月*
- 实现支持指数退避、抖动与熔断策略的 Go 重试组件，GitHub 收获 800+ Star
- 推动组件被 3 家公司的内部项目接入，单元测试覆盖率保持 95%

## 教育背景
### 硕士 软件工程 | 华中科技大学
*2016年9月 - 2018年6月*
- 研究方向：分布式系统，发表核心期刊论文 1 篇

### 本科 计算机科学与技术 | 武汉大学
*2012年9月 - 2016年6月*
- GPA 3.7/4.0，获校级优秀毕业生

## 技能
- Go
- Java
- Python
- C++
- MySQL
- PostgreSQL
- Redis
- MongoDB
- Elasticsearch
- Kafka
- RabbitMQ
- gRPC
- RESTful API
- Docker
- Kubernetes
- Prometheus
- Grafana
- 微服务架构
- 分布式系统
- 高并发设计`,
  },
  {
    id: 'tech-frontend',
    name: '前端工程师',
    body: `## 关于我
4 年前端开发经验，专注用户体验、性能优化与设计系统建设。主导统一 3 条产品线的设计规范，推动 Next.js SSR 落地使 SEO 自然流量提升 150%；具备跨端开发经验与 5 人团队管理能力。

## 工作经历
### 前端技术负责人 | 琥珀互动科技有限公司
*2022年5月 - 至今*
- 负责 5 人前端团队的技术选型与架构设计，建立代码评审与灰度发布机制
- 主导设计系统「琥珀 UI」建设，统一 3 条产品线的组件规范，设计还原类缺陷下降 80%
- 推动官网与主站迁移至 Next.js SSR，首屏 LCP 从 4.1 秒降至 1.8 秒，SEO 自然流量提升 150%
- 搭建覆盖性能、错误与埋点的前端监控体系，线上问题主动发现率从 40% 提升至 90%

### 前端开发工程师 | 青梧科技有限公司
*2020年7月 - 2022年4月*
- 独立负责内容社区 C 端前端开发，覆盖 Web 与 H5 两端，服务日活用户 8 万+
- 实现运营数据可视化大屏，基于 D3.js 与 Canvas 渲染 10 万级数据点，帧率稳定 55fps
- 优化图片懒加载、路由预取与缓存策略，Lighthouse 性能评分从 45 提升至 92
- 封装业务组件 20 余个，活动页面上线周期从 5 天缩短至 2 天

## 项目经历
### Tiga 移动端组件库 | 团队项目
*2021年3月 - 2022年1月*
- 基于 Vue 3 的移动端组件库，支撑公司 4 条业务线，沉淀组件 35 个
- 编写交互文档与在线示例站点，新项目接入耗时从 3 天降至 0.5 天

## 教育背景
### 本科 数字媒体技术 | 浙江大学
*2016年9月 - 2020年6月*
- 获校级优秀毕业设计，辅修视觉传达方向课程

## 技能
- TypeScript
- JavaScript
- HTML5
- CSS3
- React
- Next.js
- Vue3
- TailwindCSS
- Sass
- Webpack
- Vite
- Turbopack
- pnpm
- Node.js
- GraphQL
- RESTful API
- Figma
- 响应式设计
- Web无障碍`,
  },
  {
    id: 'biz-finance',
    name: '金融分析师',
    body: `## 关于我
3 年证券研究与投资分析经验，覆盖消费行业 15 余家上市公司，撰写深度研究报告 30 余篇。擅长 DCF 与可比估值建模，2023 年推荐组合平均收益率 25%、跑赢沪深 300 指数 18 个百分点；持有 CFA 二级证书。

## 工作经历
### 高级分析师 | 景泰证券研究所
*2022年8月 - 至今*
- 覆盖食品饮料与家电行业 15 余家上市公司，撰写深度研究报告 30 余篇，5 篇获机构投资者评选提名
- 建立并维护 20 余套 DCF 与可比公司估值模型，2023 年度推荐标的组合平均收益率 25%
- 参与 3 个 IPO 项目的行业分析与尽职调查，合计募资规模 45 亿元
- 面向公募与保险资管客户路演 80 余场，服务机构客户 50 余家

### 初级分析师 | 弘桥资本（投资银行部）
*2021年7月 - 2022年7月*
- 协助完成 5 个并购项目的财务尽职调查与估值分析，交易规模合计 32 亿元
- 制作投资备忘录与客户演示材料 40 余份，支持 2 个项目成功交割
- 搭建消费品行业数据库，持续跟踪 200 余项月度经营指标

## 教育背景
### 硕士 金融学 | 清华大学五道口金融学院
*2019年9月 - 2021年6月*
- GPA 3.9/4.0，获校级优秀毕业生

### 本科 经济学 | 中国人民大学
*2015年9月 - 2019年6月*
- 获国家奖学金，专业排名前 3%

## 技能
- 财务建模
- DCF估值
- 可比公司分析
- LBO建模
- Excel（高级）
- Python
- SQL
- Wind
- Bloomberg
- CFA二级
- 证券从业资格
- 英语（雅思7.5）`,
  },
  {
    id: 'biz-product',
    name: '产品经理',
    body: `## 关于我
5 年互联网产品经验，主导过 500 万 DAU 产品的增长策略与会员体系设计，付费转化率提升 35%。擅长用户研究与数据驱动决策，兼具 C 端增长与 B 端工具产品经验，既能从 0 到 1 冷启动，也能做规模化增长。

## 工作经历
### 高级产品经理 | 蜂巢互动网络科技有限公司
*2022年3月 - 至今*
- 负责内容社区核心产品线规划，DAU 从 200 万增长至 500 万，次月留存率提升 12 个百分点
- 主导会员体系与付费权益设计，付费转化率提升 35%，年付费收入增长 4000 万元
- 搭建 A/B 实验平台并建立实验规范，月均运行实验 30 余个，需求决策周期缩短 50%
- 管理 3 名产品经理，建立需求评审与优先级机制，版本按期交付率从 70% 提升至 95%

### 产品经理 | 跃迁科技有限公司
*2020年7月 - 2022年2月*
- 主导社交电商小程序从 0 到 1 落地，上线 3 个月注册用户突破 100 万
- 设计裂变拉新与补贴策略，单个新客获取成本从 25 元降至 10 元
- 协同技术团队保持双周迭代节奏，全年交付 24 个版本，需求变更率控制在 10% 以内

## 项目经历
### 商家经营分析工具 | 内部孵化项目
*2021年3月 - 2021年12月*
- 面向平台 2 万商家设计数据看板产品，月活跃商家达 6500 家
- 定义 12 个核心经营指标与异常预警机制，商家次月留存率提升 20%

## 教育背景
### 硕士 信息管理 | 北京大学
*2018年9月 - 2020年6月*
- 研究方向：用户行为分析

### 本科 工商管理 | 南开大学
*2014年9月 - 2018年6月*
- 获校级一等奖学金，全国大学生电子商务竞赛二等奖

## 技能
- 产品规划
- 需求分析
- 用户研究
- 竞品分析
- Axure
- Figma
- SQL
- Python（数据分析）
- 神策数据
- GrowingIO
- AB测试
- Jira
- 飞书
- 墨刀`,
  },
  {
    id: 'creative-ux',
    name: 'UX 设计师',
    body: `## 关于我
4 年用户体验设计经验，覆盖用户研究、信息架构、交互与视觉落地全流程。主导过 200+ 组件的企业级设计系统建设，通过 12 轮可用性测试将核心流程转化率提升 40%；作品曾获红点设计奖提名，习惯用数据验证设计方案。

## 工作经历
### 高级 UX 设计师 | 澜图科技有限公司
*2022年4月 - 至今*
- 负责企业级协同 SaaS 产品的整体体验设计，服务 3000 余家企业客户
- 主导设计系统建设，沉淀 200 余个组件与完整规范文档，设计开发协作效率提升 45%
- 组织 12 轮可用性测试与 60 余次用户访谈，优化核心创建流程，转化率提升 40%
- 建立设计验收机制，线上界面与设计稿的还原度从 75% 提升至 98%

### UI/UX 设计师 | 拾光设计工作室
*2020年6月 - 2022年3月*
- 服务 10 余家客户的品牌与产品设计，交付 3 个移动端 App 的完整设计方案
- 独立完成需求梳理、高保真原型与动效设计，方案一次通过率 85%
- 搭建工作室组件库与交付模板，项目平均交付周期缩短 30%

## 项目经历
### 智慧办公平台 | 体验设计
*2023年1月 - 2023年10月*
- 面向 500 人规模企业的协同办公产品，完成信息架构、交互流程与视觉设计全流程
- 通过卡片分类法重构导航结构，功能平均查找耗时从 45 秒降至 12 秒
- 上线后 NPS 从 22 提升至 48，用户满意度评分 4.6/5.0

### 银行 App 适老化改造 | 设计咨询
*2022年3月 - 2022年9月*
- 针对 60 岁以上用户完成 40 余个页面的适老化改造，核心任务完成率提升 55%
- 输出适老化设计规范 28 条，被客户纳入产品设计标准

## 教育背景
### 本科 视觉传达设计 | 中国美术学院
*2016年9月 - 2020年6月*
- 获校级优秀毕业设计，全国大学生设计大赛银奖

## 技能
- Figma
- Sketch
- Adobe XD
- Photoshop
- Illustrator
- 用户研究
- 可用性测试
- 信息架构
- 交互设计
- 高保真原型
- 动效设计
- Principle
- AfterEffects
- 设计系统
- 设计规范
- 组件化设计
- HTML与CSS基础
- 前端协作`,
  },
  {
    id: 'legal-lawyer',
    name: '执业律师',
    body: `## 关于我
8 年法律执业经验，专注公司法、合同法与知识产权领域，累计代理诉讼案件 100 余件、胜诉率 85%，代理知识产权案件累计为客户争取赔偿超 3000 万元。现为瑞衡律师事务所合伙人，担任 12 家上市公司常年法律顾问。

## 工作经历
### 合伙人 | 瑞衡律师事务所（北京）
*2022年1月 - 至今*
- 管理 8 人律师团队，团队年创收 500 万元以上，常年客户续约率 90%
- 担任 12 家上市公司常年法律顾问，年均出具法律意见书 60 余份
- 代理某科技企业商标侵权系列案件并全部胜诉，累计为客户争取赔偿 3000 余万元
- 牵头 3 起企业并购的法律尽调与交易文件起草，交易金额合计 18 亿元

### 主办律师 | 昭明律师事务所（北京）
*2018年7月 - 2021年12月*
- 独立代理民商事诉讼案件 80 余件，胜诉率 82%，涉案标的总额 6.5 亿元
- 起草与审核各类合同 500 余份，建立公司合同模板库 40 套
- 服务 15 家创业公司的股权架构设计与融资法律事务，协助客户完成融资 3.2 亿元

### 实习律师 | 天澜律师事务所
*2017年7月 - 2018年6月*
- 协助合伙人完成 2 起跨境并购交易的文件起草与翻译
- 参与尽职调查并撰写尽调报告 10 余份，完成判例检索 200 余件

## 教育背景
### 硕士 法学（知识产权法方向） | 中国政法大学
*2015年9月 - 2017年6月*
- 获优秀毕业论文，研究生学业一等奖学金

### 本科 法学 | 中国政法大学
*2011年9月 - 2015年6月*
- 获国家奖学金，全国高校模拟法庭大赛一等奖

## 技能
- 民商事诉讼
- 合同法
- 公司法
- 知识产权法
- 法律尽调
- 合规审查
- 法律文书起草
- 商事仲裁
- 调解
- 商务谈判
- 北大法宝
- 威科先行
- Westlaw
- 法律职业资格证（A证）
- 法律英语（流利）`,
  },
  {
    id: 'legal-graduate',
    name: '法学应届生',
    body: `## 关于我
中国政法大学民商法学硕士（2026 届），已通过国家统一法律职业资格考试（A 证）。拥有一年知名律所与基层法院的实习经历，独立撰写法律意见书 5 份；以第一作者发表核心期刊论文 1 篇，具备扎实的法律检索与文书写作能力。

## 实习经历
### 实习生 | 昭明律师事务所（北京）
*2024年7月 - 2025年1月*
- 参与 3 起标的额超亿元的商事仲裁案件，负责案卷整理、判例检索与证据清单编制
- 独立撰写法律意见书 5 份、法律备忘录 8 份，其中 2 份被合伙人直接采用
- 协助完成某上市公司合规审查项目，梳理合规风险点 60 余项

### 法律助理（实习） | 某区人民法院
*2024年1月 - 2024年6月*
- 协助法官审理民商事案件 30 余件，整理庭审笔录与证据材料
- 撰写裁判文书初稿 12 份，内容采纳率约 75%
- 参与庭前调解 20 余次，协助促成当事人和解 8 件

## 教育背景
### 硕士 民商法学 | 中国政法大学
*2023年9月 - 2026年6月*
- GPA 3.85/4.0，以第一作者发表核心期刊论文 1 篇
- 获校级学术论坛一等奖

### 本科 法学 | 西南政法大学
*2019年9月 - 2023年6月*
- 专业排名前 3%，连续 3 年获校级奖学金
- 获 Jessup 国际模拟法庭中国区选拔赛优胜奖

## 技能
- 法律检索
- 北大法宝
- CNKI
- Westlaw
- 法律文书撰写
- 合同审查
- 案例分析
- 法律职业资格证（A证）
- 英语CET-6（580分）
- Office办公软件
- LaTeX`,
  },
  {
    id: 'edu-teacher',
    name: '教师/讲师',
    body: `## 关于我
10 年高中数学教学经验，其中 6 年执教高三毕业班，所带班级高考数学平均分长期位列年级前三。辅导学生获全国高中数学联赛省级一等奖 3 人次；主持开发校本课程 2 门，擅长信息技术与数学教学的融合。

## 工作经历
### 高级教师（备课组长） | 成都市锦官城中学
*2018年8月 - 至今*
- 担任高三数学备课组组长，统筹 6 个班级的教学进度与三轮复习方案
- 执教 2024 届毕业班，高考数学平均分 132 分（满分 150 分）位列年级第一，重点本科上线率 96%
- 开发校本课程《数学思维拓展》，选修人数从 45 人增长至 210 人
- 指导学生参加全国高中数学联赛，3 人获省级一等奖、8 人获省级二等奖

### 数学教师 | 成都市浣花中学
*2015年8月 - 2018年7月*
- 承担高一至高三数学教学任务，所带班级平均分连续 3 个学期超过区均分 20 分以上
- 两度获评校级优秀教师，承担市级公开课 3 节
- 参与市级教研课题《基于错题数据的分层教学研究》，成果在全区 12 所学校推广

## 教育背景
### 硕士 数学教育 | 四川师范大学
*2013年9月 - 2015年6月*
- 研究方向：数学教学法，获优秀毕业论文

### 本科 数学与应用数学 | 四川大学
*2009年9月 - 2013年6月*
- 获校级奖学金 3 次

## 技能
- 高中数学教学
- 竞赛辅导
- 分层教学
- 教学设计
- 课程开发
- 试卷命制
- GeoGebra
- LaTeX
- PPT课件制作
- 教师资格证（高中数学）
- 教育心理学`,
  },
  {
    id: 'edu-researcher',
    name: '科研学者',
    body: `## 关于我
人工智能与自然语言处理方向学者，在 ACL、EMNLP、NeurIPS 等顶级会议发表论文 20 余篇，Google Scholar 引用 1800 余次。主持国家自然科学基金面上项目 2 项，获 ACL 2020 Outstanding Paper Award，累计指导研究生 15 名。

## 工作经历
### 副教授（博士生导师） | 京华大学计算机学院
*2021年9月 - 至今*
- 主讲《自然语言处理》《深度学习》研究生课程，学生评教 4.9/5.0，入选校级精品课程
- 主持国家自然科学基金面上项目「大语言模型可解释性研究」（直接经费 54 万元）及重点项目子课题 1 项
- 指导博士生 8 名、硕士生 7 名，学生获微软学者奖学金 1 人次、国家奖学金 3 人次
- 担任 ACL、EMNLP、NeurIPS 程序委员会委员，年均审稿 40 余篇

### 助理教授 | 京华大学计算机学院
*2018年7月 - 2021年8月*
- 发表 CCF-A 类论文 12 篇（第一作者或通讯作者），累计被引用 1200 余次
- 获 ACL 2020 Outstanding Paper Award（当届全球仅 8 篇）
- 主持国家自然科学基金青年科学基金项目 1 项，按期结题并获评优秀

## 科研项目
### 大语言模型可解释性研究 | 国家自然科学基金面上项目
*2023年1月 - 至今*
- 揭示 Transformer 注意力头与知识存储的对应关系，成果发表于 NeurIPS 2023 与 ACL 2024
- 开源配套可解释性分析工具，GitHub 收获 1500+ Star

## 教育背景
### 博士 计算机科学与技术 | 清华大学
*2014年9月 - 2018年6月*
- 研究方向：自然语言处理
- 博士论文获中国计算机学会优秀博士学位论文奖

### 本科 计算机科学与技术 | 北京大学
*2010年9月 - 2014年6月*
- GPA 3.8/4.0，获保研直博资格

## 技能
- 自然语言处理
- 大语言模型
- 深度学习
- 知识图谱
- Python
- PyTorch
- TensorFlow
- CUDA
- 学术论文写作
- 科研项目管理
- 基金申请
- 英语（学术写作与演讲流利）`,
  },
];

/** Look a starter document up by id. */
export function findResumeSeed(id: string): ResumeSeed | undefined {
  return RESUME_SEEDS.find((s) => s.id === id);
}

/** The section the 案例参考 cards read their one-line description from. */
const SUMMARY_SECTION = '关于我';

/** How long a card's description may get before it is cut. Two lines at the card's width. */
const SUMMARY_MAX_LENGTH = 52;

/**
 * A case's one-line description, taken from the document itself (ticket 48).
 *
 * The create flow's 案例参考 step needs a sentence per case, and the old starter catalogue kept one in
 * a hand-written `description` field — which is how a card ends up describing prose the document no
 * longer contains. Every seed's `关于我` opens with exactly that sentence, so it is read from there:
 * one copy of the prose, and a card that cannot drift from its own sample.
 *
 * Returns `''` for the `blank` seed, whose `关于我` holds placeholder scaffolding ("在此编写个人简介...")
 * rather than a description of a case. The gallery offers that one as 空白创建 instead of as a
 * 案例, so a card never has to render invented text for it.
 */
export function seedSummary(seed: ResumeSeed): string {
  if (seed.id === BLANK_SEED_ID) return '';

  const lines = seed.body.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${SUMMARY_SECTION}`);
  if (start === -1) return '';

  const paragraph = lines
    .slice(start + 1)
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('#'));

  if (paragraph === undefined) return '';

  return paragraph.length > SUMMARY_MAX_LENGTH
    ? `${paragraph.slice(0, SUMMARY_MAX_LENGTH)}…`
    : paragraph;
}
