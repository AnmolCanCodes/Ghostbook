# GhostBook Architecture

This document provides a detailed technical architecture of GhostBook, including system design, component interactions, data flows, and implementation details.

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Database Schema](#database-schema)
4. [API Design](#api-design)
5. [Security Architecture](#security-architecture)
6. [AI Integration Architecture](#ai-integration-architecture)
7. [Frontend Architecture](#frontend-architecture)
8. [Data Flow Diagrams](#data-flow-diagrams)
9. [Error Handling](#error-handling)
10. [Performance Considerations](#performance-considerations)

---

## System Overview

GhostBook follows a client-server architecture with a React frontend and FastAPI backend. The system is designed for single-user deployment on personal hardware, with a focus on privacy and data security.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│                    (React + Vite Frontend)                   │
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Account   │  │     AI     │  │  Haunting  │            │
│  │  Management│  │  Features  │  │   Report   │            │
│  └────────────┘  └────────────┘  └────────────┘            │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTP/JSON
                               │ Bearer Token
┌──────────────────────────────▼───────────────────────────────┐
│                       Server Layer                           │
│                     (FastAPI Backend)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API Router Layer                         │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │  │
│  │  │  Auth  │ │Account │ │   AI   │ │Haunting│       │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Service Layer                            │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │  │
│  │  │Security│ │  LLM   │ │Redaction│ │Haunting│       │  │
│  │  └────────┘ └────────┘ └────────┘ └────────┘       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Data Access Layer                       │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │         SQLAlchemy ORM + SQLite              │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    External Services                         │
│                                                              │
│  ┌────────────┐         ┌────────────┐                     │
│  │   Ollama   │         │  Groq API  │                     │
│  │  (Local)   │         │  (Cloud)   │                     │
│  └────────────┘         └────────────┘                     │
│                                                              │
│  ┌────────────┐                                             │
│  │ Google AI  │                                             │
│  │  (Cloud)   │                                             │
│  └────────────┘                                             │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Backend Components

#### 1. Application Entry Point (`main.py`)

**Responsibilities:**
- FastAPI app initialization
- CORS middleware configuration
- Router registration
- Lifespan management (database init, AI config warnings)
- Exception handler registration

**Key Functions:**
```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Database initialization
    # AI configuration warnings
    yield
```

#### 2. Configuration Module (`config.py`)

**Responsibilities:**
- Load environment variables from `.env`
- Type-safe settings via Pydantic
- Cache settings for performance
- Parse complex values (CORS origins list)

**Key Settings:**
- Database URL
- Security parameters (session TTL, lockout settings)
- AI configuration (mode, provider, API keys)
- Haunting report thresholds

#### 3. Database Module (`database.py`)

**Responsibilities:**
- SQLAlchemy engine management
- Session factory creation
- Base model declaration
- Database initialization

**Implementation:**
```python
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()
```

#### 4. Models (`models.py`)

**Account Model:**
```python
class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    site = Column(String, nullable=False)          # Encrypted
    email = Column(String, nullable=False)         # Encrypted
    username = Column(String)                     # Encrypted
    login_method = Column(String)                  # Encrypted
    reset_route = Column(String)                   # Encrypted
    last_used = Column(String)                     # Encrypted
    notes = Column(Text)                           # Encrypted
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**VaultMeta Model:**
```python
class VaultMeta(Base):
    __tablename__ = "vault_meta"

    id = Column(Integer, primary_key=True)
    salt = Column(LargeBinary, nullable=False)     # For key derivation
    initialized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

#### 5. Schemas (`schemas.py`)

**Request/Response Models:**
- Pydantic v2 models for validation
- Separate models for requests vs responses
- JSON serialization schemas for AI outputs

**Key Schemas:**
- `AccountCreate`, `AccountUpdate`, `AccountResponse`
- `VaultSetup`, `VaultUnlock`, `AuthStatus`
- `ParseIn`, `ParseOut`, `ParseResult`
- `AskIn`, `AskOut`, `AskModelOutput`
- `HauntingReport`

#### 6. Security Module (`security.py`)

**Key Derivation:**
```python
def derive_key(passphrase: str, salt: bytes) -> bytes:
    """Derive 32-byte key from passphrase using scrypt."""
    kdf = Scrypt(
        salt=salt,
        length=32,
        n=2**14,  # CPU/memory cost
        r=8,      # Block size
        p=1       # Parallelization
    )
    return kdf.derive(passphrase.encode())
```

**Encryption:**
```python
def encrypt_field(plaintext: str, key: bytes) -> str:
    fernet = Fernet(base64.urlsafe_b64encode(key))
    return fernet.encrypt(plaintext.encode()).decode()

def decrypt_field(ciphertext: str, key: bytes) -> str:
    fernet = Fernet(base64.urlsafe_b64encode(key))
    return fernet.decrypt(ciphertext.encode()).decode()
```

**Session Management:**
```python
class SessionStore:
    def __init__(self, ttl_minutes: int):
        self._sessions: dict[str, tuple[bytes, datetime]] = {}
        self._ttl = timedelta(minutes=ttl_minutes)

    def create(self, key: bytes) -> str:
        token = secrets.token_urlsafe(32)
        self._sessions[token] = (key, datetime.utcnow())
        return token

    def get_key(self, token: str) -> bytes | None:
        if token not in self._sessions:
            return None
        key, created = self._sessions[token]
        if datetime.utcnow() - created > self._ttl:
            del self._sessions[token]
            return None
        return key
```

**Brute Force Protection:**
```python
class LockoutStore:
    def __init__(self, max_attempts: int, lockout_minutes: int):
        self._attempts: dict[str, int] = {}
        self._lockouts: dict[str, datetime] = {}
        self._max_attempts = max_attempts
        self._lockout_duration = timedelta(minutes=lockout_minutes)

    def record_failure(self, identifier: str) -> None:
        self._attempts[identifier] = self._attempts.get(identifier, 0) + 1
        if self._attempts[identifier] >= self._max_attempts:
            self._lockouts[identifier] = datetime.utcnow()

    def is_locked(self, identifier: str) -> bool:
        if identifier not in self._lockouts:
            return False
        if datetime.utcnow() - self._lockouts[identifier] > self._lockout_duration:
            del self._lockouts[identifier]
            del self._attempts[identifier]
            return False
        return True
```

#### 7. LLM Service (`services/llm.py`)

**Provider Abstraction:**
```python
@dataclass(frozen=True)
class ProviderSpec:
    name: ProviderName  # "local", "groq", "google"
    base_url: str
    api_key: str
    model: str

    @property
    def destination(self) -> Destination:
        return "local" if self.name == "local" else "cloud"
```

**Provider Chain Selection:**
```python
def provider_chain(settings: Settings) -> list[ProviderSpec]:
    mode = settings.LLM_MODE
    if mode == "off":
        return []
    local = provider_spec(settings, "local")
    cloud = provider_spec(settings, settings.CLOUD_PROVIDER)
    if mode == "local":
        return [local]
    if mode == "cloud":
        return [cloud]
    return [local, cloud]  # hybrid
```

**Completion with Fallback:**
```python
async def complete_text(self, build_messages: BuildMessages) -> tuple[str, ProviderName]:
    usable = [spec for spec in provider_chain(self._settings) if spec.configured]
    for index, spec in enumerate(usable):
        is_last = index == len(usable) - 1
        try:
            text = await self._factory(spec).complete(messages)
            return text, spec.name
        except openai.OpenAIError as exc:
            if not is_last and _should_fall_back(exc):
                continue
            raise _to_unavailable(exc) from exc
    raise AIUnavailable()
```

#### 8. Redaction Service (`services/redaction.py`)

**Secret Patterns:**
```python
PATTERNS = [
    (r'\b\d{16}\b', 'CARD_NUMBER'),           # Credit card numbers
    (r'\b\d{6}\b', 'OTP'),                    # 6-digit OTPs
    (r'\b[A-Za-z0-9]{32,}\b', 'PASSWORD'),    # Long alphanumeric strings
    (r'\b\d{12}\b', 'AADHAAR'),               # Aadhaar-style numbers
]
```

**Redaction Logic:**
```python
def redact_text(text: str) -> str:
    """Mask potential secrets before sending to cloud."""
    for pattern, label in PATTERNS:
        text = re.sub(pattern, f'[{label}_REDACTED]', text)
    return text
```

#### 9. Haunting Service (`services/haunting.py`)

**Ghost Detection Rules:**
```python
def find_stale_accounts(accounts: list[Account], days: int) -> list[Account]:
    cutoff = datetime.utcnow() - timedelta(days=days)
    return [a for a in accounts if parse_date(a.last_used) < cutoff]

def find_email_concentration(accounts: list[Account], limit: int) -> dict[str, int]:
    email_counts = Counter(a.email for a in accounts)
    return {email: count for email, count in email_counts.items() if count > limit}

def find_missing_recovery(accounts: list[Account]) -> list[Account]:
    return [a for a in accounts if not a.reset_route]
```

### Frontend Components

#### 1. Application Root (`App.jsx`)

**State Management:**
```javascript
const [token, setToken] = useState(null);
const [aiStatus, setAiStatus] = useState(null);
const [view, setView] = useState('accounts');
```

**View Routing:**
- `unlock`: Master passphrase entry
- `accounts`: Account list and management
- `haunting`: Ghost report

#### 2. API Client (`api.js`)

**Request Wrapper:**
```javascript
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

**Token Management:**
- Token stored in memory (not localStorage)
- Automatically included in Authorization header
- Cleared on lock or navigation away

#### 3. Components

**UnlockScreen:**
- Handles first-time setup vs. unlock
- Form validation
- Error display for wrong passphrase

**AccountList:**
- Displays all accounts (decrypted)
- Search/filter functionality
- CRUD operations

**AccountForm:**
- Manual account entry
- Form validation
- Encryption handled by backend

**PasteToAccount:**
- Text area for pasting emails/notes
- AI parsing call
- Review and edit before save

**AskBox:**
- Natural language query input
- Display AI answer
- Show matched accounts

**HauntingReport:**
- Display ghost statistics
- Show AI-generated summary
- Visual indicators for issues

---

## Database Schema

### ER Diagram

```
┌─────────────────────┐
│    vault_meta       │
├─────────────────────┤
│ id (PK)             │
│ salt (BLOB)         │
│ initialized (BOOL)  │
│ created_at (DATETIME)│
└─────────────────────┘
        │
        │ 1:1
        │
┌─────────────────────┐
│     accounts        │
├─────────────────────┤
│ id (PK)             │
│ site (TEXT)         │ -- Encrypted
│ email (TEXT)        │ -- Encrypted
│ username (TEXT)     │ -- Encrypted
│ login_method (TEXT) │ -- Encrypted
│ reset_route (TEXT)  │ -- Encrypted
│ last_used (TEXT)    │ -- Encrypted
│ notes (TEXT)        │ -- Encrypted
│ created_at (DATETIME)│
│ updated_at (DATETIME)│
└─────────────────────┘
```

### Field Encryption

All account fields are encrypted using Fernet with the derived key:

```
plaintext → Fernet(key) → ciphertext (base64) → stored in SQLite
```

**Why per-field encryption?**
- Granular access control (future enhancement)
- Ability to encrypt/decrypt individual fields
- Simpler migration strategy

---

## API Design

### RESTful Endpoints

#### Authentication

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| GET | `/api/auth/status` | - | `AuthStatus` | Check vault state |
| POST | `/api/auth/setup` | `VaultSetup` | `VaultResponse` | First-time setup |
| POST | `/api/auth/unlock` | `VaultUnlock` | `VaultResponse` | Unlock vault |
| POST | `/api/auth/lock` | - | - | Lock vault |

#### Accounts

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| GET | `/api/accounts` | `?q=search` | `list[Account]` | List/search accounts |
| POST | `/api/accounts` | `AccountCreate` | `Account` | Create account |
| PUT | `/api/accounts/{id}` | `AccountUpdate` | `Account` | Update account |
| DELETE | `/api/accounts/{id}` | - | - | Delete account |

#### AI Features

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| POST | `/api/ai/parse` | `ParseIn` | `ParseOut` | Parse text to accounts |
| POST | `/api/ai/ask` | `AskIn` | `AskOut` | Ask question |

#### Haunting

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| GET | `/api/haunting` | - | `HauntingReport` | Generate report |

### Request/Response Examples

**Setup Vault:**
```json
POST /api/auth/setup
{
  "passphrase": "my-secure-passphrase"
}
Response:
{
  "token": "abc123...",
  "ai_status": {
    "mode": "cloud",
    "configured_provider": "groq",
    "model": "openai/gpt-oss-20b",
    "label": "AI: cloud (groq)"
  }
}
```

**Create Account:**
```json
POST /api/accounts
{
  "site": "netflix.com",
  "email": "user@example.com",
  "username": "user123",
  "login_method": "email+password",
  "reset_route": "https://netflix.com/password/reset",
  "last_used": "2024-10-31",
  "notes": "Family plan"
}
Response:
{
  "id": 1,
  "site": "netflix.com",
  "email": "user@example.com",
  ...
}
```

**Ask Question:**
```json
POST /api/ai/ask
{
  "question": "Which email did I use for Netflix?"
}
Response:
{
  "answer": "You used user@example.com for Netflix.",
  "matched_account_ids": [1],
  "provider_used": "groq"
}
```

---

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Network Security                                    │
│ - CORS restriction to known origins                          │
│ - HTTPS (if deployed)                                         │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Authentication                                       │
│ - Bearer token validation                                     │
│ - Token expiration (TTL)                                      │
│ - Brute force protection                                      │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Encryption at Rest                                   │
│ - scrypt key derivation                                       │
│ - Fernet field encryption                                     │
│ - Per-vault random salt                                       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: Data Privacy (AI)                                    │
│ - Local-first AI mode                                         │
│ - Secret redaction before cloud                               │
│ - Configurable data sharing                                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Lifecycle

```
1. User enters master passphrase
   ↓
2. Passphrase + salt → scrypt → 32-byte key
   ↓
3. Key stored in memory with session token
   ↓
4. Key used for:
   - Decrypting account fields
   - Encrypting new account fields
   ↓
5. After TTL or manual lock:
   - Key removed from memory
   - Session token invalidated
   ↓
6. Next unlock:
   - Repeat from step 1
```

### Threat Mitigation

| Threat | Mitigation |
|--------|-----------|
| Database theft | All fields encrypted, key not stored |
| Brute force passphrase | scrypt with high cost, temporary lockout |
| Session hijacking | Short TTL, token in memory only |
| Cloud data exposure | Local mode, redaction, opt-in notes |
| Server compromise | Designed for personal deployment only |

---

## AI Integration Architecture

### Provider Selection Flow

```
┌─────────────────┐
│ Check LLM_MODE  │
└────────┬────────┘
         │
    ┌────┴────┬─────────┬─────────┐
    │         │         │         │
    ▼         ▼         ▼         ▼
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ off  │ │local │ │cloud │ │hybrid│
└──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘
   │        │        │        │
   │        ▼        ▼        ▼
   │    ┌─────────────────┐
   │    │   Try Ollama    │
   │    └────────┬────────┘
   │             │
   │      ┌──────┴──────┐
   │      │             │
   │      ▼             ▼
   │   Success      Failure
   │      │             │
   │      │        ┌────▼────┐
   │      │        │  Return  │
   │      │        │  error  │
   │      │        └─────────┘
   │      │
   │      │        (hybrid only)
   │      │             │
   │      │             ▼
   │      │    ┌─────────────────┐
   │      │    │   Try Groq/Google│
   │      │    └────────┬────────┘
   │      │             │
   │      │      ┌──────┴──────┐
   │      │      │             │
   │      │      ▼             ▼
   │      │   Success      Failure
   │      │      │             │
   │      └──────┴─────────────┘
   │             │
   ▼             ▼
┌─────────────────────────┐
│   No AI features        │
│   (plain search only)   │
└─────────────────────────┘
```

### Message Building Pattern

Each AI feature uses a destination-aware message builder:

```python
def build_ask_messages(question: str, candidates: list[Account],
                        destination: Destination) -> list[Message]:
    system = {
        "local": "You are a helpful assistant...",
        "cloud": "You are a helpful assistant. Use ONLY the provided context..."
    }[destination]

    context = format_context(candidates, destination)
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Question: {question}\n\nContext:\n{context}"}
    ]
```

### JSON Output Handling

```python
async def complete_json(self, build_messages: BuildMessages, model: type[T]) -> tuple[T, ProviderName]:
    text, provider = await self.complete_text(build_messages)
    try:
        return model.model_validate(extract_json_object(text)), provider
    except ValueError:
        # Retry with repair instruction
        def repair(destination: Destination) -> list[Message]:
            messages = [dict(m) for m in build_messages(destination)]
            messages[-1]["content"] += "\n\n" + REPAIR_INSTRUCTION
            return messages
        text, provider = await self.complete_text(repair)
        return model.model_validate(extract_json_object(text)), provider
```

---

## Frontend Architecture

### Component Hierarchy

```
App
├── UnlockScreen
│   ├── SetupForm
│   └── UnlockForm
├── MainLayout
│   ├── Header
│   │   ├── AiBadge
│   │   └── LockButton
│   ├── AccountList
│   │   ├── AccountCard
│   │   ├── SearchBar
│   │   └── AccountForm (modal)
│   │       └── FormFields
│   ├── PasteToAccount
│   │   ├── TextArea
│   │   └── ParseResults
│   ├── AskBox
│   │   ├── QuestionInput
│   │   └── AnswerDisplay
│   └── HauntingReport
│       ├── StatsDisplay
│       └── AiSummary
└── Toast
```

### State Management

**Application State:**
```javascript
{
  token: string | null,           // Session token
  aiStatus: object | null,        // AI configuration
  view: 'accounts' | 'haunting',  // Current view
  accounts: array,                // Loaded accounts
  toast: { message, type } | null // Notification
}
```

**Component State:**
- Local state for forms, modals, loading states
- Props for read-only data
- Callbacks for actions

### Styling Architecture

**Design Tokens (`styles/tokens.css`):**
```css
:root {
  --color-primary: #1a1a2e;
  --color-secondary: #16213e;
  --color-accent: #e94560;
  --color-text: #eaeaea;
  --spacing-unit: 8px;
  --border-radius: 8px;
  /* ... */
}
```

**Component Styles (`styles/components.css`):**
- Component-specific styles
- BEM naming convention
- Responsive utilities

**Layout Styles (`styles/layout.css`):**
- Grid/flexbox layouts
- Responsive breakpoints
- Container styles

---

## Data Flow Diagrams

### Account Creation Flow

```
User
 │
 ├─→ Fills form
 │
 ├─→ Frontend: POST /api/accounts
 │   {
 │     site: "netflix.com",
 │     email: "user@example.com",
 │     ...
 │   }
 │
 ├─→ Backend: Middleware (CORS, Exception)
 │
 ├─→ Backend: require_key dependency
 │   ├─ Extract Bearer token
 │   ├─ Validate token
 │   └─ Retrieve derived key
 │
 ├─→ Backend: encrypt each field
 │   ├─ encrypt_field(site, key)
 │   ├─ encrypt_field(email, key)
 │   └─ ...
 │
 ├─→ Backend: Save to SQLite
 │   INSERT INTO accounts (site, email, ...)
 │   VALUES (ciphertext_site, ciphertext_email, ...)
 │
 └─→ Frontend: Display success
```

### AI Query Flow

```
User
 │
 ├─→ Asks: "Which email for Netflix?"
 │
 ├─→ Frontend: POST /api/ai/ask
 │   { question: "Which email for Netflix?" }
 │
 ├─→ Backend: require_key
 │
 ├─→ Backend: load_all_accounts
 │   ├─ SELECT * FROM accounts
 │   └─ decrypt each field in memory
 │
 ├─→ Backend: prefilter_accounts
 │   ├─ Keyword match: "netflix"
 │   ├─ Select top 15 candidates
 │   └─ Exclude notes (if cloud mode)
 │
 ├─→ Backend: build_ask_messages
 │   ├─ System prompt (local vs cloud)
 │   ├─ User question
 │   └─ Context (candidate accounts)
 │
 ├─→ Backend: llm.complete_json
 │   ├─ Call Groq API
 │   ├─ Parse JSON response
 │   └─ Validate with Pydantic
 │
 └─→ Frontend: Display answer + matched accounts
```

### Vault Lock Flow

```
User
 │
 ├─→ Clicks "Lock Vault"
 │
 ├─→ Frontend: POST /api/auth/lock
 │
 ├─→ Backend: require_session
 │   ├─ Extract token
 │   └─ Validate token
 │
 ├─→ Backend: session_store.delete(token)
 │
 ├─→ Backend: Return success
 │
 └─→ Frontend: Clear token from memory
     └─ Redirect to UnlockScreen
```

---

## Error Handling

### Exception Hierarchy

```python
class GhostBookError(Exception):
    """Base exception for all custom errors."""

class VaultLocked(GhostBookError):
    """Vault is locked, no session token."""

class VaultAlreadySetup(GhostBookError):
    """Vault already initialized, cannot setup again."""

class VaultNotSetup(GhostBookError):
    """Vault not initialized, must setup first."""

class AIDisabled(GhostBookError):
    """AI features disabled (LLM_MODE=off)."""

class AINotConfigured(GhostBookError):
    """No AI provider configured for current mode."""

class AIUnavailable(GhostBookError):
    """AI provider temporarily unavailable."""

class AIBadOutput(GhostBookError):
    """AI provider returned invalid output."""
```

### Error Responses

**Standard Error Format:**
```json
{
  "detail": "Error message"
}
```

**HTTP Status Codes:**
- 400: Bad request (validation error)
- 401: Unauthorized (no/invalid token)
- 403: Forbidden (vault locked)
- 409: Conflict (vault already setup)
- 429: Too many requests (AI rate limit)
- 500: Internal server error
- 502: Bad gateway (AI provider unavailable)

### Frontend Error Handling

```javascript
try {
  const result = await apiCall('/api/accounts', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  setAccounts([...accounts, result]);
} catch (error) {
  if (error.message.includes('401')) {
    setToken(null); // Force re-auth
  }
  showToast({ message: error.message, type: 'error' });
}
```

---

## Performance Considerations

### Database Performance

**Indexed Fields:**
- `accounts.id` (primary key)
- Future: Add indexes on decrypted search terms if needed

**Query Optimization:**
- Load all accounts for personal scale (hundreds of entries)
- Decrypt in memory per request
- Caching: Not implemented (could add for frequent queries)

### AI Performance

**Timeout Configuration:**
- Default: 30 seconds per request
- Configurable via `LLM_TIMEOUT_SECONDS`

**Batch Processing:**
- Limit context to 15 accounts per query
- Configurable via `CLOUD_MAX_CONTEXT_ACCOUNTS`

**Fallback Strategy:**
- Local first (hybrid mode)
- Parallel attempts (future enhancement)

### Frontend Performance

**Optimizations:**
- Virtual scrolling for large lists (future)
- Debounced search input
- Lazy loading of components

**Bundle Size:**
- Vite for fast builds
- Code splitting (future)
- Tree shaking (automatic)

---

## Future Architecture Enhancements

### Client-Side Encryption

**Planned Changes:**
- Key derivation in browser
- Encryption before sending to server
- Server never sees plaintext

**Impact:**
- Trust model: Server can't read data
- Complexity: Key sharing across devices
- Performance: Client-side crypto overhead

### Browser Import

**Planned Changes:**
- CSV parser for browser exports
- Password field extraction and discard
- Batch account creation

### Backup/Export

**Planned Changes:**
- Encrypted database export
- JSON format with all metadata
- Import from backup

---

## Conclusion

GhostBook's architecture prioritizes:
1. **Security**: Encryption at rest, secure key handling
2. **Privacy**: Local-first AI, configurable data sharing
3. **Simplicity**: Clean separation of concerns, clear data flow
4. **Extensibility**: Provider-agnostic AI, pluggable services

The system is designed for personal deployment on a single machine, with clear boundaries between frontend, backend, and external services.
