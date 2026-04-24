"""
Gmail SMTP email sender for daily AI news digest.

Uses stdlib smtplib + email.mime. No extra dependencies.
Requires a Gmail App Password (not the account password):
  https://support.google.com/accounts/answer/185833
"""
from __future__ import annotations

import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate
from html import escape

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587

# Subject dates are always rendered in Beijing time so the digest matches
# the recipient's "today" regardless of the server's container timezone.
TZ_SHANGHAI = timezone(timedelta(hours=8))

# Category labels shown in the email body — Chinese only
CATEGORY_LABELS = {
    "model_product": "模型 / 产品",
    "business":      "商业应用",
    "policy_risk":   "政策 / 风险",
}

# Accent color per category
CATEGORY_COLORS = {
    "model_product": "#0073CE",   # blue
    "business":      "#00A650",   # green
    "policy_risk":   "#E12726",   # red
}

CATEGORY_ORDER = ["model_product", "business", "policy_risk"]


def _fmt_date(iso_str: str) -> str:
    """Render ISO date as 'YYYY-MM-DD HH:MM' in Shanghai time."""
    try:
        from datetime import timezone, timedelta
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        shanghai = dt.astimezone(timezone(timedelta(hours=8)))
        return shanghai.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return iso_str[:16]


def render_digest_html(digest: dict) -> str:
    """
    Render the digest dict produced by ai_news.fetch_ai_news() into HTML.

    Expected shape:
        {
          "generated_at": "...",
          "window_hours": 24,
          "total": N,
          "by_category": { "ai_products": [items], ... }
        }
    """
    by_category = digest.get("by_category", {})
    total = digest.get("total", 0)
    window = digest.get("window_hours", 24)
    generated_at = _fmt_date(digest.get("generated_at", datetime.now().isoformat()))
    # Short date+weekday for the header title, in Beijing time
    now_bj = datetime.now(TZ_SHANGHAI)
    weekday_cn = "一二三四五六日"[now_bj.weekday()]
    title_date = f"{now_bj.strftime('%Y-%m-%d')} · 周{weekday_cn}"

    blocks: list[str] = []
    for cat in CATEGORY_ORDER:
        items = by_category.get(cat, [])
        if not items:
            # Per product requirement: skip empty categories entirely — no
            # placeholder rows, no "no items today" filler.
            continue

        zh_label = CATEGORY_LABELS[cat]
        color = CATEGORY_COLORS[cat]

        header = (
            f'<h2 style="margin:28px 0 10px;padding:6px 12px;border-left:4px solid {color};'
            f'font-size:16px;color:#111;">'
            f'{zh_label}'
            f' <span style="color:#888;font-weight:400;font-size:13px">({len(items)})</span></h2>'
        )

        cards: list[str] = []
        for it in items:
            original_title = it.get("title", "") or ""
            # For EN-language items we show the LLM-translated Chinese title and
            # keep the original as a smaller secondary line so the reader still
            # sees the real publisher headline before clicking through.
            title_zh = (it.get("title_zh") or "").strip()
            display_title = escape(title_zh or original_title)
            original_subtitle = ""
            lang = it.get("lang", "en")
            if title_zh and original_title and lang == "en":
                original_subtitle = (
                    f'<div style="font-size:11px;color:#999;font-style:italic;'
                    f'margin:2px 0 6px 0;line-height:1.4">{escape(original_title)}</div>'
                )

            # Prefer the resolved publisher URL if we have it, else the Google News link
            href = escape(it.get("resolved_url") or it.get("link", ""), quote=True)
            src = escape(it.get("source", ""))
            # `summary` is the Chinese LLM summary when available, else RSS fallback
            summary_text = it.get("summary") or it.get("description", "")
            summary = escape(summary_text)
            date = escape(_fmt_date(it.get("publishedAt", "")))
            tag = escape(zh_label)
            lang_badge = "EN" if lang == "en" else "中"
            lang_bg = "#EEF4FA" if lang == "en" else "#FDEEEE"
            lang_color = "#0073CE" if lang == "en" else "#E12726"
            src_provenance = it.get("summary_src", "")
            src_label_html = ""
            if src_provenance == "llm":
                src_label_html = '<span style="margin-left:6px;font-size:10px;color:#888;font-style:italic">AI 摘要</span>'
            elif src_provenance == "rss":
                src_label_html = '<span style="margin-left:6px;font-size:10px;color:#bbb;font-style:italic">RSS</span>'

            cards.append(f"""
<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #E5E5E5;border-radius:8px;background:#fff">
  <div style="margin-bottom:6px">
    <a href="{href}" style="color:#111;text-decoration:none;font-weight:600;font-size:14px;line-height:1.45">{display_title}</a>
  </div>
  {original_subtitle}
  <div style="font-size:11px;color:#888;margin-bottom:6px">
    <span>{date}</span>
    <span style="margin:0 6px">·</span>
    <span>{src}</span>
    <span style="margin:0 6px">·</span>
    <span style="display:inline-block;padding:1px 6px;border-radius:3px;background:{lang_bg};color:{lang_color};font-weight:600">{lang_badge}</span>
    <span style="margin-left:6px;display:inline-block;padding:1px 6px;border-radius:3px;background:{color}15;color:{color};font-weight:600">#{tag}</span>
    {src_label_html}
  </div>
  {f'<div style="font-size:13px;color:#333;line-height:1.55;margin-bottom:8px">{summary}</div>' if summary else ''}
  <a href="{href}" style="font-size:11px;color:{color};text-decoration:none">阅读原文 →</a>
</div>
""")

        blocks.append(header + "\n".join(cards))

    body_inner = "\n".join(blocks)

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Daily AI News Digest</title>
</head>
<body style="margin:0;padding:20px;background:#F7F7F7;font-family:'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#222">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;padding:22px 24px 30px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
    <div style="border-bottom:1px solid #EEE;padding-bottom:14px;margin-bottom:10px">
      <div style="font-size:20px;font-weight:700;color:#111">
        Daily AI News Digest
        <span style="font-size:14px;font-weight:500;color:#666;margin-left:8px">{title_date}</span>
      </div>
      <div style="font-size:12px;color:#888;margin-top:4px">
        生成时间：{generated_at} · 时间窗口：近 {window} 小时 · 共 {total} 条
      </div>
    </div>
    {body_inner}
    <div style="border-top:1px solid #EEE;margin-top:22px;padding-top:12px;font-size:11px;color:#999;text-align:center">
      CFO Control Tower · Automated digest · 数据源：Google News RSS
    </div>
  </div>
