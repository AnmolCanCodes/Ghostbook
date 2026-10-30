# Ghostbook

**Find the ghosts haunting your inbox.**

Ghostbook is a map of your online accounts, not a vault of passwords. It remembers which email you signed up with, which username you picked, and how to reset access, so the next time you forget, "Forgot password" works on the first click. Gemma, an open-weight model, turns messy notes into structured entries, answers questions about your accounts in plain language, and writes a haunting report about the forgotten accounts lurking in your life.

Built for the Hacktoberfest Open-Source AI Challenge, Week 4: **Ghost in the Machine**.

---

## The problem

You signed up for hundreds of apps. For most of them you can no longer answer three questions:

1. Which email did I use?
2. What was my username?
3. How do I get back in?

So you click "Forgot password", guess an email, get a "no account found" message, and repeat. Every forgotten account is also a ghost: an old login that still holds your data and still sits in someone's database.

## What it does

- **Account map.** Store site, email, username, login method, reset route, last used date, and notes.
- **Paste to account.** Paste a signup email or a rough note and Gemma extracts a structured entry for you to review and save.
- **Ask your graveyard.** Ask "which email did I use for my bank?" and get an answer grounded in your own entries.
- **Haunting report.** Plain-code checks find stale accounts, one email tied to too many accounts, and entries with no recovery route. Gemma then writes a short, spooky summary.
- **Hybrid AI.** Run Gemma locally with Ollama, through a cloud API (Groq or Google AI Studio), or local-first with a cloud fallback.

## What it never does

- It **never stores passwords**. There is no password field anywhere in the schema.
- It never auto-fills, scrapes, or logs in to anything on your behalf.
- It does not replace a real password manager. Use one (Bitwarden, KeePass, and others) for secrets. Ghostbook answers the question those tools do not: which account, which email, which username.

---

## Architecture

```
                  +----------------------------+
                  |   React + Vite frontend    |
                  |  list / add / ask / report |
                  +-------------+--------------+
                                | /api  (Bearer session token, held in memory only)
                  +-------------v--------------+
                  |        FastAPI backend     |
                  |                            |
                  |  routers: auth, accounts,  |
                  |           ai, haunting     |
                  |                            |
                  |  security.py  scrypt + Fernet
                  |  redaction.py strip secrets before any cloud call
                  |  llm.py       provider-agnostic client
                  +------+---------------+-----+
                         |               |
              +----------v---+     +-----v------------------------+
              |   SQLite     |     |  LLM provider (by LLM_MODE)  |
              | encrypted    |     |  local : Ollama              |
              | fields only  |     |  cloud : Groq / Google AI    |
              +--------------+     |  hybrid: local, then cloud   |
                                   +------------------------------+
```

All three providers speak the OpenAI-compatible chat API, so one small client with a swappable `base_url` covers every mode. Gemma is the model in all of them.

## Privacy model

Privacy depends on where you run the AI, so the app is explicit about it. The UI always shows a badge: `AI: local` or `AI: cloud (Groq)`.

| Mode | What leaves your machine |
|------|--------------------------|
| `local` | Nothing. Gemma runs through Ollama on your own hardware. |
| `cloud` | Only what each feature needs, listed below. |
| `hybrid` | Local first. Cloud is used only if the local server is unreachable. |
| `off` | Nothing. AI features are disabled and plain search still works. |

What cloud mode sends, per feature:

| Feature | Sent to the cloud provider |
|---------|----------------------------|
| Paste to account | The text you pasted, after secrets are masked (password-like strings, OTPs, card numbers, Aadhaar-style numbers) |
| Ask your graveyard | Your question plus up to `CLOUD_MAX_CONTEXT_ACCOUNTS` candidate entries chosen by a local keyword pre-filter: site, email, username, login method. Notes are excluded unless `CLOUD_SEND_NOTES=true` |
| Haunting report | Aggregate counts only, such as "14 stale accounts, 1 email on 22 accounts". No account details |

Cloud providers have their own data retention policies. Read your provider's terms before putting real data through it. If that is not acceptable, use `local` mode or `off`.

## Security design

- **Master passphrase.** Set once at first run. It is never stored.
- **Key derivation.** The passphrase goes through scrypt with a random per-vault salt to produce a 32-byte key.
- **Encryption at rest.** Every account field is encrypted with Fernet (AES with HMAC-SHA256 authentication). The database holds ciphertext only.
- **Key handling.** The derived key lives only in server memory for the life of a session. It is never written to disk and it is dropped when the vault locks.
- **Sessions.** Random tokens, kept in server memory, expire after `SESSION_TTL_MINUTES` of inactivity. The frontend keeps the token in memory, not in localStorage.
- **Brute force.** Repeated wrong passphrases trigger a temporary lockout.
- **Search.** Because everything is encrypted, search decrypts entries in memory per request. This is fine at personal scale (hundreds of entries).

