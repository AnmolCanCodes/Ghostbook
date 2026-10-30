"""Masks secrets before text is sent to a cloud provider."""
import re
from collections.abc import Callable

MASK = "[REDACTED]"

_KEYWORDS = r"(?:password|passwd|pwd|passcode|pass|pin|secret|token|api[\s_-]?key)"
_KEYWORD_RE = re.compile(
    rf"\b({_KEYWORDS})\b((?:[ \t]*[:=][ \t]*|[ \t]+-[ \t]+|[ \t]+is(?:[ \t]*:)?[ \t]+))(\S+)",
    re.IGNORECASE,
)
_URL_PARAM_RE = re.compile(
    r"([?&][A-Za-z_]*(?:token|key|password|secret|auth)[A-Za-z_]*=)([^&\s#]+)",
    re.IGNORECASE,
)
_CARD_RE = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")
_AADHAAR_RE = re.compile(r"(?<![\d+])(?<!\d[ -])\d{4}[ -]?\d{4}[ -]?\d{4}(?![ -]?\d)")
_PAN_RE = re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b")
_LONG_TOKEN_RE = re.compile(
    r"(?<![A-Za-z0-9+/=])"
    r"(?=[A-Za-z0-9+/=]*\d)(?=[A-Za-z0-9+/=]*[A-Za-z])"
    r"[A-Za-z0-9+/=]{24,}(?![A-Za-z0-9+/=])"
)
_OTP_AFTER_RE = re.compile(
    r"\b(otp|code|verification|verify)\b([^\n\d]{0,30}?)(?<![\d\-/.])(\d{4,8})(?![\d\-/.])",
    re.IGNORECASE,
)
_OTP_BEFORE_RE = re.compile(
    r"(?<![\d\-/.])(\d{4,8})(?![\d\-/.])(?=[^\n\d]{0,30}\b(?:otp|code|verification)\b)",
    re.IGNORECASE,
)


def luhn_valid(digits: str) -> bool:
    """Luhn checksum for a string of digits."""
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def redact(text: str) -> tuple[str, int]:
    """Return (clean_text, redaction_count). Ordinary emails and usernames are kept."""
    count = 0

    def apply(pattern: re.Pattern[str], repl: Callable[[re.Match[str]], str | None], source: str) -> str:
        def wrapper(match: re.Match[str]) -> str:
            nonlocal count
            replacement = repl(match)
            if replacement is None:
                return match.group(0)
            count += 1
            return replacement

        return pattern.sub(wrapper, source)

    def url_param(m: re.Match[str]) -> str | None:
        return None if m.group(2) == MASK else m.group(1) + MASK

    def keyword(m: re.Match[str]) -> str | None:
        return None if MASK in m.group(3) else m.group(1) + m.group(2) + MASK

    def card(m: re.Match[str]) -> str | None:
        digits = re.sub(r"\D", "", m.group(0))
        return MASK if 13 <= len(digits) <= 19 and luhn_valid(digits) else None

    out = apply(_URL_PARAM_RE, url_param, text)
    out = apply(_KEYWORD_RE, keyword, out)
    out = apply(_CARD_RE, card, out)
    out = apply(_AADHAAR_RE, lambda m: MASK, out)
    out = apply(_PAN_RE, lambda m: MASK, out)
    out = apply(_LONG_TOKEN_RE, lambda m: MASK, out)
    out = apply(_OTP_AFTER_RE, lambda m: m.group(1) + m.group(2) + MASK, out)
    out = apply(_OTP_BEFORE_RE, lambda m: MASK, out)
    return out, count