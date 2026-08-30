"""
In-process job scheduler.

Replaces GitHub Actions' `schedule:` triggers, which are best-effort and had
been firing 5-8 hours late during platform congestion (observed 2026-08-27
onwards). This scheduler lives inside the always-on Zeabur container, so jobs
fire on time.

All triggers are expressed in **UTC** on purpose: it needs no IANA timezone
database in the slim container image, and China observes no DST, so the
mapping is a fixed +8.

    UTC 23:13 daily      -> Beijing 07:13  plain digest
    UTC 23:18 daily      -> Beijing 07:18  insight digest
    UTC 23:18 Sunday     -> Beijing 07:18 Monday  GitHub weekly

`misfire_grace_time` means a container restart around the trigger point does
not lose the run — the job still fires once the app is back, up to an hour
late. `coalesce=True` collapses any backlog into a single run.
"""
from __future__ import annotations

import logging
from datetime import timezone

logger = logging.getLogger(__name__)

# A job may legitimately take minutes (LLM calls); allow a late start rather
# than dropping the run entirely after a restart.
MISFIRE_GRACE_SECONDS = 3600

_scheduler = None  # module-level singleton


def _alert(text: str) -> None:
    """Best-effort Lark alert; never raises."""
    try:
        from config import LARK_WEBHOOK
        if not LARK_WEBHOOK:
            return
        from lark_client import send_text_to_lark
        send_text_to_lark(LARK_WEBHOOK, text)
    except Exception as e:  # noqa: BLE001 - alerting must never break the job
        logger.warning(f"Lark alert failed: {e}")


def _auth() -> str:
    from config import JOB_TOKEN
    return f"Bearer {JOB_TOKEN}"


async def run_daily_digest(with_insight: bool = False) -> None:
    """Fire the daily digest endpoint in-process."""
    label = "联想视角日报" if with_insight else "AI 日报"
    try:
        # Imported lazily: main imports this module at startup, so a top-level
        # import here would be circular.
        from main import api_jobs_ai_news_digest
        result = await api_jobs_ai_news_digest(
            authorization=_auth(),
            hours=24,
            dry_run=False,
            skip_summary=False,
            skip_ai_classifier=False,
            skip_ai_dedup=False,
            with_insight=with_insight,
            skip_lark=False,
            no_email=False,
        )
        email = (result or {}).get("email", {})
        lark = (result or {}).get("lark", {})
        logger.info(
            f"[scheduler] {label} done — email={email.get('sent')} "
            f"lark={lark.get('sent')} total={(result or {}).get('total')}"
        )
        if not email.get("sent") and not email.get("skipped"):
            _alert(f"⚠️ {label} 邮件发送失败\n{email.get('error')}")
    except Exception as e:  # noqa: BLE001
        logger.exception(f"[scheduler] {label} failed")
        _alert(f"🔴 {label} 定时任务异常\n{type(e).__name__}: {e}")


async def run_weekly_github() -> None:
    """Fire the weekly GitHub report endpoint in-process."""
    try:
        from main import api_jobs_github_weekly
        result = await api_jobs_github_weekly(
            authorization=_auth(),
            limit=5,
            dry_run=False,
            skip_enrich=False,
            skip_lark=False,
            no_email=False,
        )
        email = (result or {}).get("email", {})
        lark = (result or {}).get("lark", {})
        logger.info(
            f"[scheduler] GitHub 周报 done — email={email.get('sent')} "
            f"lark={lark.get('sent')} repos={(result or {}).get('repo_count')}"
        )
        if not email.get("sent") and not email.get("skipped"):
            _alert(f"⚠️ GitHub 周报邮件发送失败\n{email.get('error')}")
    except Exception as e:  # noqa: BLE001
        logger.exception("[scheduler] GitHub weekly failed")
        _alert(f"🔴 GitHub 周报定时任务异常\n{type(e).__name__}: {e}")


def start_scheduler() -> None:
    """Register the cron jobs and start the scheduler (idempotent)."""
    global _scheduler
    if _scheduler is not None:
        return

    from config import ENABLE_INTERNAL_SCHEDULER
    if not ENABLE_INTERNAL_SCHEDULER:
        logger.info("[scheduler] disabled via ENABLE_INTERNAL_SCHEDULER")
        return

    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        logger.warning("[scheduler] apscheduler not installed — internal scheduling disabled")
        return

    utc = timezone.utc
    sched = AsyncIOScheduler(
        timezone=utc,
        job_defaults={"coalesce": True, "misfire_grace_time": MISFIRE_GRACE_SECONDS},
    )

    sched.add_job(
        run_daily_digest, CronTrigger(hour=23, minute=13, timezone=utc),
        kwargs={"with_insight": False}, id="daily_digest", replace_existing=True,
    )
    sched.add_job(
        run_daily_digest, CronTrigger(hour=23, minute=18, timezone=utc),
        kwargs={"with_insight": True}, id="daily_digest_insight", replace_existing=True,
    )
    sched.add_job(
        run_weekly_github, CronTrigger(day_of_week="sun", hour=23, minute=18, timezone=utc),
        id="weekly_github", replace_existing=True,
    )

    sched.start()
    _scheduler = sched
    for job in sched.get_jobs():
        logger.info(f"[scheduler] registered {job.id} — next run (UTC) {job.next_run_time}")


def scheduler_status() -> dict:
    """Introspection for the debug endpoint."""
    if _scheduler is None:
        return {"running": False, "jobs": []}
    return {
        "running": _scheduler.running,
        "jobs": [
            {
                "id": j.id,
                "next_run_utc": j.next_run_time.isoformat() if j.next_run_time else None,
                "next_run_beijing": (
                    j.next_run_time.astimezone(
                        __import__("datetime").timezone(__import__("datetime").timedelta(hours=8))
                    ).strftime("%Y-%m-%d %H:%M")
                    if j.next_run_time else None
                ),
            }
            for j in _scheduler.get_jobs()
        ],
    }
