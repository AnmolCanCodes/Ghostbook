from app.services.redaction import MASK, luhn_valid, redact


def test_masks_passwords():
    out, count = redact("my password is hunter2 for netflix")
    assert "hunter2" not in out and MASK in out and count >= 1
    out, _ = redact("Password: S3cr3t!")
    assert "S3cr3t" not in out
    out, _ = redact("pin = 4821")
    assert "4821" not in out


def test_masks_otp_codes():
    assert "482913" not in redact("Your verification code is 482913")[0]
    assert "482913" not in redact("482913 is your OTP")[0]


def test_masks_luhn_valid_cards():
    assert luhn_valid("4111111111111111")
    assert "4111" not in redact("card 4111 1111 1111 1111")[0]
    assert "4111" not in redact("card 4111-1111-1111-1111")[0]
    assert "4111" not in redact("card 4111111111111111")[0]


def test_luhn_invalid_number_not_masked_as_card():
    text = "ref 1234 5678 9012 3456"
    assert not luhn_valid("1234567890123456")
    assert redact(text) == (text, 0)


def test_masks_aadhaar_and_pan():
    assert "9012" not in redact("aadhaar 1234 5678 9012")[0]
    assert "123456789012" not in redact("aadhaar 123456789012")[0]
    assert "ABCDE1234F" not in redact("PAN ABCDE1234F")[0]


def test_masks_long_tokens():
    jwt_like = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    hex_token = "a3f9c2d1e4b5a6f7c8d9e0a1b2c3d4e5"
    assert jwt_like not in redact(f"session {jwt_like}")[0]
    assert hex_token not in redact(f"key blob {hex_token}")[0]


def test_masks_url_query_params():
    out, _ = redact("https://x.com/reset?token=abc123&lang=en")
    assert "abc123" not in out and "lang=en" in out


def test_leaves_normal_emails_and_usernames():
    text = "Signed up on netflix.com with john.doe@example.com as johnny_d, last used 2024-03-02"
    assert redact(text) == (text, 0)