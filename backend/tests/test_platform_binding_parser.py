from parsers.platform_binding_parser import parse_platform_binding_output


def test_parse_platform_binding_output_accepts_lowercase_login_step():
    parsed = parse_platform_binding_output(
        "[LOGIN_STATE:LOGGED_IN]\n"
        "[LOGIN_STEP:login_check]\n"
        "[LOGIN_REASON:企业工作台已加载，用户 znk7nljh3 已登录]\n"
        "[LOGIN_ACCOUNT_NAME:znk7nljh3]"
    )

    assert parsed is not None
    assert parsed.state == "LOGGED_IN"
    assert parsed.step_key == "login_check"
    assert parsed.reason == "企业工作台已加载，用户 znk7nljh3 已登录"
    assert parsed.account_name == "znk7nljh3"
