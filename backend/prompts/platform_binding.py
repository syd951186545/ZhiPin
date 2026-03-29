"""
平台账号绑定/验证/解绑 Prompt 模板。
"""

from __future__ import annotations

from config import get_settings
from services.platform_catalog import get_platform_catalog_item, get_platform_name
from services.platform_session_store import resolve_runtime_browser_profile


def _browser_rules(profile: str) -> str:
    normalized = resolve_runtime_browser_profile(profile)
    return (
        "【浏览器工具强制要求】\n"
        f"- 所有 browser 工具调用都必须显式使用 `target=\"host\"` 和 `profile=\"{normalized}\"`\n"
        "- 禁止使用默认 sandbox browser\n"
        "- 如果当前 profile 还没有活动标签页，第一步必须先用 browser navigate 打开目标地址，再执行 snapshot / click / type\n"
        "- 导航成功前不要调用 browser snapshot、browser click、browser type 等依赖现有页面上下文的工具\n"
        "- 打开目标页后优先使用 browser snapshot / browser act / browser screenshot 完成检查"
    )


def _structured_output_contract() -> str:
    media_mount = get_settings().openclaw_media_mount.rstrip("/")
    return f"""【结构化输出要求】
你必须在输出末尾包含以下结构化标记之一：
- [LOGIN_STATE:LOGGED_IN]
- [LOGIN_STATE:AWAIT_SMS]
- [LOGIN_STATE:AWAIT_QR]
- [LOGIN_STATE:AWAIT_PASSWORD_2FA]
- [LOGIN_STATE:FAILED]
- [LOGIN_STATE:LOGGED_OUT]（仅解绑场景使用）

并同时输出：
- [LOGIN_STEP:当前步骤英文标识]
- [LOGIN_REASON:20字以内原因或下一步提示]
- [LOGIN_IDENTIFIER:手机号或账号的脱敏形式，可选]
- [LOGIN_ACCOUNT_NAME:页面上读取到的账号名，可选]

如有截图，必须遵守以下规则：
- 只能使用浏览器内置截图能力，不要使用 shell、exec 或 /tmp 临时截图
- 优先直接输出截图工具返回的 image_url 或 markdown 图片链接，不要输出本地文件路径
- 如果截图工具只能提供文件路径，截图必须位于稳定媒体目录 {media_mount}/browser/ 下
- 禁止输出 /tmp 或 /home 等本地绝对路径。"""


def _platform_hints(platform: str) -> str:
    try:
        item = get_platform_catalog_item(platform)
        hints = item.get("hints", [])
        if hints:
            return "【平台注意事项】\n" + "\n".join(f"- {h}" for h in hints)
    except KeyError:
        pass
    return ""


def build_verify_prompt(account: dict) -> str:
    platform_name = get_platform_name(account.get("platform", ""))
    browser_profile = resolve_runtime_browser_profile(account.get("browser_session_key", ""))
    return f"""你是招聘平台企业端登录验证助手。

【任务类型】验证账号登录状态
【目标平台】{platform_name}
【企业端地址】{account.get("platform_url", "")}
【账号别名】{account.get("name", "")}
【账号脱敏标识】{account.get("login_identifier_masked", "") or '未提供'}
【持久会话键】{account.get("browser_session_key", "")}

【本轮目标】
1. 打开企业端首页或工作台。
2. 若页面元素看起来过期、空白或加载异常，先刷新页面（navigate 到同一 URL），等待加载完成后再检查。
3. 判断是否已登录，优先查找以下不易伪造的标识（按优先级）：
   - 用户头像或账号昵称显示
   - 退出登录/切换账号入口
   - 企业名称或企业工作台菜单
   - 招聘相关的功能入口（发布职位、候选人列表等）
4. 如果页面上能明确读取到当前登录账号名、昵称或手机号展示，请一并输出到 [LOGIN_ACCOUNT_NAME:...]。
5. 若登录有效且能确认企业身份，输出 LOGGED_IN。
6. 若会话失效、跳回登录页或需要重新认证，输出 FAILED。

{_browser_rules(browser_profile)}

{_platform_hints(account.get("platform", ""))}

{_structured_output_contract()}
"""


def build_correction_prompt(
    original_prompt: str,
    attempt: int,
    last_error: str,
    last_state: str,
    browser_profile: str = "openclaw",
) -> str:
    normalized = resolve_runtime_browser_profile(browser_profile)
    return f"""{original_prompt}

【纠偏要求 - 第 {attempt} 次尝试】
上一次执行遇到问题：{last_error or '未能解析出结构化输出标记'}
上一次输出状态：{last_state or '无'}

请按以下优先级纠偏：
1. 如果报错包含 `tab not found`、空白 profile 或没有活动标签页，先 browser navigate 到企业端地址，再继续后续步骤。
2. 确认只有一个标签页处于活跃状态，多余标签页应关闭。
3. 刷新页面快照以获取最新 DOM 状态。
4. 若页面有弹窗、遮罩层或滑块验证，先处理弹窗再继续主流程。
5. 重新选择目标元素，不要复用上次的选择器。
6. 务必在输出末尾包含结构化标记。
7. 所有 browser 工具调用都必须显式使用 `target="host"` 和 `profile="{normalized}"`，禁止使用默认 sandbox browser。
8. 若需要截图，优先返回截图工具生成的 image_url，不要输出本地路径。

{_structured_output_contract()}
"""


def build_unbind_prompt(account: dict) -> str:
    platform_name = get_platform_name(account.get("platform", ""))
    browser_profile = resolve_runtime_browser_profile(account.get("browser_session_key", ""))
    return f"""你是招聘平台企业端登出助手。

【任务类型】解绑账号
【目标平台】{platform_name}
【企业端地址】{account.get("platform_url", "")}
【账号别名】{account.get("name", "")}
【持久会话键】{account.get("browser_session_key", "")}

【本轮目标】
1. 进入已登录页面，寻找退出登录/切换账号入口。
2. 执行登出，并确认页面回到登录态或游客态。
3. 若站内找不到登出入口或登出按钮不可用，请执行以下清理操作：
   a. 在浏览器控制台执行 JavaScript 清除当前域名的 cookies：
      document.cookie.split(';').forEach(c => document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/');
   b. 清除 localStorage 和 sessionStorage：
      localStorage.clear(); sessionStorage.clear();
   c. 刷新页面并确认回到登录/游客态。
4. 若以上所有方式都无法确认已登出，输出 FAILED 并写明原因。
5. 如需截图，优先返回截图工具生成的 image_url；只有工具无法提供 URL 时才允许稳定媒体路径。

{_browser_rules(browser_profile)}

【输出规则】
- 成功登出后输出 [LOGIN_STATE:LOGGED_OUT]，原因写”已登出，等待重新绑定”。
- 若无法确认已登出，输出 [LOGIN_STATE:FAILED] 并写明原因。
- 不允许输出 LOGGED_IN。

{_structured_output_contract()}
"""
