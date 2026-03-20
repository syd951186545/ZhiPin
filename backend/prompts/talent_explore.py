"""
工作流 2：市场人才探索 - Prompt 模板
"""

from prompts import screenshot_instruction


def build_login_check_prompt(state: dict) -> str:
    account_info = state.get("account_name", "").strip()
    account_section = f"【账号信息】{account_info}" if account_info else "【账号信息】未提供（请检查浏览器是否已有登录 session）"
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行「市场人才探索」任务的第1步：登录平台。

【目标平台】{state.get("platform", "")}
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


def build_search_candidates_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行第2步：搜索候选人。

【目标平台】{state.get("platform", "")}

【搜索岗位要求】
- 职位名称：{state.get("job_title", "")}
- 工作地点：{state.get("job_location", "不限")}
- 所属部门：{state.get("job_department", "")}

【任职要求】
{state.get("job_requirements", "")}

【搜索参数】
- 最多获取：{state.get("max_results", 30)} 个结果

【本步骤要求】
1. 进入{state.get("platform", "")}的人才搜索/简历搜索页面
2. 根据岗位要求设置搜索关键词和筛选条件
3. 浏览搜索结果页面
4. {shot}

【注意事项】
- 关键词从任职要求中提取核心技能和岗位名称
- 控制操作频率，避免触发平台风控
- 每次翻页间隔 3-5 秒

完成后输出：[STEP_DONE:search_candidates]
无法完成输出：[STEP_FAILED:search_candidates]"""


def build_collect_profiles_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行第3步：采集候选人资料。

【目标平台】{state.get("platform", "")}
【最多采集】{state.get("max_results", 30)} 个候选人

【岗位要求（用于初步匹配判断）】
{state.get("job_requirements", "")}

【本步骤要求】
1. 逐个查看搜索结果中的候选人简介
2. 提取每个候选人的关键信息
3. 基于岗位要求给出初步匹配度评分（0-100）
4. {shot}

【信息采集要求】
对于每个候选人，请提取：
- 姓名（或显示名）
- 当前职位
- 当前公司
- 工作年限
- 最高学历
- 核心技能标签
- 期望薪资（如显示）
- 联系方式（如可见）
- 匹配度评分

【输出格式（必须严格遵守）】
请将所有候选人信息以 JSON 数组格式输出在代码块中：

```json
[
  {{
    "name": "候选人姓名",
    "phone": "手机号（如可见）",
    "email": "邮箱（如可见）",
    "score": 85,
    "position": "当前职位",
    "company": "当前公司",
    "experience": "5年",
    "education": "本科/硕士",
    "tags": ["Python", "机器学习"],
    "salary_expectation": "15-20K",
    "summary": "一句话推荐理由"
  }}
]
```

【注意事项】
- 控制浏览速度，每个候选人间隔 2-3 秒
- 如遇到限制（如日搜索上限），记录已采集数量并停止
- 尽量获取联系方式

完成后输出：[STEP_DONE:collect_profiles]
无法完成输出：[STEP_FAILED:collect_profiles]"""


def build_initiate_contact_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行第4步：主动沟通。

【目标平台】{state.get("platform", "")}
【企业名称】{state.get("company_name", "我们公司")}

【职位信息】
- 职位名称：{state.get("job_title", "")}
- 工作地点：{state.get("job_location", "不限")}
- 薪资范围：{state.get("job_salary_min", "")}K - {state.get("job_salary_max", "")}K

【本步骤要求】
1. 对之前采集的候选人中匹配度较高者（≥{state.get("min_match_score", 60)}分）发起沟通
2. 发送专业的招聘问候消息
3. 简要介绍职位亮点和企业优势
4. 邀请候选人进一步了解和沟通
5. {shot}

【沟通模板参考】
您好！我是{state.get("company_name", "我们公司")}的招聘负责人。
我们正在招聘{state.get("job_title", "")}岗位，薪资范围{state.get("job_salary_min", "")}K-{state.get("job_salary_max", "")}K。
看到您的背景和我们的岗位非常匹配，想了解一下您是否有兴趣进一步沟通？

【注意事项】
- 每条消息发送间隔 5-10 秒，避免触发风控
- 语气专业友好，不要过度推销
- 不做出公司未授权的薪资承诺
- 记录已沟通的候选人数量

完成后输出：[STEP_DONE:initiate_contact]
无法完成输出：[STEP_FAILED:initiate_contact]"""
