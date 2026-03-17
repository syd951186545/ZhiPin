"""
工作流 Prompt 工具函数
"""


def screenshot_instruction() -> str:
    """返回截图指令片段，供各 prompt 模板插入。"""
    return "截图当前页面并输出截图文件的完整路径"
