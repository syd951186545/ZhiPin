"""
平台账号绑定/验证/解绑 Prompt 模板。
"""

from __future__ import annotations

from services.platform_catalog import get_platform_name


def _structured_output_contract() -> str:
    return """【结构化输出要求】
你必须在输出末尾包含以下结构化标记之一：
- [LOGIN_STATE:LOGGED_IN]
- [LOGIN_STATE:AWAIT_SMS]
- [LOGIN_STATE:AWAIT_QR]
- [LOGIN_STATE:AWAIT_PASSWORD_2FA]
- [LOGIN_STATE:FAILED]

并同时输出：
- [LOGIN_STEP:当前步骤英文标识]
- [LOGIN_REASON:20字以内原因或下一步提示]
- [LOGIN_IDENTIFIER:手机号或账号的脱敏形式，可选]

如有截图，必须截图当前页面并输出截图文件完整路径。"""


def build_bind_start_prompt(account: dict, payload: dict) -> str:
    platform_name = get_platform_name(account.get("platform", ""))
    method = payload.get("login_method", "")
    phone = payload.get("phone", "")
    login_name = payload.get("login_name", "")
    password_hint = "已提供" if payload.get("password") else "未提供"
    return f"""你是招聘平台企业端登录助手。目标是在有限步骤内把账号绑定到持久浏览器会话。

【任务类型】绑定账号
【目标平台】{platform_name}
【企业端地址】{account.get("platform_url", "")}
【账号别名】{account.get("name", "")}
【绑定方式】{method}
【手机号】{phone or '未提供'}
【账号名】{login_name or '未提供'}
【密码】{password_hint}
【持久会话键】{account.get("browser_session_key", "")}

【执行原则】
1. 只在一个标签页内工作，发现多余标签页则关闭。
2. 若页面漂移或元素失效，刷新快照并重选一次。
3. 若需要用户参与，立即停在对应页面并返回等待态。
4. 不要无限重试；明显失败则返回 FAILED。

【本轮目标】
1. 打开企业端登录页。
2. 按绑定方式优先尝试登录：
   - phone: 输入手机号并推进到验证码阶段；若已登录则直接确认。
   - qr: 切换到扫码登录并返回二维码截图。
   - password: 输入账号密码；若触发二次验证则返回等待态。
3. 判断最终状态并按结构化协议输出。

{_structured_output_contract()}
"""


def build_bind_submit_prompt(account: dict, binding_session: dict, payload: dict) -> str:
    platform_name = get_platform_name(account.get("platform", ""))
    verification_code = payload.get("verification_code", "")
    password = payload.get("password", "")
    secondary_code = payload.get("secondary_code", "")
    return f"""你是招聘平台企业端登录助手。继续上一次未完成的账号绑定。

【任务类型】继续绑定账号
【目标平台】{platform_name}
【企业端地址】{account.get("platform_url", "")}
【账号别名】{account.get("name", "")}
【持久会话键】{account.get("browser_session_key", "")}
【上一状态】{binding_session.get("status", "")}
【验证码】{verification_code or '未提供'}
【二次验证密码】{'已提供' if password else '未提供'}
【二次验证码】{secondary_code or '未提供'}

【本轮目标】
1. 继续当前页面，不要重新开始登录。
2. 若已提供验证码或二次验证信息，则填写并提交。
3. 若仍需等待新的用户动作，则返回对应等待态。
4. 若登录成功，进入企业工作台并确认账号处于已登录状态。

{_structured_output_contract()}
"""


def build_verify_prompt(account: dict) -> str:
    platform_name = get_platform_name(account.get("platform", ""))
    return f"""你是招聘平台企业端登录验证助手。

【任务类型】验证账号登录状态
【目标平台】{platform_name}
【企业端地址】{account.get("platform_url", "")}
【账号别名】{account.get("name", "")}
【账号脱敏标识】{account.get("login_identifier_masked", "") or '未提供'}
【持久会话键】{account.get("browser_session_key", "")}

【本轮目标】
1. 打开企业端首页或工作台。
2. 判断是否已登录，优先查找企业身份标识、账号昵称、工作台菜单、头像、退出入口。
3. 若登录有效，输出 LOGGED_IN。
4. 若会话失效、跳回登录页或需要重新认证，输出 FAILED。

{_structured_output_contract()}
"""


def build_unbind_prompt(account: dict) -> str:
    platform_name = get_platform_name(account.get("platform", ""))
    return f"""你是招聘平台企业端登出助手。

【任务类型】解绑账号
【目标平台】{platform_name}
【企业端地址】{account.get("platform_url", "")}
【账号别名】{account.get("name", "")}
【持久会话键】{account.get("browser_session_key", "")}

【本轮目标】
1. 进入已登录页面，寻找退出登录/切换账号入口。
2. 执行登出，并确认页面回到登录态或游客态。
3. 若站内无法安全登出，也要明确输出 FAILED，由后端更换会话键兜底。

【输出规则】
- 成功登出后输出 [LOGIN_STATE:FAILED]，原因写“已登出，等待重新绑定”。
- 若无法确认已登出，也输出 [LOGIN_STATE:FAILED] 并写明原因。
- 不允许输出 LOGGED_IN。

{_structured_output_contract()}
"""
