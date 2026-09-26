# Message Hub — Iteration 0: Testing Guide

This guide details both the automated test suite and the step-by-step manual test checklist for verifying **Message Hub Iteration 0**.

---

## Part 1: Automated Test Suite

Message Hub includes a comprehensive automated test suite covering all architectural invariants:

```bash
npm test
```

### Automated Tests Verified:
1. **Identity & Endpoint Decoupling**: Identity has internal unique `user_id` independent of devices or accounts.
2. **Pairing Code Generation & Format**: Cryptographic random codes formatted `MH-XXXXX`.
3. **One-Time Code Burn**: Code is permanently invalidated upon consumption.
4. **Code Expiration**: Expired pairing codes are strictly rejected.
5. **Endpoint Linking & Multi-Interface Ownership**: A single user identity can own multiple endpoints simultaneously (e.g. Web + Telegram).
6. **Messaging & Routing Core**: Messages are created in core without proprietary dependencies.
7. **Offline Delivery Queuing**: When a recipient's endpoint is offline, deliveries remain in `pending` state and are never dropped.
8. **Reconnect & Queue Flush**: When an endpoint transitions to `online`, pending deliveries are dispatched immediately.
9. **Telegram Idempotency**: Duplicate Telegram updates (`update_id`) are safely detected and discarded.
10. **Security Boundaries & Permissions**: User A cannot read User B's conversation messages or manipulate User B's endpoints.
11. **Real Delivery Failure Reporting**: If delivery cannot be completed, the delivery status is marked `failed` with descriptive errors (no fake success).

---

## Part 2: Step-by-Step Manual Verification Checklist

Follow these steps to test Message Hub with real Telegram bots:

### Step 1 — Create Telegram Bot A
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Give it a name (e.g., `Message Hub Alpha Bot`).
4. Give it a username ending with `bot` (e.g., `MyHubAlpha_bot`).
5. Copy the generated API token (e.g. `1234567890:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`).

### Step 2 — Create Telegram Bot B
1. In `@BotFather`, send `/newbot` again.
2. Give it a name (e.g., `Message Hub Beta Bot`).
3. Give it a username ending with `bot` (e.g., `MyHubBeta_bot`).
4. Copy the second generated API token.

### Step 3 — Configure Secrets in AI Studio / Deployment
Set the following environment variables (via Secrets panel or `.env`):
```bash
TELEGRAM_BOT_A_TOKEN="<token_from_bot_a>"
TELEGRAM_BOT_B_TOKEN="<token_from_bot_b>"
APP_URL="https://ais-dev-ctw4hs2v32jqzjo23hwmwb-72838281696.europe-west1.run.app"
```

### Step 4 — Register Webhooks
1. Open the Web Client.
2. Switch to the **Diagnostics** tab.
3. Click **"Register / Update Webhook for Bot A"**.
4. Click **"Register / Update Webhook for Bot B"**.
5. Both bots should now display: `Webhook Registered: Yes`.

---

## Part 3: Live Verification Scenarios

### Scenario 1: Telegram Bot A → Message Hub → Telegram Bot B
1. In Web Client, select Identity **Alex Rivera (User A)**.
2. In the right panel ("Connected Interfaces"), click **"Pair Interface"**.
3. Copy the pairing code (e.g. `MH-XXXXX`).
4. Open **Bot A** in Telegram and send:
   ```text
   /link MH-XXXXX
   ```
   Bot A confirms: `Interface Linked Successfully! Identity: Alex Rivera`.
5. In Web Client, switch identity to **Sam Chen (User B)**.
6. Generate a pairing code for Sam (e.g. `MH-YYYYY`).
7. Open **Bot B** in Telegram and send:
   ```text
   /link MH-YYYYY
   ```
   Bot B confirms: `Interface Linked Successfully! Identity: Sam Chen`.
8. In Telegram, from **Bot A**, send:
   ```text
   Привет из Telegram Bot A!
   ```
9. **Result**: **Bot B** immediately receives:
   ```text
   💬 [Alex Rivera (User A)]:
   Привет из Telegram Bot A!
   ```
   The message traveled: `Telegram Bot A -> Message Hub Core -> Telegram Bot B`.

---

### Scenario 2: Web Client → Message Hub → Telegram Bot B
1. In Web Client, select Identity **Alex Rivera (User A)**.
2. Open the active conversation with **Sam Chen (User B)**.
3. Type: `Привет Сэм, это сообщение отправлено из браузера!` and click **Send**.
4. Check **Bot B** in Telegram.
5. **Result**: Sam receives the message in Bot B, and the Web UI displays `Delivered to ep_tg_bot_b_...`.

---

### Scenario 3: Telegram Bot B → Message Hub → Web Client
1. In Telegram, open **Bot B** (linked to Sam Chen).
2. Reply: `Ответ получен в Telegram! Отправляю обратно.`
3. Switch to Web Client (viewing Alex Rivera's chat).
4. **Result**: The response appears in real-time in the Web Client chat feed with origin `via BOT_B`.

---

### Scenario 4: User A has simultaneously Web + Telegram
1. Select Identity **Alex Rivera (User A)**.
2. Check the "Connected Interfaces" drawer.
3. Observe two distinct endpoints for Alex:
   - `Alex Web Client` (Online)
   - `@username (BOT_A)` (Online)
4. Send a message to Alex from Sam (via Web or Bot B).
5. **Result**: Both the Web Client and Telegram Bot A receive the delivery. Deliveries are fanned out per-interface, but tied to the single identity `usr_alpha_01`.

---

### Scenario 5: Offline Queuing & Reconnection
1. In the Web Client, open the "Connected Interfaces" drawer for **Sam Chen**.
2. Click **"Go Offline"** on Sam's Web Client. Status becomes `OFFLINE`.
3. As Alex Rivera, send a message to Sam: `Тест отложенной доставки`.
4. Observe the delivery badge in chat:
   ```text
   Pending (interface offline: ep_web_user_b)
   ```
5. Now, in the "Connected Interfaces" drawer, click **"Go Online"** on Sam's Web Client.
6. **Result**: Pending messages are flushed and delivery status updates to `Delivered`.
