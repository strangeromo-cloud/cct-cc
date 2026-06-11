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
            original_title = (it.get("title") or "").strip()
            title_zh       = (it.get("title_zh") or "").strip()
            summary_zh     = (it.get("summary") or "").strip()
            summary_en     = (it.get("summary_en") or "").strip()
            lang = it.get("lang", "en")

            # ── Card body layout ───────────────────────────────────────
            # English-source items show ENGLISH original first (title + EN summary
            # as the primary content), then a Chinese "译文" block beneath.
            # Chinese-source items render Chinese only (no translation pair).
            if lang == "en":
                primary_title    = original_title
                primary_summary  = summary_en
                secondary_title  = title_zh
                secondary_summary = summary_zh
            else:
                primary_title    = original_title
                primary_summary  = summary_zh
                secondary_title  = ""
                secondary_summary = ""

            # Prefer the resolved publisher URL if we have it, else the input link
            href = escape(it.get("resolved_url") or it.get("link", ""), quote=True)
            src = escape(it.get("source", ""))
            date = escape(_fmt_date(it.get("publishedAt", "")))
            tag = escape(zh_label)
            lang_badge = "EN" if lang == "en" else "中"
            lang_bg = "#EEF4FA" if lang == "en" else "#FDEEEE"
            lang_color = "#0073CE" if lang == "en" else "#E12726"
            src_provenance = it.get("summary_src", "")
            src_label_html = ""
            if src_provenance == "llm":
                src_label_html = '<span style="margin-left:6px;font-size:10px;color:#888;font-style:italic">AI 摘要</span>'
            elif src_provenance == "aihot":
                src_label_html = '<span style="margin-left:6px;font-size:10px;color:#888;font-style:italic">AI HOT 摘要</span>'
            elif src_provenance == "rss":
                src_label_html = '<span style="margin-left:6px;font-size:10px;color:#bbb;font-style:italic">RSS</span>'

            # Build the optional secondary (Chinese) translation block — only
            # rendered for EN items where we actually have a Chinese translation.
            translation_block = ""
            if secondary_title or secondary_summary:
                parts: list[str] = []
                parts.append(
                    '<div style="display:flex;align-items:center;margin:10px 0 4px 0">'
                    '<span style="display:inline-block;padding:1px 6px;border-radius:3px;'
                    f'background:#FDEEEE;color:#E12726;font-size:10px;font-weight:600;'
                    'margin-right:8px">译文</span>'
                    '<span style="flex:1;height:1px;background:#EEE;display:inline-block"></span>'
                    '</div>'
                )
                if secondary_title:
                    parts.append(
                        f'<div style="font-size:13px;color:#444;font-weight:600;line-height:1.4;margin-bottom:4px">'
                        f'{escape(secondary_title)}</div>'
                    )
                if secondary_summary:
                    parts.append(
                        f'<div style="font-size:12px;color:#666;line-height:1.55;margin-bottom:8px">'
                        f'{escape(secondary_summary)}</div>'
                    )
                translation_block = "\n".join(parts)

            # Per-item Lenovo insight block — styled like the translation block
            # but with a red "联想视角" label and a tinted background to set it
            # apart as analysis rather than reporting.
            insight_block = ""
            lenovo_insight = (it.get("lenovo_insight") or "").strip()
            if lenovo_insight:
                insight_block = (
                    '<div style="margin:10px 0 4px 0;padding:10px 12px;background:#FBF4F4;'
                    'border-left:3px solid #E12726;border-radius:0 6px 6px 0">'
                    '<div style="font-size:11px;font-weight:700;color:#E12726;margin-bottom:4px">联想视角</div>'
                    f'<div style="font-size:12px;color:#555;line-height:1.6">{escape(lenovo_insight)}</div>'
                    '</div>'
                )

            cards.append(f"""
<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #E5E5E5;border-radius:8px;background:#fff">
  <div style="margin-bottom:6px">
    <a href="{href}" style="color:#111;text-decoration:none;font-weight:600;font-size:14px;line-height:1.45">{escape(primary_title)}</a>
  </div>
  {f'<div style="font-size:13px;color:#333;line-height:1.55;margin-bottom:8px">{escape(primary_summary)}</div>' if primary_summary else ''}
  {translation_block}
  {insight_block}
  <div style="font-size:11px;color:#888;margin:6px 0 6px 0">
    <span>{date}</span>
    <span style="margin:0 6px">·</span>
    <span>{src}</span>
    <span style="margin:0 6px">·</span>
    <span style="display:inline-block;padding:1px 6px;border-radius:3px;background:{lang_bg};color:{lang_color};font-weight:600">{lang_badge}</span>
    <span style="margin-left:6px;display:inline-block;padding:1px 6px;border-radius:3px;background:{color}15;color:{color};font-weight:600">#{tag}</span>
    {src_label_html}
  </div>
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
      CFO Control Tower · Automated digest · 数据源：Google News RSS + AI HOT
    </div>
  </div>
</body>
</html>"""


def _render_github_section(repos: list[dict]) -> str:
    """Render the GitHub trending repos section. Returns '' if no repos."""
    if not repos:
        return ""
    color = "#8B5CF6"  # purple accent, distinct from the 3 news categories
    header = (
        f'<h2 style="margin:28px 0 10px;padding:6px 12px;border-left:4px solid {color};'
        f'font-size:16px;color:#111;">GitHub 趋势项目'
        f' <span style="color:#888;font-weight:400;font-size:13px">({len(repos)})</span></h2>'
    )
    cards: list[str] = []
    for r in repos:
        name = escape(r.get("full_name") or "")
        url = escape(r.get("html_url") or "", quote=True)
        desc_en = escape((r.get("description") or "").strip())
        desc_zh = escape((r.get("description_zh") or "").strip())
        stars = r.get("stars") or 0
        lang = escape(r.get("language") or "")
        try:
            stars_str = f"{int(stars):,}"
        except (TypeError, ValueError):
            stars_str = str(stars)

        meta_bits = [f'★ {stars_str}']
        if lang:
            meta_bits.append(lang)
        meta = '<span style="margin:0 6px">·</span>'.join(
            f'<span>{b}</span>' for b in meta_bits
        )

        zh_html = ""
        if desc_zh:
            zh_html = (
                f'<div style="font-size:12px;color:#666;line-height:1.5;margin-top:3px">'
                f'<span style="display:inline-block;padding:0 5px;border-radius:3px;'
                f'background:#FDEEEE;color:#E12726;font-size:10px;font-weight:600;'
                f'margin-right:6px">译</span>{desc_zh}</div>'
            )

        cards.append(f"""
<div style="margin:0 0 14px;padding:12px 14px;border:1px solid #E5E5E5;border-radius:8px;background:#fff">
  <div style="margin-bottom:4px">
    <a href="{url}" style="color:#111;text-decoration:none;font-weight:600;font-size:14px;line-height:1.45">{name}</a>
  </div>
  <div style="font-size:11px;color:#888;margin-bottom:6px">{meta}</div>
  {f'<div style="font-size:13px;color:#333;line-height:1.5">{desc_en}</div>' if desc_en else ''}
  {zh_html}
  <a href="{url}" style="font-size:11px;color:{color};text-decoration:none;display:inline-block;margin-top:6px">查看仓库 →</a>
</div>
""")
    return header + "\n".join(cards)


def _render_insight_section(insight: str | None) -> str:
    """Render the Lenovo strategic insight box. Returns '' if no insight."""
    if not insight or not insight.strip():
        return ""
    # Convert "• ..." bullet lines into styled rows.
    rows: list[str] = []
    for line in insight.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip a leading bullet marker if present; we render our own.
        for marker in ("•", "-", "·", "*"):
            if line.startswith(marker):
                line = line[len(marker):].strip()
                break
        rows.append(
            f'<div style="display:flex;margin:0 0 8px 0;line-height:1.6">'
            f'<span style="color:#E12726;margin-right:8px;flex-shrink:0">•</span>'
            f'<span style="font-size:13px;color:#333">{escape(line)}</span></div>'
        )
    body = "\n".join(rows)
    return f"""
<div style="margin:28px 0 0 0;padding:16px 18px;background:#FBF4F4;border:1px solid #F3DADA;border-radius:10px">
  <div style="font-size:15px;font-weight:700;color:#E12726;margin-bottom:10px">对联想集团的启示</div>
  {body}
</div>"""


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
            original_title = it.get("title", "")
            title_zh = (it.get("title_zh") or "").strip()
            summary_en = (it.get("summary_en") or "").strip()
            summary_zh = (it.get("summary") or "").strip()
            lang = it.get("lang", "en")

            lines.append(f"• {original_title}  [{_fmt_date(it.get('publishedAt', ''))}]")
            lines.append(f"  {it.get('source')}  #{zh}  ({lang})")
            if lang == "en" and summary_en:
                lines.append(f"  {summary_en}")
            elif summary_zh and lang != "en":
                lines.append(f"  {summary_zh}")
            if lang == "en" and (title_zh or summary_zh):
                lines.append(f"  [译文]")
                if title_zh:
                    lines.append(f"  {title_zh}")
                if summary_zh:
                    lines.append(f"  {summary_zh}")
            lenovo_insight = (it.get("lenovo_insight") or "").strip()
            if lenovo_insight:
                lines.append(f"  [联想视角] {lenovo_insight}")
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
    from_name: str = "AI News Digest",
) -> dict:
    """
    Compose + send the digest email via Gmail SMTP.

    `recipient` may be a single address or a comma-separated list.
    All recipients get the same email in one "To:" line (not BCC).
    `from_name` is the sender display name — vary it per edition so Outlook's
    message list doesn't show the same sender for the plain vs insight emails.

    Returns:
        { "sent": bool, "recipients": [str], "total": int, "subject": str, "error": str | None }
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
    return _send_email(subject, html, text, smtp_user, smtp_password, recipients,
                       from_name=from_name, extra={"total": total, "subject": subject})


def _send_email(subject, html, text, smtp_user, smtp_password, recipients,
                from_name="AI News Digest", extra=None):
    """Shared Gmail SMTP send. Returns {sent, recipients, error, **extra}."""
    extra = extra or {}
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, smtp_user))
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
        logger.info(f"Email '{subject}' sent to {recipients}")
        return {"sent": True, "recipients": recipients, "error": None, **extra}
    except Exception as e:
        logger.exception(f"Failed to send email: {e}")
        return {"sent": False, "recipients": recipients, "error": f"{type(e).__name__}: {e}", **extra}


# ══════════════════════════════════════════════════════════════════════
#  GitHub weekly report email
# ══════════════════════════════════════════════════════════════════════

def render_github_weekly_html(report: dict) -> str:
    """Render the weekly GitHub trending report as HTML."""
    repos = report.get("repos", [])
    week_label = escape(report.get("week_label", ""))
    generated_at = escape(_fmt_date(report.get("generated_at", datetime.now().isoformat())))
    color = "#8B5CF6"  # purple

    cards: list[str] = []
    for i, r in enumerate(repos, start=1):
        name = escape(r.get("full_name") or "")
        url = escape(r.get("html_url") or "", quote=True)
        desc_en = escape((r.get("description") or "").strip())
        detail_zh = escape((r.get("detail_zh") or r.get("description_zh") or "").strip())
        lang = escape(r.get("language") or "")
        try:
            wk = f"{int(r.get('stars_this_week') or 0):,}"
            tot = f"{int(r.get('total_stars') or 0):,}"
        except (TypeError, ValueError):
            wk, tot = str(r.get("stars_this_week")), str(r.get("total_stars"))

        meta_bits = [f'本周 +{wk}★']
        if tot and tot != "0":
            meta_bits.append(f'总计 {tot}★')
        if lang:
            meta_bits.append(lang)
        meta = '<span style="margin:0 6px">·</span>'.join(f'<span>{b}</span>' for b in meta_bits)

        detail_html = ""
        if detail_zh:
            detail_html = (
                f'<div style="font-size:13px;color:#444;line-height:1.65;margin-top:6px">{detail_zh}</div>'
            )

        cards.append(f"""
