# Message Hub — Iteration 0

> **Universal Communication Layer** decoupling human identity, functions, and interfaces across Web.

---

## 1. Core Principles

1. **The First Device Is Not Your Identity**
   A user is never defined by a Telegram account, phone number, web session, or hardware device.
2. **We Unite Interfaces Around Functions**
   Actions (`SEND_MESSAGE`, `MARK_READ`, `LINK_ENDPOINT`) are universal primitives. Adapters translate them for specific client environments.
3. **Privacy by Design**
   If a function can operate without collecting personal telemetry or device fingerprints, the system does not request or store it. No AI behavioral profiling or secret recording.

```text
PERSON / IDENTITY
        ↓
     FUNCTION
        ↓
ENDPOINT / INTERFACE
        ↓
     DEVICE
```

---

## 2. Architecture

```text
┌─────────────────┐       ┌─────────────────┐
│ Telegram Client │       │   Web Browser   │
└────────┬────────┘       └────────┬────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│ Telegram Adapter│       │   Web Adapter   │
└────────┬────────┘       └────────┬────────┘
         │                         │
         └────────────┬────────────┘
                      ▼
        ┌───────────────────────────┐
        │  COMMUNICATION PROTOCOL   │
        └─────────────┬─────────────┘
                      ▼
        ┌───────────────────────────┐
        │     MESSAGE HUB CORE      │
        │ ───────────────────────── │
        │ · Identity Management     │
        │ · Capability Resolution   │
        │ · Conversation Engine     │
        │ · Routing Engine          │
        │ · Presence System         │
        │ · Offline Queuing         │
        │ · Security Boundaries     │
        └─────────────┬─────────────┘
                      ▼
        ┌───────────────────────────┐
        │       STORAGE LAYER       │
        │  (Users, Endpoints, etc.) │
        └───────────────────────────┘
```

The core contains **zero Telegram-specific logic**. If a new adapter (e.g. voice assistant, smartwatch, or AI agent) is attached tomorrow, the core remains untouched.

---

## 3. Data Entities

- **`User`**: Internal identity (`user_id`, `display_name`). Uniquely represents a person.
- **`Endpoint`**: A concrete interface attached to a user (`id`, `user_id`, `type`, `external_id`, `capabilities`, `status`).
- **`EndpointCapability`**: Advertised abilities (`text`, `image`, `file`, `voice`, `video`, `location`, `notification`, `interactive`).
- **`Conversation`**: Direct or group communication channel (`conversation_id`, `type`, `title`).
- **`Message`**: Independent message payload (`message_id`, `conversation_id`, `sender_user_id`, `content_type`, `text`, `attachments`).
- **`Delivery`**: State of dispatch to a specific endpoint (`delivery_id`, `message_id`, `endpoint_id`, `status`: `pending` | `sent` | `delivered` | `read` | `failed`).
- **`PairingCode`**: Single-use, short-lived cryptographic code (e.g. `MH-8K4P2`) to bind an endpoint to an identity.
- **`Presence`**: Real-time state of an endpoint (`online` | `offline`), independent of the person.
- **`SystemEvent`**: Audit and diagnostic event log (no personal surveillance).

---

## 4. Directory Structure

```text
src/
├── adapters/
│   ├── base.ts                 # Base EndpointAdapter interface
│   ├── index.ts                # Adapter registry initialization
│   ├── telegram/
│   │   ├── client.ts           # Official Telegram Bot API HTTP client
│   │   ├── adapter.ts          # Telegram Adapter (/link, /start, text ingestion, idempotency)
│   │   └── registry.ts         # Multi-bot registry (Bot A, Bot B)
│   └── web/
│       └── adapter.ts          # Web Adapter (delivery, real-time SSE event bus)
├── core/
│   ├── identity.ts             # Identity management & ownership verification
│   ├── capability.ts           # Capability matching
│   ├── pairing.ts              # One-time cryptographic pairing codes
│   ├── presence.ts             # Endpoint presence & touch
│   ├── messaging.ts            # Core conversation & message creation
│   └── routing.ts              # Routing engine, recipient resolution & offline queuing
├── database/
│   └── index.ts                # Modular collection store with ACID disk persistence
├── api/
│   └── routes.ts               # Express API endpoints & Telegram Webhook
├── tests/
│   └── run-all-tests.ts        # Comprehensive automated test suite (29 tests)
├── components/
│   ├── IdentityBar.tsx         # Identity switcher & creator
│   ├── ConversationList.tsx    # Channels & conversation starter
│   ├── ChatArea.tsx            # Thread with real delivery status badges
│   ├── InterfacesDrawer.tsx    # Connected endpoints, pairing modal, presence toggle
│   ├── DiagnosticsView.tsx     # Bot health, webhook registration & simulator
│   └── ScenarioRunner.tsx      # Automated execution of Scenarios 1, 2, 3, 4
├── types/
│   └── index.ts                # Strongly typed domain models
├── App.tsx                     # Main application shell
├── main.tsx                    # React client entry point
└── server.ts                   # Full-stack Express server with Vite middleware
```

---

## 5. API Endpoints

### Core Identity & Endpoints
- `GET /api/me` — Current identity and its attached endpoints
- `GET /api/users` — List registered identities
- `POST /api/users` — Register a new decoupled identity
- `GET /api/endpoints` — List endpoints belonging to the requesting identity
- `POST /api/endpoints/pairing` — Generate a short-lived pairing code (`MH-XXXXX`)
- `DELETE /api/endpoints/:id` — Unlink an endpoint (with ownership check)
- `PUT /api/endpoints/:id/presence` — Toggle endpoint presence (`online` / `offline`)

### Messaging & Conversations
- `GET /api/conversations` — Active conversations for current identity
- `POST /api/conversations` — Start direct conversation with another identity
- `GET /api/conversations/:id/messages` — Messages in conversation (membership checked)
- `POST /api/conversations/:id/messages` — Send message through Core

### Telemetry & Integration
- `GET /api/presence` — Global endpoint presence table
- `GET /api/diagnostics` — System health, multi-bot status, and audit log
- `GET /api/events/stream` — Real-time Server-Sent Events (SSE) feed
- `POST /api/integrations/telegram/webhook/:botId` — Official Telegram webhook endpoint
- `POST /api/integrations/telegram/setup-webhook` — Automated webhook registration

---

## 6. Running Locally & Testing

```bash
# Run automated test suite
npm test

# Run development server (Vite + Express backend on port 3000)
npm run dev

# Build for production
npm run build
npm start
```
