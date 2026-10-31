# GhostBook Project Guide

A comprehensive guide to understanding, running, and developing GhostBook.

## Table of Contents

1. [Project Overview](#project-overview)
2. [How It Works](#how-it-works)
3. [Core Features](#core-features)
4. [Architecture Deep Dive](#architecture-deep-dive)
5. [Data Flow](#data-flow)
6. [Security Model](#security-model)
7. [AI Integration](#ai-integration)
8. [Development Setup](#development-setup)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

GhostBook is a personal account mapping tool designed to solve the problem of forgotten online accounts. Unlike password managers that store credentials, GhostBook stores the metadata you need to recover access: which email you used, what username you picked, and how to reset your password.

### Key Design Philosophy

- **No Passwords**: GhostBook intentionally does not store passwords
- **Privacy-First**: All data is encrypted at rest
- **Local-First**: Designed to run on your own machine
- **AI-Assisted**: Uses LLMs to parse unstructured text and answer natural language queries
- **Open Innovation**: Uses open-weight models that can run locally or via cloud APIs

---

## How It Works

### User Workflow

1. **First Run Setup**
   - User creates a master passphrase
   - Passphrase is used to derive encryption keys (never stored)
   - Database is initialized with encrypted schema

2. **Adding Accounts**
   - Manual entry: Fill in account details (site, email, username, etc.)
   - AI-assisted: Paste a signup email or notes → AI extracts structured entry → User reviews and saves

3. **Searching Accounts**
   - Plain text search: Filter by site, email, username
   - AI-powered queries: Ask "Which email did I use for Netflix?" → AI searches and answers

4. **Haunting Report**
   - Rule-based analysis finds stale accounts, email concentration, missing recovery routes
   - AI writes a spooky summary of findings

### Technical Workflow

```
User Action → Frontend (React) → API Call → Backend (FastAPI)
    ↓
Security Check (Session Token) → Key Derivation
    ↓
Database Query (SQLite) → Decrypt in Memory
    ↓
[If AI Feature] → LLM Service → Cloud/Local Provider
    ↓
Response → Encrypt (if saving) → Return to Frontend
```

---

## Core Features

### 1. Account Management

**Manual Entry**
- Fields: site, email, username, login method, reset route, last used date, notes
- All fields encrypted with Fernet (AES-256 + HMAC-SHA256)
- CRUD operations via REST API

**AI-Assisted Entry (Paste to Account)**
- Paste unstructured text (signup email, notes, etc.)
- AI extracts structured account entries
- Redaction service masks secrets before sending to cloud
- User reviews before saving

### 2. Search & Query

**Plain Search**
- Keyword search across decrypted account fields
- Fast, no AI required
- Works in all AI modes (including "off")

**AI-Powered Queries (Ask the Graveyard)**
- Natural language questions about your accounts
- Local keyword pre-filter selects candidate accounts
- AI processes question + candidates to generate answer
- Respects privacy settings (notes excluded by default in cloud mode)

### 3. Haunting Report

**Rule-Based Checks**
- Stale accounts (unused for X days)
- Email concentration (one email on too many accounts)
- Missing recovery routes (accounts without reset method)

**AI Summary**
- Aggregate counts sent to AI (no account details)
- AI writes a spooky summary of findings
- Context-aware: "14 ghost accounts haunt your digital graveyard"

### 4. Security Features

**Vault Locking**
- Master passphrase never stored
- Session tokens expire after inactivity
- Manual lock button available
- Brute force protection with temporary lockout

**Encryption**
- scrypt key derivation with per-vault salt
- Fernet encryption for all account fields
- Keys live only in server memory
- Database contains only ciphertext

---

## Architecture Deep Dive

### System Components

#### Frontend (React + Vite)
- **Location**: `ghostbook-frontend/`
- **Framework**: React with Vite for fast development
- **Styling**: Custom CSS with design tokens
- **Key Components**:
  - `UnlockScreen.jsx`: Authentication UI
  - `AccountList.jsx`: Display and manage accounts
  - `AccountForm.jsx`: Manual account entry
  - `PasteToAccount.jsx`: AI-assisted entry
  - `AskBox.jsx`: Natural language queries
  - `HauntingReport.jsx`: Ghost account analysis
  - `AiBadge.jsx`: Shows current AI mode

#### Backend (FastAPI)
- **Location**: `backend/app/`
- **Framework**: FastAPI with SQLAlchemy ORM
- **Key Modules**:
  - `main.py`: Application entry point, CORS, router wiring
  - `config.py`: Environment-based settings
  - `database.py`: SQLite engine and session management
  - `models.py`: SQLAlchemy models (Account, VaultMeta)
  - `schemas.py`: Pydantic request/response models
  - `security.py`: Encryption, sessions, lockout logic
  - `deps.py`: Dependency injection (auth, LLM service)

#### Routers (API Endpoints)
- `auth.py`: Vault setup, unlock, lock, status
- `accounts.py`: CRUD operations, plain search
- `ai.py`: Parse text, ask questions
- `haunting.py`: Generate ghost report

#### Services (Business Logic)
- `llm.py`: Provider-agnostic LLM client with fallback
- `prompts.py`: System prompts and JSON schemas
- `redaction.py`: Secret masking for cloud calls
- `haunting.py`: Rule-based ghost detection

#### Database (SQLite)
- **Location**: `backend/ghostbook.db`
- **Schema**:
  - `accounts`: Encrypted account entries
  - `vault_meta`: Vault initialization state, salt
- **Note**: All sensitive fields are encrypted with Fernet

### Data Models

#### Account Model
```python
class Account(Base):
    id: int (primary key)
    site: str (encrypted)
    email: str (encrypted)
    username: str (encrypted)
    login_method: str (encrypted)
    reset_route: str (encrypted)
    last_used: date (encrypted)
    notes: str (encrypted)
    created_at: datetime
    updated_at: datetime
```

#### VaultMeta Model
```python
class VaultMeta(Base):
    id: int (primary key)
    salt: bytes (for key derivation)
    initialized: bool
    created_at: datetime
```

---

## Data Flow

### Session Management

```
1. User enters master passphrase
   ↓
2. Backend derives key: scrypt(passphrase, salt)
   ↓
3. Backend generates session token (random)
   ↓
4. Backend stores: session_token → derived_key (in-memory)
   ↓
5. Backend returns session token to frontend
   ↓
6. Frontend stores token in memory (not localStorage)
   ↓
7. All subsequent requests include: Authorization: Bearer <token>
   ↓
8. Backend validates token and retrieves key for decryption
```

### Account Creation Flow

```
1. User fills form / pastes text
   ↓
2. Frontend sends POST /api/accounts or /api/ai/parse
   ↓
3. Backend validates session token → retrieves key
   ↓
4. Backend encrypts each field with Fernet(key)
   ↓
5. Backend saves ciphertext to SQLite
   ↓
6. Backend returns success to frontend
```

### AI Query Flow (Ask the Graveyard)

```
1. User asks: "Which email did I use for Netflix?"
   ↓
2. Frontend sends POST /api/ai/ask
   ↓
3. Backend validates session → retrieves key
   ↓
4. Backend loads all accounts → decrypts in memory
   ↓
5. Backend runs local keyword pre-filter (no AI yet)
   ↓
6. Backend selects up to CLOUD_MAX_CONTEXT_ACCOUNTS candidates
   ↓
7. Backend sends question + candidates to LLM provider
   ↓
8. LLM returns: answer + matched_account_ids
   ↓
9. Backend returns answer + filtered IDs to frontend
```

---

## Security Model

### Threat Model

**Assumptions:**
- The attacker has access to the encrypted database file
- The attacker does not have the master passphrase
- The server runs on the user's own machine (not public cloud)

**What's Protected:**
- Database file: All account fields are encrypted
- In-transit data: HTTPS (if deployed) or localhost
- Session tokens: Random, short-lived, in-memory only

**What's Not Protected:**
- While vault is unlocked, the server process can read plaintext
- If someone runs the server, they can access decrypted data
- Cloud AI providers may see data sent to them (configurable)

### Encryption Details

**Key Derivation:**
- Algorithm: scrypt
- Salt: Random per-vault, stored in database
- Output: 32-byte key
- Purpose: Makes brute force attacks expensive

**Field Encryption:**
- Algorithm: Fernet (AES-128-CBC + HMAC-SHA256)
- Key: Derived from master passphrase
- Scope: Each account field encrypted separately
- Verification: HMAC ensures integrity

**Session Management:**
- Token: 32-byte random value
- Storage: Server memory only (not disk)
- TTL: Configurable (default 15 minutes)
- Cleanup: Expired tokens removed automatically

### Privacy Controls

**AI Mode Selection:**
- `local`: Nothing leaves your machine (Ollama)
- `cloud`: Data sent to provider (with redaction)
- `hybrid`: Try local first, fall back to cloud
- `off`: AI disabled, plain search only

**Cloud Data Redaction:**
- Password-like strings masked
- OTP codes masked
- Card numbers masked
- Aadhaar-style numbers masked
- Notes excluded unless `CLOUD_SEND_NOTES=true`

---

## AI Integration

### LLM Providers

**Ollama (Local)**
- Base URL: `http://localhost:11434/v1`
- Model: User-configured (e.g., `gemma2:9b`)
- Privacy: 100% local, no data leaves machine
- Requirement: Ollama installed and running

**Groq (Cloud)**
- Base URL: `https://api.groq.com/openai/v1`
- Model: OpenAI-compatible models (e.g., `openai/gpt-oss-20b`)
- Privacy: Data sent to Groq (with redaction)
- Requirement: API key from Groq console

**Google AI Studio (Cloud)**
- Base URL: `https://generativelanguage.googleapis.com/v1beta/openai/`
- Model: Gemma models (e.g., `gemma-4-31b-it`, `gemma-4-26b-a4b-it`)
- Privacy: Data sent to Google (with redaction)
- Requirement: API key from AI Studio
- **Note:** Recommended for Hacktoberfest Week 4 challenge

### OpenAI-Compatible Client

All providers use the same client interface:
```python
client = AsyncOpenAI(
    base_url=provider_base_url,
    api_key=provider_api_key,
    timeout=30,
    max_retries=0
)
```

This enables easy provider switching via environment variables.

### Prompt Engineering

**System Prompts** (`services/prompts.py`):
- Parse prompt: Extract structured account data from unstructured text
- Ask prompt: Answer questions using only provided context
- Haunting prompt: Write spooky summary from aggregate counts

**JSON Schemas:**
- Strict Pydantic models for structured output
- Retry with repair instruction on parse failure
- Ensures type safety and validation

### Fallback Strategy

**Hybrid Mode:**
1. Try local provider (Ollama)
2. If connection error or 5xx, fall back to cloud
3. If cloud also fails, return error to user

**Error Handling:**
- Connection errors: Automatic fallback
- 429 (rate limit): Retry shortly
- 5xx server errors: Automatic fallback
- 4xx client errors: Configuration issue, no fallback

---

## Development Setup

### Prerequisites

- Python 3.11+
- Node 18+
- (Optional) Ollama for local AI
- (Optional) API keys for cloud AI

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd ghostbook-frontend
npm install
```

### Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Required Settings:**
```env
LLM_MODE=cloud
CLOUD_PROVIDER=groq
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

### Running Development Servers

**Backend:**
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd ghostbook-frontend
npm run dev
```

Access the app at http://localhost:5173

### API Documentation

When backend is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## Testing

### Backend Tests

```bash
cd backend
pytest
```

**Test Coverage:**
- `test_security.py`: Encryption, key derivation, sessions
- `test_redaction.py`: Secret masking
- `test_haunting.py`: Ghost detection rules
- `test_llm_fallback.py`: Provider fallback logic
- `test_api.py`: End-to-end API tests

### Running Specific Tests

```bash
# Run only security tests
pytest tests/test_security.py

# Run with verbose output
pytest -v

# Run with coverage
pytest --cov=app
```

### Frontend Testing

Frontend tests are not yet implemented. This is a future enhancement.

---

## Troubleshooting

### Backend Issues

**Problem: "Module not found" errors**
- Solution: Ensure virtual environment is activated
- Solution: Run `pip install -r requirements.txt`

**Problem: Database locked error**
- Solution: Ensure only one backend instance is running
- Solution: Delete `backend/ghostbook.db` to reset

**Problem: AI provider errors**
- Solution: Check API key in `.env`
- Solution: Verify model is available (check provider docs)
- Solution: Try switching providers or modes

### Frontend Issues

**Problem: 502 Bad Gateway**
- Solution: Ensure backend is running on port 8000
- Solution: Check CORS settings in `.env`

**Problem: "Network error"**
- Solution: Verify frontend proxy config in `vite.config.js`
- Solution: Check backend is accessible at http://localhost:8000

### AI Issues

**Problem: AI not responding**
- Solution: Check `LLM_MODE` in `.env`
- Solution: Verify API key and model are correct
- Solution: Check internet connection for cloud providers
- Solution: Ensure Ollama is running for local mode

**Problem: "AI provider not configured"**
- Solution: Set `LLM_MODE=off` to disable AI features
- Solution: Configure provider credentials in `.env`

### Database Issues

**Problem: Cannot decrypt accounts**
- Solution: Ensure correct master passphrase
- Solution: Database may be corrupted; reset with `rm backend/ghostbook.db`

**Problem: Forgot master passphrase**
- Solution: Data is unrecoverable (by design)
- Solution: Reset database and start fresh

---

## Docs Folder Contents

The `docs/` folder contains supplementary documentation:

- `architecture.md`: Detailed system architecture (this file is currently empty - see README for architecture)
- `javascript-snippets.md`: JavaScript code examples and patterns
- `typescript-snippets.md`: TypeScript code examples and patterns

**Note:** `architecture.md` is empty because the architecture is documented in the main README.md file. Future work may populate this with more detailed diagrams and component descriptions.

---

## Future Enhancements

See the Roadmap in README.md for planned features:
- Client-side encryption
- Browser CSV import
- Periodic login reminders
- Database export/backup
- Digital ofrenda mode (Día de los Muertos)

---

## Contributing

This is a personal project built for Hacktoberfest 2026. Contributions are welcome via pull requests.

**Areas for contribution:**
- Additional AI provider integrations
- More sophisticated redaction rules
- Enhanced haunting detection rules
- Frontend component improvements
- Test coverage expansion

---

## License

MIT License - See LICENSE file for details.
