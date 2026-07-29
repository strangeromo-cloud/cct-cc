"""
Lark (Feishu) custom-bot webhook client.

Posts the daily AI news digest as an interactive card to a Lark group.
The same webhook can be used by GitHub Actions for failure alerts (see the
workflow YAML) — that path sends a plain text message and doesn't touch
this module.

Webhook URL comes from the LARK_WEBHOOK env var (config.LARK_WEBHOOK).
Works for both Lark international (open.larksuite.com) and Feishu China
(open.feishu.cn) — same bot/v2/hook API.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import requests

logger = logging.getLogger(__name__)

TZ_SHANGHAI = timezone(timedelta(hours=8))

CATEGORY_ORDER = ["model_product", "business", "policy_risk"]
CATEGORY_LABELS = {
    "model_product": "模型 / 产品",
    "business": "商业应用",
    "policy_risk": "政策 / 风险",
}


def _fmt_item(it: dict) -> str:
    """One news item as Lark markdown: linked title + summary."""
    title = (it.get("title_zh") or it.get("title") or "").strip()
    url = (it.get("resolved_url") or it.get("link") or "").strip()
    summary = (it.get("summary") or "").strip()
    src = (it.get("source") or "").strip()

    head = f"[{title}]({url})" if url else title
    lines = [f"**{head}**"]
    if summary:
        lines.append(summary)
    if src:
        lines.append(f"<font color='grey'>来源：{src}</font>")
    return "\n".join(lines)


def build_digest_card(digest: dict, title: str) -> dict:
    """Build the Lark interactive-card payload for a digest."""
    by_category = digest.get("by_category", {})
    elements: list[dict] = []

    for cat in CATEGORY_ORDER:
        items = by_category.get(cat, [])
        if not items:
            continue
        elements.append({
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"**【{CATEGORY_LABELS[cat]}】**"},
        })
        for it in items:
            elements.append({"tag": "div", "text": {"tag": "lark_md", "content": _fmt_item(it)}})
        elements.append({"tag": "hr"})

    if elements and elements[-1].get("tag") == "hr":
        elements.pop()  # drop trailing divider

    if not elements:
        elements = [{"tag": "div", "text": {"tag": "lark_md", "content": "今日暂无新闻。"}}]

    now = datetime.now(TZ_SHANGHAI)
    elements.append({
        "tag": "note",
        "elements": [{"tag": "plain_text", "content": f"CFO Control Tower · {now.strftime('%Y-%m-%d %H:%M')} · 共 {digest.get('total', 0)} 条"}],
    })

    return {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "template": "blue",
                "title": {"tag": "plain_text", "content": title},
            },
            "elements": elements,
        },
    }


def send_digest_to_lark(webhook: str, digest: dict, title: str) -> dict:
    """
    POST the digest card to the Lark webhook.
    Returns {sent: bool, error: str | None}.
    """
    if not webhook:
        return {"sent": False, "error": "LARK_WEBHOOK not configured"}
    payload = build_digest_card(digest, title)
    try:
        r = requests.post(webhook, json=payload, timeout=20)
        r.raise_for_status()
        data = r.json()
        # Lark returns {"code":0,...} on success; nonzero code = error.
        if isinstance(data, dict) and data.get("code") not in (0, None):
            return {"sent": False, "error": f"Lark API code={data.get('code')}: {data.get('msg')}"}
        logger.info("Digest posted to Lark")
        return {"sent": True, "error": None}
    except Exception as e:
        logger.warning(f"Lark post failed: {type(e).__name__}: {e}")
        return {"sent": False, "error": f"{type(e).__name__}: {e}"}


def send_text_to_lark(webhook: str, text: str) -> dict:
    """POST a plain text message (used for ad-hoc alerts)."""
    if not webhook:
        return {"sent": False, "error": "LARK_WEBHOOK not configured"}
    try:
        r = requests.post(webhook, json={"msg_type": "text", "content": {"text": text}}, timeout=20)
        r.raise_for_status()
        return {"sent": True, "error": None}
    except Exception as e:
        return {"sent": False, "error": f"{type(e).__name__}: {e}"}