</body>
</html>"""


def render_digest_text(digest: dict) -> str:
    """Plain-text fallback."""
    by_category = digest.get("by_category", {})
    lines: list[str] = [f"Daily AI News Digest ({digest.get('total', 0)} items)", ""]
    for cat in CATEGORY_ORDER:
        items = by_category.get(cat, [])
        if not items:
            continue  # skip empty categories
        zh = CATEGORY_LABELS[cat]
        lines.append(f"=== {zh} ({len(items)}) ===")
        for it in items:
            display_title = (it.get("title_zh") or "").strip() or it.get("title", "")
            lines.append(f"• {display_title}  [{_fmt_date(it.get('publishedAt', ''))}]")
            if it.get("title_zh") and it.get("lang") == "en":
                lines.append(f"  (原: {it.get('title')})")
            lines.append(f"  {it.get('source')}  #{zh}  ({it.get('lang')})")
            summary = it.get("summary") or it.get("description", "")
            if summary:
                lines.append(f"  {summary}")
            lines.append(f"  {it.get('resolved_url') or it.get('link')}")
            lines.append("")
        lines.append("")
    return "\n".join(lines)


def _parse_recipients(raw: str) -> list[str]:
    """Split a comma/semicolon/whitespace-separated recipient string into a list."""
    if not raw:
        return []
    # Accept ',' ';' or newline as separators; strip whitespace; drop empties.
    parts = raw.replace(";", ",").replace("\n", ",").split(",")
    return [p.strip() for p in parts if p.strip()]


def send_digest(
    digest: dict,
    smtp_user: str,
    smtp_password: str,
    recipient: str,
    subject_prefix: str = "[AI News Digest]",
) -> dict:
    """
    Compose + send the digest email via Gmail SMTP.

    `recipient` may be a single address or a comma-separated list.
    All recipients get the same email in one "To:" line (not BCC).

    Returns:
        { "sent": bool, "recipients": [str], "total": int, "error": str | None }
    """
    if not smtp_user or not smtp_password:
        return {"sent": False, "recipients": [], "total": 0,
                "error": "SMTP_USER or SMTP_PASSWORD not configured"}

    recipients = _parse_recipients(recipient)
    if not recipients:
        return {"sent": False, "recipients": [], "total": 0,
                "error": "DIGEST_RECIPIENT not configured"}

    total = digest.get("total", 0)
    # Always format the subject date in Beijing time so the recipient sees the
    # correct "today" regardless of where the container runs (Zeabur is UTC).
    now_bj = datetime.now(TZ_SHANGHAI)
    weekday_cn = "一二三四五六日"[now_bj.weekday()]
    today_label = f"{now_bj.strftime('%Y-%m-%d')} (周{weekday_cn})"
    subject = f"{subject_prefix} {today_label} · {total} items"

    html = render_digest_html(digest)
    text = render_digest_text(digest)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr(("AI News Digest", smtp_user))
    msg["To"] = ", ".join(recipients)
    msg["Date"] = formatdate(localtime=True)
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, recipients, msg.as_string())
        logger.info(f"Digest email sent to {recipients} ({total} items)")
        return {"sent": True, "recipients": recipients, "total": total, "error": None}
    except Exception as e:
        logger.exception(f"Failed to send digest email: {e}")
        return {"sent": False, "recipients": recipients, "total": total, "error": f"{type(e).__name__}: {e}"}
