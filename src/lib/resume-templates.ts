/**
 * Resume template definitions.
 * Each template provides a category, preview metadata, and a markdown generator.
 */

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Color accent for the preview card */
  accent: string;
  /** Generate markdown content */
  markdown: string;
}

export type TemplateCategory =
  | 'tech'
  | 'business'
  | 'creative'
  | 'legal'
  | 'education'
  | 'general';

export const TEMPLATE_CATEGORIES: { key: TemplateCategory; label: string; icon: string }[] = [
  { key: 'general', label: '通用', icon: '📄' },
  { key: 'tech', label: '技术/程序员', icon: '💻' },
  { key: 'business', label: '商业/金融', icon: '📊' },
  { key: 'creative', label: '创意/设计', icon: '🎨' },
  { key: 'legal', label: '法律/法学', icon: '⚖️' },
  { key: 'education', label: '教育/学术', icon: '🎓' },
];

export const RESUME_TEMPLATES: ResumeTemplate[] = [
  // ── General ──
  {
    id: 'blank',
    name: '空白模板',
    description: '从零开始，自由发挥',
    category: 'general',
    accent: 'default',
    markdown: `---
name: 
title: 
email: 
phone: 
location: 
---

## 关于我
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
- 技能1, 技能2, 技能3
`,
  },
  {
    id: 'general-standard',
    name: '标准简历',
    description: '适用于各行各业的通用格式',
    category: 'general',
    accent: 'primary',
    markdown: `---
name: 张三
title: 求职者
email: zhangsan@email.com
phone: +86 138-0000-0000
location: 北京市
---

## 关于我
具备良好的沟通能力和团队协作精神，做事认真负责，学习能力强，期望在贵公司发挥自身优势，与团队共同成长。

## 工作经历
### 岗位名称 | 公司名称
*2022年6月 - 至今*
- 负责部门核心业务的推进与执行
- 参与跨部门项目协调，提升工作效率 20%
- 撰写工作报告及项目文档

### 实习生 | 公司名称
*2021年7月 - 2022年5月*
- 协助团队完成日常工作任务
- 整理和分析业务数据，形成周报

## 教育背景
### 本科 管理学 | 北京大学
*2018年9月 - 2022年6月*
- GPA: 3.6/4.0
- 校级奖学金获得者

## 技能
- Office 办公套件, 数据分析, 项目管理
- 英语 CET-6, 普通话二级甲等
`,
  },

  // ── Tech / 程序员 ──
  {
    id: 'tech-fullstack',
    name: '全栈工程师',
    description: '前后端全栈开发简历模板',
    category: 'tech',
    accent: 'primary',
    markdown: `---
name: 李明
title: 全栈开发工程师
email: liming@dev.com
phone: +86 139-0000-0000
location: 上海市
github: https://github.com/liming
website: https://liming.dev
---

## 关于我
5 年全栈开发经验，精通 React/Next.js 前端生态和 Go/Node.js 后端技术栈。热衷于构建高性能、可扩展的 Web 应用，对代码质量和工程化有较高追求。

## 工作经历
### 高级全栈工程师 | 某科技有限公司
*2022年3月 - 至今*
- 主导公司核心 SaaS 产品前后端架构设计，服务 10 万+ 用户
- 使用 React + TypeScript 重构前端，首屏加载速度提升 60%
- 设计并实现基于 Go 的微服务架构，QPS 从 500 提升至 5000
- 搭建 CI/CD 流水线，部署效率提升 3 倍

### 前端开发工程师 | 某互联网公司
*2020年7月 - 2022年2月*
- 负责电商平台前端开发，日均 PV 50 万+
- 实现组件库建设，覆盖 40+ 通用组件
- 优化 Webpack 打包配置，构建时间减少 45%

## 项目经历
### ResumeVault | 个人项目
*2024年*
- 基于 Next.js + Go (Kratos) 的简历管理平台
- 实现 AI 驱动的简历解析和智能润色功能
- 支持多模板 PDF 导出和在线预览

### 开源组件库 | 团队项目
*2023年*
- 基于 React 的企业级 UI 组件库，GitHub 2k+ Star
- 支持主题定制、国际化和无障碍访问
- 编写完善的文档和测试用例，覆盖率 90%+

## 教育背景
### 本科 计算机科学与技术 | 上海交通大学
*2016年9月 - 2020年6月*
- GPA: 3.8/4.0，专业排名 Top 5%
- ACM 竞赛银牌

## 技能
- TypeScript, JavaScript, Go, Python, SQL
- React, Next.js, Vue.js, Node.js, Tailwind CSS
- PostgreSQL, Redis, MongoDB, Docker, Kubernetes
- Git, CI/CD, Linux, AWS/阿里云
`,
  },
  {
    id: 'tech-backend',
    name: '后端工程师',
    description: '服务端开发/架构师简历模板',
    category: 'tech',
    accent: 'secondary',
    markdown: `---
name: 王强
title: 后端开发工程师
email: wangqiang@dev.com
phone: +86 137-0000-0000
location: 深圳市
github: https://github.com/wangqiang
---

## 关于我
6 年后端开发经验，擅长高并发系统设计和分布式架构。熟悉微服务、消息队列、缓存等中间件技术，具备良好的系统设计能力和问题排查经验。

## 工作经历
### 资深后端工程师 | 某大厂
*2021年4月 - 至今*
- 负责核心交易系统设计与开发，日均交易量 100 万+
- 设计基于 Go 的微服务架构，服务拆分降低耦合度 70%
- 优化数据库查询和缓存策略，接口 P99 延迟从 200ms 降至 30ms
- 主导技术方案评审，指导初级工程师成长

### 后端开发工程师 | 某科技公司
*2018年7月 - 2021年3月*
- 参与电商平台后端开发，支撑千万级用户量
- 实现订单系统重构，引入 CQRS 模式提升查询性能
- 搭建统一日志和监控平台，故障发现时间缩短 80%

## 教育背景
### 硕士 软件工程 | 华中科技大学
*2016年9月 - 2018年6月*
- 研究方向：分布式系统

### 本科 计算机科学 | 武汉大学
*2012年9月 - 2016年6月*

## 技能
- Go, Java, Python, C++
- MySQL, PostgreSQL, Redis, MongoDB, Elasticsearch
- Kafka, RabbitMQ, gRPC, RESTful API
- Docker, Kubernetes, Prometheus, Grafana
- 微服务架构, 分布式系统, 高并发设计
`,
  },
  {
    id: 'tech-frontend',
    name: '前端工程师',
    description: '前端开发/UI 工程师简历模板',
    category: 'tech',
    accent: 'success',
    markdown: `---
name: 陈小雨
title: 前端开发工程师
email: chenxiaoyu@design.com
phone: +86 136-0000-0000
location: 杭州市
website: https://xiaoyu.design
github: https://github.com/chenxiaoyu
---

## 关于我
4 年前端开发经验，专注于用户体验和性能优化。熟练掌握 React 生态，具有丰富的跨端开发经验和设计系统建设能力。

## 工作经历
### 前端技术负责人 | 某互联网公司
*2022年5月 - 至今*
- 负责前端团队技术选型和架构设计，管理 5 人团队
- 主导 Design System 建设，统一 3 条产品线 UI 规范
- 推动 Next.js SSR 落地，SEO 流量提升 150%
- 实现前端监控体系，线上问题发现率提升 90%

### 前端开发工程师 | 某创业公司
*2020年7月 - 2022年4月*
- 独立负责 C 端产品前端开发，覆盖 Web 和 H5
- 实现复杂数据可视化大屏，使用 D3.js + Canvas
- 优化首屏加载，Lighthouse 评分从 45 提升至 92

## 教育背景
### 本科 数字媒体技术 | 浙江大学
*2016年9月 - 2020年6月*
- 作品获校级优秀毕业设计

## 技能
- TypeScript, JavaScript, HTML5, CSS3
- React, Next.js, Vue 3, Tailwind CSS, Sass
- Webpack, Vite, Turbopack, pnpm
- Figma, 响应式设计, 无障碍 (a11y)
- Node.js, GraphQL, RESTful API
`,
  },

  // ── Business / 商业 ──
  {
    id: 'biz-finance',
    name: '金融分析师',
    description: '金融/投行/咨询行业简历模板',
    category: 'business',
    accent: 'warning',
    markdown: `---
name: 赵薇薇
title: 金融分析师
email: zhaowei@finance.com
phone: +86 135-0000-0000
location: 北京市
linkedin: https://linkedin.com/in/zhaowei
---

## 关于我
3 年金融行业从业经验，擅长财务建模、估值分析和行业研究。持有 CFA Level II 证书，具备优秀的数据分析能力和商业洞察力。

## 工作经历
### 高级分析师 | 某证券公司研究所
*2022年8月 - 至今*
- 覆盖消费行业 15+ 家上市公司，撰写深度研究报告 30+
- 建立完整的 DCF 和可比估值模型，推荐标的平均收益率 25%
- 参与 3 个 IPO 项目的行业分析和尽职调查

### 初级分析师 | 某投资银行
*2021年7月 - 2022年7月*
- 协助完成 5 个并购项目的财务尽调和估值分析
- 制作投资备忘录和客户演示材料
- 维护行业数据库，跟踪宏观经济指标

## 教育背景
### 硕士 金融学 | 清华大学五道口金融学院
*2019年9月 - 2021年6月*
- GPA: 3.9/4.0，优秀毕业生

### 本科 经济学 | 中国人民大学
*2015年9月 - 2019年6月*
- 国家奖学金获得者

## 技能
- 财务建模, DCF估值, 可比公司分析, LBO建模
- Excel (高级), Python, SQL, Wind, Bloomberg
- CFA Level II, 证券从业资格
- 英语流利 (IELTS 7.5)
`,
  },
  {
    id: 'biz-product',
    name: '产品经理',
    description: '互联网产品经理/策划简历模板',
    category: 'business',
    accent: 'primary',
    markdown: `---
name: 孙蕾
title: 高级产品经理
email: sunlei@product.com
phone: +86 134-0000-0000
location: 北京市
---

## 关于我
5 年互联网产品经验，主导过千万级用户产品的从 0 到 1 和增长迭代。擅长用户研究、数据驱动决策和跨团队协作，对 B 端和 C 端产品均有深入理解。

## 工作经历
### 高级产品经理 | 某头部互联网公司
*2022年3月 - 至今*
- 负责核心产品线规划，DAU 从 200 万增长至 500 万
- 主导会员体系设计，付费转化率提升 35%
- 搭建 A/B 测试平台，提升产品迭代效率和决策准确性
- 管理 3 名产品经理的工作，建立需求评审机制

### 产品经理 | 某创业公司
*2020年7月 - 2022年2月*
- 从 0 到 1 打造社交电商小程序，上线 3 月用户破百万
- 设计用户增长策略，拉新成本降低 60%
- 与技术团队紧密协作，保证双周迭代节奏

## 教育背景
### 硕士 信息管理 | 北京大学
*2018年9月 - 2020年6月*

### 本科 工商管理 | 南开大学
*2014年9月 - 2018年6月*

## 技能
- 产品规划, 需求分析, 用户研究, 竞品分析
- Axure, Figma, SQL, Python (数据分析)
- 数据分析 (神策/GrowingIO), A/B Testing
- 项目管理 (Jira, 飞书)
`,
  },

  // ── Creative / 设计 ──
  {
    id: 'creative-ux',
    name: 'UX 设计师',
    description: '用户体验/交互设计师简历模板',
    category: 'creative',
    accent: 'secondary',
    markdown: `---
name: 林小艺
title: UX/UI 设计师
email: linxiaoyi@design.com
phone: +86 133-0000-0000
location: 上海市
website: https://xiaoyi.design
---

## 关于我
4 年用户体验设计经验，从用户研究到视觉落地全流程参与。擅长复杂业务场景的信息架构设计和交互优化，作品曾获 Red Dot 设计奖提名。

## 工作经历
### 高级 UX 设计师 | 某科技公司
*2022年4月 - 至今*
- 负责企业级 SaaS 产品的整体用户体验设计
- 主导 Design System 建设，涵盖 200+ 组件和规范文档
- 通过用户研究和可用性测试，核心流程转化率提升 40%
- 与产品、前端紧密协作，确保设计稿高保真还原

### UI/UX 设计师 | 某设计工作室
*2020年6月 - 2022年3月*
- 服务 10+ 客户的品牌和产品设计需求
- 完成 3 个移动端 App 的完整设计方案
- 制作高保真原型和动效设计

## 项目经历
### 智慧办公平台 | 体验设计
*2023年*
- 面向 500 人企业的协同办公产品
- 完成信息架构、交互流程和视觉设计全流程
- 上线后用户满意度评分 4.6/5.0

## 教育背景
### 本科 视觉传达设计 | 中国美术学院
*2016年9月 - 2020年6月*

## 技能
- Figma, Sketch, Adobe XD, Photoshop, Illustrator
- 用户研究, 可用性测试, 信息架构
- 原型设计, 动效设计 (Principle, After Effects)
- Design System, 设计规范, 组件化思维
- HTML/CSS 基础, 前端协作能力
`,
  },

  // ── Legal / 法律 ──
  {
    id: 'legal-lawyer',
    name: '执业律师',
    description: '律师/法务/法律顾问简历模板',
    category: 'legal',
    accent: 'warning',
    markdown: `---
name: 周正义
title: 执业律师
email: zhouzy@lawfirm.com
phone: +86 132-0000-0000
location: 北京市
---

## 关于我
8 年法律从业经验，专注于公司法、合同法和知识产权领域。成功代理诉讼案件 100+ 件，胜诉率达 85%。现为某知名律所合伙人，具备丰富的非诉和争议解决经验。

## 工作经历
### 合伙人 | 北京某律师事务所
*2022年1月 - 至今*
- 独立管理律师团队，年创收 500 万+
- 为多家上市公司提供常年法律顾问服务
- 成功代理知识产权侵权案件，获赔金额累计超 3000 万
- 参与企业并购法律尽调和交易文件起草

### 主办律师 | 北京某律师事务所
*2018年7月 - 2021年12月*
- 独立代理民商事诉讼案件 80+ 件
- 起草和审核合同 500+ 份
- 为创业公司提供股权架构设计和融资法律服务

### 实习律师 | 某国际律师事务所
*2017年7月 - 2018年6月*
- 协助合伙人完成跨境交易法律文件起草
- 参与尽职调查和法律研究

## 教育背景
### 硕士 法学 | 中国政法大学
*2015年9月 - 2017年6月*
- 研究方向：知识产权法
- 优秀毕业论文

### 本科 法学 | 中国政法大学
*2011年9月 - 2015年6月*
- 国家奖学金，模拟法庭大赛一等奖

## 技能
- 民商事诉讼, 合同法, 公司法, 知识产权法
- 法律尽调, 合规审查, 法律文书起草
- 仲裁, 调解, 谈判
- 法律检索 (北大法宝/威科先行)
- 英语流利 (法律英语)
`,
  },
  {
    id: 'legal-graduate',
    name: '法学应届生',
    description: '法学专业应届毕业生简历模板',
    category: 'legal',
    accent: 'primary',
    markdown: `---
name: 刘思远
title: 法学硕士 | 求职律师助理
email: liusy@law.edu.cn
phone: +86 131-0000-0000
location: 北京市
---

## 关于我
中国政法大学法学硕士应届毕业生，已通过国家法律职业资格考试（A 证）。研究方向为民商法，具备扎实的法学理论基础和实务经验，在律所实习期间独立完成多项法律研究和文书起草工作。

## 实习经历
### 实习生 | 北京某红圈律师事务所
*2024年7月 - 2025年1月*
- 参与 3 起重大商事仲裁案件的案卷整理和法律研究
- 独立撰写法律意见书 5 份，获合伙人认可
- 协助完成企业合规审查项目

### 法律助理（实习） | 某区人民法院
*2024年1月 - 2024年6月*
- 协助法官审理民商事案件 30+ 件
- 撰写裁判文书初稿
- 组织庭前调解工作

## 教育背景
### 硕士 民商法学 | 中国政法大学
*2023年9月 - 2026年6月*
- GPA: 3.85/4.0
- 发表核心期刊论文 1 篇
- 校级学术论坛一等奖

### 本科 法学 | 西南政法大学
*2019年9月 - 2023年6月*
- 专业排名 Top 3%
- 连续 3 年获校级奖学金
- Jessup 国际模拟法庭中国区选拔赛 优胜奖

## 技能
- 法律检索 (北大法宝, CNKI, Westlaw)
- 法律文书撰写, 合同审查
- 法律职业资格证 (A 证)
- 英语 CET-6 580 分
- Microsoft Office, LaTeX
`,
  },

  // ── Education / 学术 ──
  {
    id: 'edu-teacher',
    name: '教师/讲师',
    description: '中小学教师/高校讲师简历模板',
    category: 'education',
    accent: 'success',
    markdown: `---
name: 黄老师
title: 高中数学教师
email: huanglaoshi@edu.com
phone: +86 130-0000-0000
location: 成都市
---

## 关于我
10 年高中数学教学经验，所带班级高考数学平均分长期位列年级前三。善于运用信息技术辅助教学，在数学竞赛辅导方面成果突出，多名学生获省级一等奖。

## 工作经历
### 高级教师 | 成都某重点中学
*2018年8月 - 至今*
- 担任高三数学备课组组长，统筹教学进度和复习方案
- 所带班级 2024 届高考数学平均分 132 分（满分 150）
- 开设"数学思维拓展"校本课程，选修人数连年增长
- 指导学生参加数学竞赛，3 人获全国高中数学联赛省一等奖

### 数学教师 | 成都某中学
*2015年8月 - 2018年7月*
- 负责高一至高三数学教学工作
- 被评为"校级优秀教师"
- 参与市级教研课题研究

## 教育背景
### 硕士 数学教育 | 四川师范大学
*2013年9月 - 2015年6月*
- 研究方向：数学教学法
- 优秀毕业论文

### 本科 数学与应用数学 | 四川大学
*2009年9月 - 2013年6月*

## 技能
- 高中数学教学, 竞赛辅导
- 教学设计, 课程开发
- GeoGebra, LaTeX, PPT 课件制作
- 教师资格证 (高中数学)
- 教育心理学基础
`,
  },
  {
    id: 'edu-researcher',
    name: '科研学者',
    description: '高校教师/研究员学术简历模板',
    category: 'education',
    accent: 'secondary',
    markdown: `---
name: 张博士
title: 副教授 / 博士生导师
email: zhangbs@university.edu.cn
phone: +86 129-0000-0000
location: 北京市
website: https://scholar.university.edu.cn/zhangbs
---

## 关于我
专注于人工智能与自然语言处理领域研究，在 ACL、EMNLP、NeurIPS 等顶级会议发表论文 20 余篇。主持国家自然科学基金面上项目 2 项，指导研究生 15 名。

## 工作经历
### 副教授 / 博士生导师 | 北京大学计算机学院
*2021年9月 - 至今*
- 主讲《自然语言处理》《深度学习》研究生课程
- 主持国家自然科学基金面上项目"大语言模型的可解释性研究"
- 指导 8 名博士生、7 名硕士生

### 助理教授 | 北京大学计算机学院
*2018年7月 - 2021年8月*
- 以第一作者/通讯作者发表 CCF-A 类论文 12 篇
- 获得 ACL 2020 Outstanding Paper Award

## 教育背景
### 博士 计算机科学 | 清华大学
*2014年9月 - 2018年6月*
- 研究方向：自然语言处理
- 博士论文获中国计算机学会优秀博士论文奖

### 本科 计算机科学 | 北京大学
*2010年9月 - 2014年6月*

## 技能
- 自然语言处理, 大语言模型, 深度学习
- Python, PyTorch, TensorFlow
- 学术论文写作, 科研项目管理
- 英语流利 (学术写作与演讲)
`,
  },
];

/** Get templates filtered by category */
export function getTemplatesByCategory(category?: TemplateCategory): ResumeTemplate[] {
  if (!category) return RESUME_TEMPLATES;
  return RESUME_TEMPLATES.filter((t) => t.category === category);
}

/** Get a single template by ID */
export function getTemplateById(id: string): ResumeTemplate | undefined {
  return RESUME_TEMPLATES.find((t) => t.id === id);
}
