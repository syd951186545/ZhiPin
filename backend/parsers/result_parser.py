"""
AI 输出结构化解析器

从 OpenClaw 返回的自然语言文本中提取结构化数据。
所有解析器都是防御性的：格式不完美时返回部分结果。
"""

import json
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def extract_between_markers(text: str, start: str, end: str) -> Optional[str]:
    """提取两个标记之间的文本"""
    pattern = re.escape(start) + r"([\s\S]*?)" + re.escape(end)
    match = re.search(pattern, text)
    return match.group(1).strip() if match else None


# ── 工作流 1：发布招聘公告 ────────────────────────────────


def parse_announcement(text: str) -> Optional[str]:
    """提取 AI 生成的招聘公告内容"""
    return extract_between_markers(text, "【AI公告内容】", "【/AI公告内容】")


def parse_publish_result(text: str) -> dict:
    """提取发布结果信息"""
    result_text = extract_between_markers(text, "【发布结果】", "【/发布结果】")
    if not result_text:
        return {}

    result = {}
    for line in result_text.split("\n"):
        line = line.strip().lstrip("- ")
        if "：" in line:
            key, value = line.split("：", 1)
            key = key.strip()
            value = value.strip()
            if "平台" in key:
                result["platform"] = value
            elif "账号" in key:
                result["account"] = value
            elif "职位名称" in key:
                result["job_title"] = value
            elif "状态" in key:
                result["status"] = value
            elif "链接" in key:
                result["url"] = value

    return result


# ── 工作流 2 & 3：候选人提取 ──────────────────────────────


def parse_candidate_list(text: str, source: str = "openclaw_auto", job_id: Optional[str] = None) -> list[dict]:
    """
    从 AI 输出中提取候选人列表。

    尝试多种格式解析:
    1. JSON 代码块格式
    2. 【候选人列表】标记格式
    3. 逐行解析格式
    """
    candidates = []

    # 尝试 1: JSON 代码块
    json_match = re.search(r"```json\s*([\s\S]*?)```", text)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if isinstance(data, list):
                for item in data:
                    candidates.append(_normalize_candidate(item, source, job_id))
                if candidates:
                    logger.info(f"从 JSON 代码块解析到 {len(candidates)} 个候选人")
                    return candidates
        except json.JSONDecodeError:
            pass

    # 尝试 2: 【候选人列表】标记
    list_text = extract_between_markers(text, "【候选人列表】", "【/候选人列表】")
    if list_text:
        # 尝试整体 JSON 解析
        try:
            data = json.loads(list_text)
            if isinstance(data, list):
                for item in data:
                    candidates.append(_normalize_candidate(item, source, job_id))
                if candidates:
                    logger.info(f"从候选人列表标记解析到 {len(candidates)} 个候选人")
                    return candidates
        except json.JSONDecodeError:
            pass

        # 逐个候选人块解析
        blocks = re.split(r"\n(?=\d+[\.\)、]|\-\s*候选人|\-\s*姓名)", list_text)
        for block in blocks:
            candidate = _parse_candidate_block(block, source, job_id)
            if candidate:
                candidates.append(candidate)

    # 尝试 3: 按编号分块解析全文
    if not candidates:
        blocks = re.split(r"\n(?=\d+[\.\)、]\s*)", text)
        for block in blocks:
            candidate = _parse_candidate_block(block, source, job_id)
            if candidate:
                candidates.append(candidate)

    logger.info(f"共解析到 {len(candidates)} 个候选人")
    return candidates


