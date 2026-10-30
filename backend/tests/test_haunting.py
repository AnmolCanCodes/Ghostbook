from datetime import date, datetime, timedelta, timezone

from app.schemas import AccountOut, LoginMethod
from app.services.haunting import analyze_accounts, compute_score, fallback_summary

TODAY = date(2026, 10, 31)
NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def acct(id: int, site: str = "Site", **kw) -> AccountOut:
    base = dict(
        id=id, site=site, email=None, username=None, login_method=LoginMethod.other,
        reset_route=None, last_used=TODAY, notes=None, created_at=NOW, updated_at=NOW,
    )
    base.update(kw)
    return AccountOut(**base)


def kinds(findings, kind):
    return [f for f in findings if f.kind == kind]


def test_stale_medium_and_high_with_boundary():
    accounts = [
        acct(1, "A", last_used=TODAY - timedelta(days=180)),
        acct(2, "B", last_used=TODAY - timedelta(days=181)),
        acct(3, "C", last_used=TODAY - timedelta(days=361)),
    ]
    findings, stats = analyze_accounts(accounts, TODAY, 180, 15)
    stale = kinds(findings, "stale_account")
    assert {f.severity: f.account_ids for f in stale} == {"medium": [2], "high": [3]}
    assert stats.stale_count == 2


def test_unknown_usage_is_grouped():
    accounts = [acct(i, f"S{i}", last_used=None) for i in (1, 2, 3)]
    findings, stats = analyze_accounts(accounts, TODAY)
    found = kinds(findings, "unknown_usage")
    assert len(found) == 1 and found[0].severity == "low" and found[0].account_ids == [1, 2, 3]
    assert stats.unknown_usage_count == 3


def test_email_concentration_over_limit_only():
    accounts = [acct(i, f"S{i}", email="Me@Example.com" if i % 2 else "me@example.com") for i in range(1, 5)]
    findings, stats = analyze_accounts(accounts, TODAY, 180, 3)
    found = kinds(findings, "email_concentration")
    assert len(found) == 1 and found[0].severity == "medium" and len(found[0].account_ids) == 4
    assert stats.top_email_count == 4
    assert not kinds(analyze_accounts(accounts[:3], TODAY, 180, 3)[0], "email_concentration")


def test_missing_reset_route_grouped():
    accounts = [
        acct(1, "A", login_method=LoginMethod.email_password),
        acct(2, "B", login_method=LoginMethod.email_password),
        acct(3, "C", login_method=LoginMethod.email_password, reset_route="email link"),
        acct(4, "D", login_method=LoginMethod.google),
    ]
    findings, stats = analyze_accounts(accounts, TODAY)
    found = kinds(findings, "missing_reset_route")
    assert len(found) == 1 and found[0].account_ids == [1, 2] and found[0].severity == "low"
    assert stats.missing_reset_route_count == 2


def test_duplicate_site_case_insensitive():
    accounts = [acct(1, "Netflix"), acct(2, "NETFLIX"), acct(3, "Spotify")]
    findings, stats = analyze_accounts(accounts, TODAY)
    found = kinds(findings, "duplicate_site")
    assert len(found) == 1 and found[0].account_ids == [1, 2]
    assert stats.duplicate_site_count == 1


def test_score_values_and_cap():
    one = [acct(1, last_used=TODAY - timedelta(days=200))]
    assert analyze_accounts(one, TODAY)[1].score == 3
    assert analyze_accounts([acct(1)], TODAY)[1].score == 0
    many = [acct(i, f"S{i}", last_used=TODAY - timedelta(days=500)) for i in range(1, 30)]
    findings, stats = analyze_accounts(many, TODAY)
    assert sum(6 * len(f.account_ids) for f in findings) > 100
    assert stats.score == 100 and compute_score(findings) == 100


def test_fallback_summary_is_nonempty_and_has_no_dashes():
    _, stats = analyze_accounts([acct(1, last_used=None)], TODAY)
    text = fallback_summary(stats)
    assert text and "\u2014" not in text
    assert fallback_summary(analyze_accounts([], TODAY)[1])