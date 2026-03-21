"""
招聘平台目录定义。

首版仅支持 6 个国内招聘平台，全部使用预置企业端地址。
"""

from __future__ import annotations

from typing import Literal, TypedDict

PlatformKey = Literal[
    "boss_zhipin",
    "58",
    "liepin",
    "zhilian",
    "51job",
    "lagou",
]

LoginMethod = Literal["phone", "qr", "password"]


class PlatformCatalogItem(TypedDict):
    key: PlatformKey
    name: str
    enterprise_url: str
    recommended_login_method: LoginMethod
    supported_login_methods: list[LoginMethod]
    hints: list[str]


PLATFORM_CATALOG: dict[PlatformKey, PlatformCatalogItem] = {
    "boss_zhipin": {
        "key": "boss_zhipin",
        "name": "BOSS直聘",
        "enterprise_url": "https://www.zhipin.com/web/geek/job",
        "recommended_login_method": "phone",
        "supported_login_methods": ["phone", "qr", "password"],
        "hints": [
            "优先使用手机号验证码登录企业端。",
            "若出现扫码登录，请等待后台返回二维码截图。",
            "如遇滑块或风控弹窗，允许有限纠偏后失败退出。",
        ],
    },
    "58": {
        "key": "58",
        "name": "58同城",
        "enterprise_url": "https://passport.58.com/login/?path=http%3A%2F%2Fvip.58.com",
        "recommended_login_method": "phone",
        "supported_login_methods": ["phone", "qr", "password"],
        "hints": [
            "优先尝试手机号验证码登录。",
            "企业端入口可能跳转到 vip 子域名，应以登录后企业台为准。",
        ],
    },
    "liepin": {
        "key": "liepin",
        "name": "猎聘",
        "enterprise_url": "https://vip.liepin.com/",
        "recommended_login_method": "qr",
        "supported_login_methods": ["phone", "qr", "password"],
        "hints": [
            "猎聘企业端常见扫码登录，二维码需要持续刷新。",
            "若切回个人求职页，应自动纠偏回企业端。",
        ],
    },
    "zhilian": {
        "key": "zhilian",
        "name": "智联招聘",
        "enterprise_url": "https://i.zhaopin.com/",
        "recommended_login_method": "phone",
        "supported_login_methods": ["phone", "qr", "password"],
        "hints": [
            "验证码和二次校验较常见，需要显式进入等待态。",
            "验证登录时需确认企业工作台菜单或账号头像。",
        ],
    },
    "51job": {
        "key": "51job",
        "name": "前程无忧 / 51job",
        "enterprise_url": "https://ehire.51job.com/",
        "recommended_login_method": "password",
        "supported_login_methods": ["phone", "qr", "password"],
        "hints": [
            "51job 企业端常见账号密码登录，必要时转入二次验证。",
            "若检测到短信校验，前端应切换到验证码提交通道。",
        ],
    },
    "lagou": {
        "key": "lagou",
        "name": "拉勾招聘",
        "enterprise_url": "https://easy.lagou.com/",
        "recommended_login_method": "phone",
        "supported_login_methods": ["phone", "qr", "password"],
        "hints": [
            "优先尝试手机号登录，二维码为候补方式。",
            "若登录后仍停留在营销页，应继续校验进入企业后台。",
        ],
    },
}


def list_platform_catalog() -> list[PlatformCatalogItem]:
    return list(PLATFORM_CATALOG.values())


def get_platform_catalog_item(platform: str) -> PlatformCatalogItem:
    item = PLATFORM_CATALOG.get(platform)  # type: ignore[arg-type]
    if not item:
        raise KeyError(f"未知平台: {platform}")
    return item


def get_platform_name(platform: str) -> str:
    try:
        return get_platform_catalog_item(platform)["name"]
    except KeyError:
        return platform
