"""
工作流 2：市场人才探索 - Prompt 模板
"""

import re

from parsers.result_parser import parse_candidate_list
from prompts import screenshot_instruction


def _browser_rules(state: dict) -> str:
    return (
        "【浏览器工具强制要求】\n"
        "- 所有 browser 工具调用都必须显式使用 `target=\"host\"` 和 `profile=\"openclaw\"`\n"
        "- 禁止使用默认 sandbox browser"
    )


def _sanitize_custom_message(raw: str) -> str:
    """清理用户自定义话术：过滤 prompt injection token，截断至 500 字符。"""
    # 过滤可能干扰工作流的控制 token
    cleaned = re.sub(r'\[STEP_(DONE|FAILED):[^\]]*\]', '', raw or "")
    return cleaned.strip()[:500]


def build_login_check_prompt(state: dict) -> str:
    account_info = state.get("account_name", "").strip()
    account_section = f"【账号信息】{account_info}" if account_info else "【账号信息】未提供"
    target_url = state.get("platform_url", "").strip() or state.get("platform", "")
    shot = screenshot_instruction()
    return f"""你是一个专业的招聘助手，请执行「市场人才探索」任务的第1步：验证平台持久登录状态。

【目标平台】{state.get("platform", "")}
【企业端地址】{target_url or '未提供'}
{account_section}
【持久会话键】{state.get("browser_session_key", "")}

【本步骤要求】
1. 优先打开企业端地址 `{target_url or state.get("platform", "")}`，不要跳到普通官网首页。
2. 如果页面看起来空白、过期、或落在旧 tab，先刷新当前企业端地址，再检查登录态。
3. {shot}
4. 判断是否已登录，优先检查以下强信号：
   - 用户头像、账号昵称、退出登录或切换账号入口
   - 企业名称、企业工作台菜单、人才搜索/简历管理入口
   - 已进入企业工作台业务页，而不是登录页
   - 若已登录 → 直接输出 [STEP_DONE:login_check]
   - 若未登录、跳回登录页、出现验证码/扫码/密码校验 → 截图并输出 [STEP_FAILED:login_check]

【注意事项】
- 这是业务主工作流，不负责重新绑定账号
- 仅验证当前持久浏览器 session 是否仍然可用
- 不要切换账号，不要重新走完整登录流程
- 不要因为落在企业工作台的消息页或搜索结果页就误判失败，只要能确认企业登录态即可判定成功

{_browser_rules(state)}

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

{_browser_rules(state)}

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

{_browser_rules(state)}

完成后输出：[STEP_DONE:collect_profiles]
无法完成输出：[STEP_FAILED:collect_profiles]"""


def build_initiate_contact_prompt(state: dict) -> str:
    shot = screenshot_instruction()
    company_name = state.get("company_name", "我们公司")
    job_title = state.get("job_title", "")
    salary_min = state.get("job_salary_min", "")
    salary_max = state.get("job_salary_max", "")
    limit = state.get("message_send_limit", 10)
    min_score = state.get("min_match_score", 60)

    # 使用用户自定义话术（如有），否则使用默认模板
    raw_custom = state.get("custom_message") or ""
    sanitized = _sanitize_custom_message(raw_custom)
    if sanitized:
        message_template = sanitized
    else:
        message_template = (
            f"您好！我是{company_name}的招聘负责人。\n"
            f"我们正在招聘{job_title}岗位，薪资范围{salary_min}K-{salary_max}K。\n"
            f"看到您的背景和我们的岗位非常匹配，想了解一下您是否有兴趣进一步沟通？"
        )

    # 应用层截断：从已采集的候选人中取 top-N（按匹配度降序），防止 LLM 超限发送
    accumulated = state.get("accumulated_text", "")
    all_candidates = parse_candidate_list(accumulated, source="", job_id=None)
    qualified = [c for c in all_candidates if (c.get("ai_match_score") or 0) >= min_score]
    qualified.sort(key=lambda c: c.get("ai_match_score") or 0, reverse=True)
    target_candidates = qualified[:limit]

    if target_candidates:
        candidate_lines = "\n".join([
            f"{i + 1}. {c.get('name', '?')}（匹配度 {c.get('ai_match_score', '?')}分，"
            f"{c.get('position', '')}{'@ ' + c.get('company', '') if c.get('company') else ''}）"
            for i, c in enumerate(target_candidates)
        ])
        candidate_section = f"【本次发送目标 — 共 {len(target_candidates)} 人，按匹配度排序】\n{candidate_lines}\n\n仅向以上名单中的候选人发送消息，不得扩展范围。"
    else:
        candidate_section = f"【本次发送目标】搜索结果中匹配度≥{min_score}分的候选人（最多 {limit} 人）"

    return f"""你是一个专业的招聘助手，请执行第4步：主动沟通。

【目标平台】{state.get("platform", "")}
【企业名称】{company_name}

【职位信息】
- 职位名称：{job_title}
- 工作地点：{state.get("job_location", "不限")}
- 薪资范围：{salary_min}K - {salary_max}K

{candidate_section}

【本步骤要求】
1. 按上方名单逐一向候选人发送消息
2. 发送招聘问候消息
3. 邀请候选人进一步了解和沟通
4. {shot}

【消息话术】
{message_template}

【消息发送上限】本次最多发送 {limit} 条消息，达到上限后立即停止，不再继续发送。

【注意事项】
- 每条消息发送间隔 5-10 秒，避免触发风控
- 语气专业友好，不要过度推销
- 不做出公司未授权的薪资承诺
- 记录已沟通的候选人数量

{_browser_rules(state)}

完成后输出：[STEP_DONE:initiate_contact]
无法完成输出：[STEP_FAILED:initiate_contact]"""
