"""
工作流 3：简历筛选及 AI 沟通 - Prompt 模板
"""

from prompts import screenshot_instruction


def build_login_check_prompt(state: dict) -> str:
    account_info = state.get("account_name", "").strip()
    account_section = f"【账号信息】{account_info}" if account_info else "【账号信息】未提供（请检查浏览器是否已有登录 session）"
    shot = screenshot_instruction()
    return f"""你是一个专业的HR简历筛选助手，请执行「简历筛选」任务的登录步骤。

【当前平台】{state.get("platform", "")}
{account_section}

【本步骤要求】
1. 打开{state.get("platform", "")}网站
2. {shot}
3. 判断是否已登录：
   - 若已登录 → 直接输出 [STEP_DONE:login_check]
   - 若未登录且有账号信息 → 完成登录，再截图，再输出 [STEP_DONE:login_check]
   - 若未登录且无账号信息 → 截图，输出提示后输出 [STEP_FAILED:login_check]

【注意事项】
- 优先判断当前浏览器 session 是否有效，不要主动退出已登录账号
- 如遇验证码，等待人工处理

完成后输出：[STEP_DONE:login_check]
无法完成输出：[STEP_FAILED:login_check]"""


def build_collect_resumes_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    return f"""你是一个专业的HR简历筛选助手，请执行简历采集步骤。

【当前平台】{state.get("platform", "")}

【关联职位】{state.get("job_title", "")}

【本步骤要求】
1. 进入{state.get("platform", "")}的收件箱/简历管理/应聘列表页面
2. 查看与「{state.get("job_title", "")}」相关的全部收到的简历/应聘
3. 逐份提取候选人简历基本信息
4. {shot}

【采集信息】
对于每份简历/应聘，提取：
- 候选人姓名
- 联系方式（手机、邮箱，如可见）
- 当前职位与公司
- 工作年限
- 最高学历
- 核心技能
- 期望薪资
- 简历概要

【注意事项】
- 尽可能采集全部简历，不要遗漏
- 控制操作频率，每份简历间隔 2-3 秒
- 如遇分页，逐页采集

完成后输出：[STEP_DONE:collect_resumes]
无法完成输出：[STEP_FAILED:collect_resumes]"""


def build_analyze_match_prompt(state: dict) -> str:
    return f"""你是一个专业的HR简历筛选助手，请执行简历分析与匹配评分步骤。

【岗位信息】
- 职位名称：{state.get("job_title", "")}
- 所属部门：{state.get("job_department", "未指定")}
- 工作地点：{state.get("job_location", "不限")}

【任职要求】
{state.get("job_requirements", "")}

【评分标准】
请对每份简历进行以下评估：
1. 匹配度评分（0-100分）
   - 技术能力匹配：占40%
   - 工作经验匹配：占30%
   - 教育背景匹配：占15%
   - 综合素质匹配：占15%
2. 优势分析（3-5条关键优势）
3. 不足分析（1-3条主要不足）
4. 推荐等级：强烈推荐 / 推荐 / 待定 / 不推荐
5. 一句话推荐理由

【匹配阈值】
- 匹配度 ≥ {state.get("min_match_score", 60)} 分：标记为「推荐面试」
- 匹配度 < 30 分：标记为「不合适」
- 中间分数段：标记为「待人工复核」

【输出格式（必须严格遵守）】
请将分析结果以 JSON 数组格式输出：

```json
[
  {{
    "name": "候选人姓名",
    "phone": "手机号",
    "email": "邮箱",
    "score": 85,
    "strengths": ["优势1", "优势2", "优势3"],
    "weaknesses": ["不足1"],
    "recommendation": "强烈推荐",
    "summary": "一句话推荐理由",
    "position": "当前职位",
    "company": "当前公司",
    "experience": "5年",
    "tags": ["Python", "数据分析"]
  }}
]
```

完成后输出：[STEP_DONE:analyze_match]
无法完成输出：[STEP_FAILED:analyze_match]"""


def build_contact_qualified_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    return f"""你是一个专业的HR助手，请执行主动沟通步骤。

【当前平台】{state.get("platform", "")}
【企业名称】{state.get("company_name", "我们公司")}

【职位信息】
- 职位名称：{state.get("job_title", "")}
- 工作地点：{state.get("job_location", "不限")}
- 薪资范围：{state.get("job_salary_min", "")}K - {state.get("job_salary_max", "")}K

【本步骤要求】
1. 对之前分析中匹配度 ≥ {state.get("min_match_score", 60)} 分的候选人发起沟通
2. 发送面试邀约消息
3. 简要说明岗位信息和面试流程
4. {shot}

【沟通模板参考】
您好！我是{state.get("company_name", "我们公司")}的HR。
感谢您投递{state.get("job_title", "")}岗位，经过初步评估，您的背景与我们的需求非常匹配。
我们希望能邀请您参加面试，方便的话请回复您可以的时间，我们会尽快安排。

【注意事项】
- 每条消息发送间隔 5-10 秒
- 语气专业友好
- 不做出薪资承诺
- 记录已发送消息的候选人数

完成后输出：[STEP_DONE:contact_qualified]
无法完成输出：[STEP_FAILED:contact_qualified]"""
