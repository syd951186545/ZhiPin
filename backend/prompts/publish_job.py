"""
工作流 1：发布招聘公告 - Prompt 模板
"""

from prompts import screenshot_instruction


def _browser_rules(state: dict) -> str:
    return (
        "【浏览器工具强制要求】\n"
        "- 所有 browser 工具调用都必须显式使用 `target=\"host\"` 和 `profile=\"openclaw\"`\n"
        "- 禁止使用默认 sandbox browser"
    )


def build_login_check_prompt(state: dict) -> str:
    account_info = state.get("account_name", "").strip()
    account_section = f"【账号信息】{account_info}" if account_info else "【账号信息】未提供"
    target_url = state.get("platform_url", "").strip() or state.get("platform", "")
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行「发布招聘公告」任务的第1步：持久会话验证。

【目标平台】{state.get("platform", "")}
【企业端地址】{target_url or '未提供'}
{account_section}
【持久会话键】{state.get("browser_session_key", "")}

【本步骤要求】
1. 优先打开企业端地址 `{target_url or state.get("platform", "")}`，不要自行跳去普通官网首页。
2. 如果页面空白、停留在旧 tab、或资源看起来未加载完成，先刷新当前企业端地址，再继续检查。
3. {shot}
4. 判断是否已登录，优先检查以下强信号：
   - 用户头像、账号昵称、退出登录或切换账号入口
   - 企业名称、企业工作台菜单、招聘管理入口
   - 已进入企业工作台域名或业务页，而不是登录页
   - 若已登录（能看到企业名称、工作台菜单、账号头像等）→ 直接输出 [STEP_DONE:login_check]
   - 若未登录、已跳回登录页、或需要短信/扫码/密码交互 → 截图并输出 [STEP_FAILED:login_check]

【注意事项】
- 这是主工作流，不负责重新绑定账号
- 只能验证当前持久浏览器 session 是否仍然有效
- 不要主动退出已登录账号，不要重新发起完整登录流程
- 不要因为落在企业工作台的消息页、职位页、列表页就误判失败，只要能确认企业登录态即可判定成功

{_browser_rules(state)}

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
    shot = screenshot_instruction()
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
6. 完成后{shot}

【注意事项】
- 薪资单位按平台要求换算
- 所有必填字段必须完整填写
- 如遇到必填字段无法匹配，使用最接近的选项

{_browser_rules(state)}

完成后输出：[STEP_DONE:fill_and_publish]
无法完成输出：[STEP_FAILED:fill_and_publish]"""


def build_verify_result_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行第4步：验证发布结果。

【目标平台】{state.get("platform", "")}

【本步骤要求】
1. 确认职位是否发布成功
2. {shot}
3. 如果有职位链接，提取链接地址
4. 记录发布状态

{_browser_rules(state)}

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
