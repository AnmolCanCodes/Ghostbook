"""Rule-based haunting checks and score. Pure functions."""
from collections import defaultdict
from collections.abc import Sequence
from datetime import date

from app.schemas import AccountOut, Finding, HauntingStats, LoginMethod

WEIGHTS = {"high": 6, "medium": 3, "low": 1}


def compute_score(findings: Sequence[Finding]) -> int:
    """Sum severity weight times account count, capped at 100."""
    total = sum(WEIGHTS[f.severity] * len(f.account_ids) for f in findings)
    return min(100, total)


def analyze_accounts(
    accounts: Sequence[AccountOut],
    today: date,
    stale_days: int = 180,
    concentration_limit: int = 15,
) -> tuple[list[Finding], HauntingStats]:
    """Run all rules and return (findings, stats)."""
    stale_medium: list[int] = []
    stale_high: list[int] = []
    unknown: list[int] = []
    missing_reset: list[int] = []
    by_email: dict[str, list[int]] = defaultdict(list)
    by_site: dict[str, list[AccountOut]] = defaultdict(list)

    for account in accounts:
        if account.last_used is None:
            unknown.append(account.id)
        else:
            age = (today - account.last_used).days
            if age > 2 * stale_days:
                stale_high.append(account.id)
            elif age > stale_days:
                stale_medium.append(account.id)
        if account.email:
            by_email[account.email.strip().lower()].append(account.id)
        by_site[account.site.strip().lower()].append(account)
        if account.login_method == LoginMethod.email_password and not account.reset_route:
            missing_reset.append(account.id)

    findings: list[Finding] = []
    if stale_high:
        findings.append(Finding(
            kind="stale_account", severity="high",
            title=f"{len(stale_high)} accounts untouched for over {2 * stale_days} days",
            detail="These have been dormant a very long time. Close them or confirm you can still get in.",
            account_ids=stale_high,
        ))
    if stale_medium:
        findings.append(Finding(
            kind="stale_account", severity="medium",
            title=f"{len(stale_medium)} accounts untouched for over {stale_days} days",
            detail="Check whether you still need these and whether login still works.",
            account_ids=stale_medium,
        ))
    for email, ids in sorted(by_email.items()):
        if len(ids) > concentration_limit:
            findings.append(Finding(
                kind="email_concentration", severity="medium",
                title=f"One email is used on {len(ids)} accounts",
                detail=f"{email} is a single point of failure. Losing it would lock you out of all of them.",
                account_ids=ids,
            ))
    if unknown:
        findings.append(Finding(
            kind="unknown_usage", severity="low",
            title=f"{len(unknown)} accounts with no last used date",
            detail="Add a last used date so stale accounts can be spotted.",
            account_ids=unknown,
        ))
    if missing_reset:
        findings.append(Finding(
            kind="missing_reset_route", severity="low",
            title=f"{len(missing_reset)} password logins with no reset route",
            detail="Note how to recover these so Forgot password works on the first click.",
            account_ids=missing_reset,
        ))
    duplicate_sites = 0
    for entries in by_site.values():
        if len(entries) > 1:
            duplicate_sites += 1
            findings.append(Finding(
                kind="duplicate_site", severity="low",
                title=f"{entries[0].site} appears {len(entries)} times",
                detail="Merge or remove the duplicate entries.",
                account_ids=[a.id for a in entries],
            ))

    findings.sort(key=lambda f: -WEIGHTS[f.severity])
    stats = HauntingStats(
        total_accounts=len(accounts),
        stale_count=len(stale_high) + len(stale_medium),
        unknown_usage_count=len(unknown),
        top_email_count=max((len(ids) for ids in by_email.values()), default=0),
        missing_reset_route_count=len(missing_reset),
        duplicate_site_count=duplicate_sites,
        score=compute_score(findings),
    )
    return findings, stats


def fallback_summary(stats: HauntingStats) -> str:
    """Deterministic summary used when AI is off, unavailable or fails."""
    if stats.total_accounts == 0:
        return "Your graveyard is empty. Add the accounts you remember and the ghosts will have nowhere to hide."
    if stats.score == 0:
        return f"No hauntings across {stats.total_accounts} accounts. The graveyard is quiet, keep it that way."
    parts: list[str] = []
    if stats.stale_count:
        parts.append(f"{stats.stale_count} accounts have gone cold")
    if stats.missing_reset_route_count:
        parts.append(f"{stats.missing_reset_route_count} have no recorded reset route")
    if stats.unknown_usage_count:
        parts.append(f"{stats.unknown_usage_count} have no last used date")
    if stats.duplicate_site_count:
        parts.append(f"{stats.duplicate_site_count} sites are listed twice")
    detail = "; ".join(parts) if parts else "a few loose ends are lingering"
    return (
        f"Haunting score {stats.score} out of 100 across {stats.total_accounts} accounts: {detail}. "
        "Start with the oldest dormant accounts, then fill in the missing reset routes."
    )