<div style="margin:0 0 16px;padding:14px 16px;border:1px solid #E5E5E5;border-radius:8px;background:#fff">
  <div style="margin-bottom:4px">
    <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;
      background:{color};color:#fff;border-radius:50%;font-size:12px;font-weight:700;margin-right:8px">{i}</span>
    <a href="{url}" style="color:#111;text-decoration:none;font-weight:600;font-size:15px;line-height:1.45">{name}</a>
  </div>
  <div style="font-size:11px;color:#888;margin:4px 0 6px 30px">{meta}</div>
  {f'<div style="font-size:12px;color:#777;line-height:1.5;margin:0 0 0 30px;font-style:italic">{desc_en}</div>' if desc_en else ''}
  <div style="margin-left:30px">{detail_html}</div>
  <div style="margin:8px 0 0 30px"><a href="{url}" style="font-size:11px;color:{color};text-decoration:none">查看仓库 →</a></div>
</div>
""")
    body = "\n".join(cards) if cards else '<p style="color:#888;font-size:13px">本周暂无符合条件的 AI 项目。</p>'

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>GitHub AI Weekly</title></head>
<body style="margin:0;padding:20px;background:#F7F7F7;font-family:'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#222">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;padding:22px 24px 30px;box-shadow:0 1px 4px rgba(0,0,0,0.05)">
    <div style="border-bottom:1px solid #EEE;padding-bottom:14px;margin-bottom:16px">
      <div style="font-size:20px;font-weight:700;color:#111">
        GitHub AI 周报
        <span style="font-size:14px;font-weight:500;color:#666;margin-left:8px">{week_label}</span>
      </div>
      <div style="font-size:12px;color:#888;margin-top:4px">
        本周 star 增长最快的 AI 开源项目 · 生成时间：{generated_at} · 数据源：github.com/trending
      </div>
    </div>
    {body}
    <div style="border-top:1px solid #EEE;margin-top:22px;padding-top:12px;font-size:11px;color:#999;text-align:center">
      CFO Control Tower · Weekly GitHub digest · 排序依据：本周新增 star 数
    </div>
  </div>
</body>
</html>"""