def _normalize_candidate(item: dict, source: str, job_id: Optional[str]) -> dict:
    """规范化候选人字典"""
    # 匹配度评分: 支持多种字段名
    score = (
        item.get("ai_match_score")
        or item.get("match_score")
        or item.get("score")
        or item.get("匹配度")
    )
    if isinstance(score, str):
        # 提取数字
        num = re.search(r"\d+", score)
        score = int(num.group()) if num else None

    # AI 分析
    analysis = item.get("ai_analysis") or {}
    if not isinstance(analysis, dict):
        analysis = {"summary": str(analysis)}

    # 合并 strengths/weaknesses 等字段到 analysis
    for field_name in ("strengths", "weaknesses", "recommendation", "summary"):
        if field_name in item and field_name not in analysis:
            analysis[field_name] = item[field_name]

    return {
        "name": item.get("name") or item.get("姓名") or "未知",
        "email": item.get("email") or item.get("邮箱"),
        "phone": item.get("phone") or item.get("电话") or item.get("手机"),
        "source": source,
        "stage": "new",
        "job_id": job_id,
        "ai_match_score": score,
        "ai_analysis": analysis if analysis else None,
        "notes": item.get("notes") or item.get("备注"),
        "tags": item.get("tags") or item.get("技能标签") or [],
        "metadata": {
            k: v for k, v in item.items()
            if k not in ("name", "姓名", "email", "邮箱", "phone", "电话", "手机",
                         "score", "match_score", "ai_match_score", "匹配度",
                         "ai_analysis", "strengths", "weaknesses", "recommendation",
                         "summary", "notes", "备注", "tags", "技能标签")
        },
    }


def _parse_candidate_block(block: str, source: str, job_id: Optional[str]) -> Optional[dict]:
    """从文本块中解析单个候选人"""
    block = block.strip()
    if not block or len(block) < 10:
        return None

    info: dict = {}

    # 提取字段
    patterns = {
        "name": [r"姓名[：:]\s*(.+)", r"名[称字][：:]\s*(.+)"],
        "phone": [r"(?:电话|手机|联系方式)[：:]\s*([\d\-+]+)"],
        "email": [r"(?:邮箱|Email)[：:]\s*(\S+@\S+)"],
        "score": [r"(?:匹配度|评分|分数)[：:]\s*(\d+)"],
        "position": [r"(?:当前职位|职位)[：:]\s*(.+)"],
        "company": [r"(?:当前公司|公司)[：:]\s*(.+)"],
        "experience": [r"(?:工作年限|经验)[：:]\s*(.+)"],
    }

    for field_name, field_patterns in patterns.items():
        for pattern in field_patterns:
            match = re.search(pattern, block)
            if match:
                info[field_name] = match.group(1).strip()
                break

    if not info.get("name"):
        # 尝试从第一行提取名字
        first_line = block.split("\n")[0]
        name_match = re.search(r"[\d\.\)、]\s*(.{2,10})(?:\s|$|[，,])", first_line)
        if name_match:
            info["name"] = name_match.group(1).strip()

    if not info.get("name"):
        return None

    score = None
    if info.get("score"):
        try:
            score = int(info["score"])
        except ValueError:
            pass

    return {
        "name": info["name"],
        "email": info.get("email"),
        "phone": info.get("phone"),
        "source": source,
        "stage": "new",
        "job_id": job_id,
        "ai_match_score": score,
        "ai_analysis": None,
        "tags": [],
        "metadata": {
            k: v for k, v in info.items()
            if k not in ("name", "email", "phone", "score")
        },
    }


# ── 工作流 3：简历分析结果提取 ─────────────────────────────


def parse_resume_analysis(
    text: str,
    source: str = "openclaw_auto",
    job_id: Optional[str] = None,
    min_match_score: int = 0,
) -> list[dict]:
    """
    从简历筛选 AI 输出中提取分析结果。
    与 parse_candidate_list 类似，但额外提取 AI 分析详情。
    """
    candidates = parse_candidate_list(text, source, job_id)

    # 尝试提取更详细的分析信息
    analysis_text = extract_between_markers(text, "【分析结果】", "【/分析结果】")
    if analysis_text:
        try:
            data = json.loads(analysis_text)
            if isinstance(data, list):
                for i, item in enumerate(data):
                    if i < len(candidates):
                        candidates[i]["ai_analysis"] = {
                            "strengths": item.get("strengths", item.get("优势", [])),
                            "weaknesses": item.get("weaknesses", item.get("不足", [])),
                            "summary": item.get("summary", item.get("总结", "")),
                            "recommendation": item.get("recommendation", item.get("推荐等级", "")),
                        }
                        if item.get("score") or item.get("匹配度"):
                            score = item.get("score") or item.get("匹配度")
                            if isinstance(score, str):
                                num = re.search(r"\d+", score)
                                score = int(num.group()) if num else None
                            candidates[i]["ai_match_score"] = score
        except (json.JSONDecodeError, TypeError):
            pass

    return candidates
