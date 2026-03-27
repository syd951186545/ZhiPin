# Design System — 机灵平台 / 企业数字员工执行台

## Product Context
- **What this is:** 一个面向企业数字员工场景的 Web 管理台，也是业务执行工作台，用于承载招聘、运营等可自动化任务的配置、执行、核验与回看。
- **Who it's for:** 企业 HR、招聘运营、管理者，以及中小企业中身兼多职的企业主。
- **Space/industry:** 企业数字员工、招聘自动化、业务流程执行平台。参考方向包括企业 AI 工作台、招聘自动化 SaaS、运营后台。
- **Project type:** Web app / dashboard / operations console。

## Aesthetic Direction
- **Direction:** 工业理性 + 运营指挥室
- **Decoration level:** intentional
- **Mood:** 像一个持续运转的业务控制台，而不是概念化 AI 演示页。界面需要给人“系统正在替我干活，而且我能随时接管”的稳定感。
- **Reference sites:** [Workato](https://www.workato.com/), [UiPath](https://www.uipath.com/), [Glean](https://www.glean.com/), [Ashby](https://www.ashbyhq.com/), [hireEZ](https://www.hireez.com/), [Greenhouse](https://www.greenhouse.com/), [Retool](https://retool.com/)

## Typography
- **Display/Hero:** Noto Sans SC ExtraBold / Bold
  说明：中文可读性稳定，适合承载高信息密度后台的品牌标题和模块标题，不会显得轻浮。
- **Body:** Noto Sans SC Regular / Medium
  说明：长时间阅读低疲劳，适合表单、说明文案、表格和状态信息。
- **UI/Labels:** Noto Sans SC Medium
  说明：统一中文界面的一致性，避免中英混排时的节奏断裂。
- **Data/Tables:** Geist Sans 或 IBM Plex Sans（需支持 tabular-nums）
  说明：用于数字 KPI、时间、统计与平台英文名称。若当前实现不便引入 Geist，先用 IBM Plex Sans 落地。
- **Code:** JetBrains Mono
  说明：用于执行日志、AI 输出、调试信息和系统证据展示。
- **Loading:** Noto Sans SC 与 JetBrains Mono 可先通过 Google Fonts 或 Bunny Fonts 加载；Geist Sans 优先走 npm/fontsource 或自托管。若前端需要最快落地，第一阶段可只引入 Noto Sans SC + JetBrains Mono，并保留数字字体切换位。
- **Scale:**
  - hero: 56px / 1.04
  - h1: 40px / 1.1
  - h2: 30px / 1.15
  - h3: 24px / 1.2
  - h4: 20px / 1.3
  - body-lg: 17px / 1.8
  - body: 15px / 1.8
  - body-sm: 13px / 1.7
  - micro: 12px / 1.6

## Color
- **Approach:** balanced
- **Primary:** `#155E63`
  说明：深矿石青，代表执行、系统、可信和“机器在稳态工作”。
- **Secondary:** `#D89B2B`
  说明：信号琥珀，用于提醒、机会、人工介入点和中间状态。
- **Ink:** `#14202B`
  说明：墨蓝黑，用于标题、深色容器、日志区域和暗色模式基底。
- **Surface:** `#F5F2EA`
  说明：温纸白，用于全局背景和浅色页面底，让产品脱离纯白组件库气质。
- **Neutrals:**
  - `#FFFDFA`
  - `#ECE6DB`
  - `#D8D1C5`
  - `#B8B0A3`
  - `#6B7280`
  - `#46505C`
  - `#1F2937`
- **Semantic:**
  - success: `#177B5C`
  - warning: `#D89B2B`
  - error: `#C4493D`
  - info: `#2F6FDB`
- **Dark mode:** 不是简单反相。深色模式以 `#0F161D` 到 `#16212C` 为基础表面色，整体饱和度相对浅色模式降低 10% 到 20%，保持深青与琥珀的语义，不做霓虹化处理。

## Spacing
- **Base unit:** 8px
- **Density:** compact / comfortable
- **Scale:** 2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** hybrid
- **Grid:**
  - mobile: 4 columns
  - tablet: 8 columns
  - desktop: 12 columns
- **Max content width:** 1440px
- **Shell guidance:**
  - 工作台主布局保持严格网格、明确边界和可扫描节奏。
  - 登录页、总览页、空状态页允许更强品牌表达和更有呼吸感的排版。
  - 执行监控区、日志区、截图区要被当作核心模块，而不是附属小组件。
- **Border radius:**
  - sm: 8px
  - md: 14px
  - lg: 22px
  - full: 9999px

## Motion
- **Approach:** intentional
- **Principle:** 动效只服务于状态变化、任务推进、界面切换和用户注意力引导，不为“显得高级”而增加无意义浮动。
- **Easing:**
  - enter: `cubic-bezier(0.2, 0.8, 0.2, 1)`
  - exit: `cubic-bezier(0.4, 0, 1, 1)`
  - move: `cubic-bezier(0.22, 1, 0.36, 1)`
- **Duration:**
  - micro: 80ms
  - short: 160ms
  - medium: 240ms
  - long: 360ms

## Core UI Guidance
- **导航:** 当前页高亮使用深青色块或深青色边框，不再使用通用黑白灰反转。
- **状态系统:** “进行中 / 待人工确认 / 已完成 / 已失效”必须在色彩和形状上可瞬间分辨。
- **执行证据:** 日志、截图、时间线、状态节点是品牌资产，应该比普通二级说明更醒目。
- **表单与设置页:** 不要做成普通后台表单堆叠，应强调“执行前准备”和“风险预检”。
- **图表:** 图表只在需要展示趋势时出现，颜色控制克制，避免多彩商业 BI 风格。
- **空状态:** 空状态不是“暂无数据”一句话结束，应提示下一步动作和业务含义。

## Safe Choices
- 保留左侧导航、卡片化信息区、标签页和清晰状态色，符合企业后台预期。
- 保留相对紧凑的栅格和可扫读布局，不为品牌表达牺牲效率。
- 保留浅动效和明显 CTA，降低学习成本。

## Risks
- **风险 1：** 用温纸白替代纯白背景
  - **收益：** 脱离常见 shadcn/template 气质，让产品更像业务控制台。
  - **代价：** 需要更细致地处理边界层级和阴影。
- **风险 2：** 用深青 + 琥珀替代通用 SaaS 蓝
  - **收益：** 提升品牌识别度，更贴合“执行 / 提醒 / 介入”的工作流语义。
  - **代价：** 会比标准企业软件更有个性，需要严控使用范围。
- **风险 3：** 把执行日志、截图、状态节点做成一等视觉元素
  - **收益：** 强化“数字员工真的在执行”的产品记忆点。
  - **代价：** 组件设计工作量略大于普通后台卡片。

## Implementation Priorities
1. 先重做登录页、左侧导航、顶栏状态区和执行监控卡片。
2. 再统一按钮、输入框、Badge、Card、Alert、Tabs 的 token。
3. 最后改造岗位管理、候选人池、设置页和图表视觉。

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-27 | 初版设计系统建立 | 基于项目代码、产品定位以及企业 AI 工作台 / 招聘自动化产品研究结果 |
| 2026-03-27 | 主方向定为“工业理性 + 运营指挥室” | 更适配业务执行工作台，而不是抽象 AI 平台 |
| 2026-03-27 | 主色定为深青 + 琥珀 | 用语义化颜色承载执行、提醒和人工介入 |
