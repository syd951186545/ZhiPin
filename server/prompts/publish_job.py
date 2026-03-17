"""
工作流 1：发布招聘公告 - Prompt 模板
"""


def build_login_check_prompt(state: dict) -> str:
    account_info = state.get("account_name", "").strip()
    account_section = f"【账号信息】{account_info}" if account_info else "【账号信息】未提供（请检查浏览器是否已有登录 session）"
    return f"""你是一个专业的招聘助手，请执行「发布招聘公告」任务的第1步：登录检查。

【目标平台】{state.get("platform", "")}
{account_section}

【本步骤要求】
1. 打开{state.get("platform", "")}网站
2. 截图查看当前页面状态（用于任务监控节点展示）
3. 判断是否已登录：
   - 若已登录（能看到用户头像/企业名称等）→ 直接输出 [STEP_DONE:login_check]
   - 若未登录且有账号信息 → 完成登录流程，再输出 [STEP_DONE:login_check]
   - 若未登录且无账号信息 → 输出提示后输出 [STEP_FAILED:login_check]

【注意事项】
- 优先判断当前浏览器 session 是否有效，不要主动退出已登录账号
- 如遇验证码或扫码，等待人工处理后再继续

完成后输出：[STEP_DONE:login_check]
无法完成输出：[STEP_FAILED:login_check]"""


def build_generate_announcement_prompt(state: dict) -> str:
    return f"""你是一个专业的招聘助手，请执行第2步：生成招聘公告。

【企业信息】
- 企业名称：{state.get("company_name", "我们公司")}
- 企业地址：{state.get("company_address", "未填写")}
- 企业规模：{state.get("company_size", "未填写")}
- 企业概述：{state.get("company_overview", "未填写")}

【职位信息】
- 职位名称：{state.get("job_title", "")}
- 工作地点：{state.get("job_location", "不限")}
- 薪资范围：{state.get("job_salary_min", "")}K - {state.get("job_salary_max", "")}K
- 工作类型：{state.get("job_employment_type", "")}
- 所属部门：{state.get("job_department", "未指定")}

【职位描述】
{state.get("job_description", "")}

【任职要求】
{state.get("job_requirements", "")}

【福利待遇】
{state.get("job_benefits", "面议")}

【本步骤要求】
基于以上信息，生成一份专业的对外招聘公告。公告需包含：
1. 企业简介（简洁有吸引力）
2. 岗位职责
3. 任职要求
4. 薪资福利
5. 工作地点
6. 投递方式

使用自然流畅的中文，避免夸大承诺。

【输出格式（必须严格遵守）】
【AI公告内容】
（在此生成完整的招聘公告）
【/AI公告内容】

完成后输出：[STEP_DONE:generate_announcement]
无法完成输出：[STEP_FAILED:generate_announcement]"""


def build_fill_and_publish_prompt(state: dict) -> str:
    return f"""你是一个专业的招聘助手，请执行第3步：填写并发布职位。

【目标平台】{state.get("platform", "")}

【职位信息】
- 职位名称：{state.get("job_title", "")}
- 工作地点：{state.get("job_location", "不限")}
- 薪资范围：{state.get("job_salary_min", "")}K - {state.get("job_salary_max", "")}K
- 工作类型：{state.get("job_employment_type", "")}
- 所属部门：{state.get("job_department", "未指定")}

【职位描述】
{state.get("job_description", "")}

【任职要求】
{state.get("job_requirements", "")}

【福利待遇】
{state.get("job_benefits", "面议")}

【本步骤要求】
1. 在{state.get("platform", "")}平台进入职位发布页面
2. 根据以上信息填写所有表单字段
3. 将之前生成的招聘公告内容填入职位描述
4. 检查所有字段是否完整
5. 提交发布
6. 完成后截图确认（用于任务监控节点展示）

【注意事项】
- 薪资单位按平台要求换算
- 所有必填字段必须完整填写
- 如遇到必填字段无法匹配，使用最接近的选项

完成后输出：[STEP_DONE:fill_and_publish]
无法完成输出：[STEP_FAILED:fill_and_publish]"""


def build_verify_result_prompt(state: dict) -> str:
    return f"""你是一个专业的招聘助手，请执行第4步：验证发布结果。

【目标平台】{state.get("platform", "")}

【本步骤要求】
1. 确认职位是否发布成功
2. 截图保存发布成功页面（用于任务监控节点展示）
3. 如果有职位链接，提取链接地址
4. 记录发布状态

【输出格式（必须严格遵守）】
【发布结果】
- 发布平台：{state.get("platform", "")}
- 发布账号：{state.get("account_name", "")}
- 职位名称：{state.get("job_title", "")}
- 发布状态：成功/失败（如失败说明原因）
- 职位链接：（如可获取）
【/发布结果】

完成后输出：[STEP_DONE:verify_result]
无法完成输出：[STEP_FAILED:verify_result]"""