**Honest threat model.** The server holds the key while the vault is unlocked, so whoever runs the server could read your data. That is why this project is designed to run on your own machine. If you host a public demo, use fake data only. Client-side encryption, where the server never sees plaintext, is on the roadmap.

## Tech stack

- **Frontend:** React, Vite
- **Backend:** FastAPI, SQLAlchemy, Pydantic v2
- **Database:** SQLite (encrypted fields)
- **Crypto:** `cryptography` (scrypt, Fernet)
- **AI:** Gemma via Ollama, Groq, or Google AI Studio, through the `openai` client

## Project structure

```
ghost-accounts/
├── README.md
├── .env.example
├── .gitignore
├── docs/
│   └── architecture.md
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, router wiring
│   │   ├── config.py          # typed settings loaded from .env
│   │   ├── database.py        # engine, session, Base
│   │   ├── models.py          # Account, VaultMeta
│   │   ├── schemas.py         # request and response models
│   │   ├── security.py        # scrypt, Fernet, sessions, lockout
│   │   ├── deps.py            # auth dependency (requires unlocked session)
│   │   ├── routers/
│   │   │   ├── auth.py        # setup, unlock, lock, status
│   │   │   ├── accounts.py    # CRUD and plain search
│   │   │   ├── ai.py          # parse, ask
│   │   │   └── haunting.py    # report
│   │   └── services/
│   │       ├── llm.py         # local / cloud / hybrid client
│   │       ├── prompts.py     # system prompts and JSON schemas
│   │       ├── redaction.py   # masks secrets before cloud calls
│   │       └── haunting.py    # rule-based checks
│   └── tests/
│       ├── test_security.py
│       ├── test_redaction.py
│       └── test_haunting.py
└── frontend/
    ├── package.json
    ├── vite.config.js         # dev proxy: /api -> http://localhost:8000
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js             # fetch wrapper, in-memory token
        └── components/
            ├── UnlockScreen.jsx
            ├── AccountList.jsx
            ├── AccountForm.jsx
            ├── PasteToAccount.jsx
            ├── AskBox.jsx
            ├── HauntingReport.jsx
            └── AiBadge.jsx
```

## Getting started

### Prerequisites

- Python 3.11+
- Node 18+
- An API key from [Groq](https://console.groq.com/keys) or [Google AI Studio](https://aistudio.google.com/), or Ollama installed for local mode

### 1. Configure

```bash
cp .env.example .env
```

Open `.env` and set at least:

```
LLM_MODE=cloud
CLOUD_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=<a Gemma model ID that Groq currently serves>
```

### 2. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs are at http://localhost:8000/docs.

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, create your master passphrase, and add your first account.

### 4. Run the tests

```bash
cd backend
pytest
```

## Configuration

Everything is configured through `.env`. See `.env.example` for the full list with comments. The important switches:

| Variable | Purpose |
|----------|---------|
| `LLM_MODE` | `local`, `cloud`, `hybrid`, or `off` |
| `CLOUD_PROVIDER` | `groq` or `google` |
| `CLOUD_SEND_NOTES` | Whether notes may be sent to the cloud (default `false`) |
| `SESSION_TTL_MINUTES` | Idle time before the vault locks |
| `STALE_ACCOUNT_DAYS` | Age at which an unused account counts as a ghost |

## API overview

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/auth/status` | Is the vault set up, locked, and which AI mode is active |
| POST | `/api/auth/setup` | First run: create the master passphrase |
| POST | `/api/auth/unlock` | Unlock and receive a session token |
| POST | `/api/auth/lock` | Lock and drop the key from memory |
| GET | `/api/accounts` | List accounts, optional `?q=` plain search |
| POST | `/api/accounts` | Create an account |
| PUT | `/api/accounts/{id}` | Update an account |
| DELETE | `/api/accounts/{id}` | Delete an account |
| POST | `/api/ai/parse` | Extract a structured entry from pasted text (returned for review, not auto-saved) |
| POST | `/api/ai/ask` | Natural language question over your accounts |
| GET | `/api/haunting` | Ghost report: findings plus a Gemma summary |

## Why open innovation matters here

Account details are about as personal as data gets: where you have signed up, with which identity. Using an open-weight model means that data can stay on your own machine when you choose local mode, and the same code runs against a hosted Gemma when your hardware cannot handle one. You can swap models, providers, or hosting with an environment variable and no code change, and nothing is locked to a single vendor.

## Roadmap

- Client-side encryption so the server never sees plaintext
- Import from browser CSV exports (site and username only, passwords discarded on import)
- Reminders for accounts that need a periodic login to avoid deletion
- Export and backup of the encrypted database
- A Día de los Muertos mode: a "digital ofrenda" listing accounts a trusted person would need to know about

## Hacktoberfest note

This project was started and built during the Hacktoberfest Open-Source AI Challenge Week 4 window (October 26 to 31, 2026).

## License

MIT