def render_github_weekly_text(report: dict) -> str:
    """Plain-text fallback for the weekly GitHub report."""
    repos = report.get("repos", [])
    lines = [f"GitHub AI 周报 ({report.get('week_label', '')})", ""]
    for i, r in enumerate(repos, start=1):
        wk = r.get("stars_this_week") or 0
        tot = r.get("total_stars") or 0
        lines.append(f"{i}. {r.get('full_name')}  (本周 +{wk}★, 总计 {tot}★, {r.get('language') or '—'})")
        if r.get("description"):
            lines.append(f"   {r['description']}")
        if r.get("detail_zh"):
            lines.append(f"   {r['detail_zh']}")
        lines.append(f"   {r.get('html_url')}")
        lines.append("")
    return "\n".join(lines)


def send_github_weekly(report: dict, smtp_user: str, smtp_password: str, recipient: str) -> dict:
    """Compose + send the weekly GitHub report via Gmail SMTP."""
    if not smtp_user or not smtp_password:
        return {"sent": False, "recipients": [], "error": "SMTP not configured"}
    recipients = _parse_recipients(recipient)
    if not recipients:
        return {"sent": False, "recipients": [], "error": "DIGEST_RECIPIENT not configured"}

    n = len(report.get("repos", []))
    subject = f"[GitHub AI 周报] {report.get('week_label', '')} · Top {n}"
    html = render_github_weekly_html(report)
    text = render_github_weekly_text(report)
    return _send_email(subject, html, text, smtp_user, smtp_password, recipients,
                       from_name="GitHub AI Weekly", extra={"count": n})
