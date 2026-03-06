# Proactive Push Reminders — Implementation Changelog

This document lists **every file changed or added** for the Proactive Push Reminders (Meds + Lunch) feature, so another developer or AI can catch up quickly.

---

## 1. Backend: Firestore

### `agents/shared/firestore_service.py`

**Added:**

- **`list_reminder_subscribers() -> list[dict]`**  
  Streams the `reminder_subscribers` collection and returns a list of users who have a non-empty `fcm_token` and at least one of `reminder_meds_enabled` or `reminder_lunch_enabled` true. Each item includes `user_id`, `fcm_token`, `timezone`, `reminder_meds_enabled`, `reminder_lunch_enabled`, `lunch_reminder_time`. Used by the trigger endpoint to decide who to notify.

- **`save_reminder_preferences(user_id, *, fcm_token, reminder_meds_enabled, reminder_lunch_enabled, lunch_reminder_time, timezone)`**  
  - Merges reminder fields (and `fcm_token` when provided) into `users/{uid}`.
  - If `fcm_token` is non-empty: also writes/overwrites `reminder_subscribers/{uid}` with the same data (so the trigger job can list subscribers without scanning all users).
  - If `fcm_token` is null/empty: merges `fcm_token: None` into the user profile and **deletes** `reminder_subscribers/{uid}` (disables push).

**Firestore usage:**

- **Profile (`users/{uid}`):** New/optional fields: `fcm_token`, `reminder_meds_enabled`, `reminder_lunch_enabled`, `lunch_reminder_time`, `timezone`. No schema migration; existing docs unchanged.
- **New collection:** `reminder_subscribers` — one document per UID that has opted in; document ID = `uid`; fields: `fcm_token`, `reminder_meds_enabled`, `reminder_lunch_enabled`, `lunch_reminder_time`, `timezone`.

---

## 2. Backend: Reminders API

### `app/api/reminders.py` (new file)

- **Auth helper:** `_verify_token(authorization)` — extracts `Bearer <id_token>`, verifies with Firebase Auth, returns `uid`.
- **Trigger auth:** `_verify_trigger_secret(authorization, x_secret)` — ensures request has the same value as `REMINDERS_TRIGGER_SECRET` (via `Authorization: Bearer <secret>` or `X-CloudScheduler-Secret` header).
- **Pydantic:** `RegisterRemindersRequest`: `fcm_token` (optional), `reminder_meds_enabled`, `reminder_lunch_enabled`, `lunch_reminder_time`, `timezone` (all with defaults).

**Endpoints:**

1. **`POST /api/reminders/register`**  
   - Requires `Authorization: Bearer <firebase_id_token>`.
   - Body: `RegisterRemindersRequest`.
   - Normalizes `lunch_reminder_time` to `HH:MM` and validates `timezone` with `zoneinfo.ZoneInfo` (falls back to `"UTC"` on error).
   - If `fcm_token` is null or empty: clears token and disables push (merge profile + delete `reminder_subscribers/{uid}`).
   - Otherwise: merges into profile and sets `reminder_subscribers/{uid}`.
   - Returns `{ "ok": true, "message": "Reminder preferences saved" }`.

2. **`POST /api/reminders/trigger`**  
   - Internal only; secured by `REMINDERS_TRIGGER_SECRET` (header).
   - Gets `MEDLIVE_APP_URL` from env (default `http://localhost:8000`).
   - Calls `list_reminder_subscribers()`; for each subscriber loads medications via `get_medications(uid)`.
   - Uses `zoneinfo` to get current local time in the user’s timezone; derives a 15-minute slot string (e.g. `08:00` for 08:00–08:14).
   - **Meds:** If `reminder_meds_enabled`, collects all medication `times` (e.g. `["08:00", "20:00"]`); if current slot matches any, sends **one** FCM per user with title “Time for your medications”, body “Your doses are due…”, `data.url = MEDLIVE_APP_URL/?checkin=true&type=meds`.
   - **Lunch:** If `reminder_lunch_enabled` and current slot matches `lunch_reminder_time`, sends one FCM: “Log your lunch”, `data.url = MEDLIVE_APP_URL/?checkin=true&type=lunch`.
   - Uses `firebase_admin.messaging` (no new dependency); catches send failures per user and logs.

---

## 3. Backend: App wiring and config

### `app/main.py`

- **Import and router:** `from app.api.reminders import router as reminders_router` and `app.include_router(reminders_router)` (with other API routers).
- **New route:** `GET /api/config` — returns `{ "vapidKey": os.getenv("VAPID_KEY", "") }` for the frontend to use when requesting the FCM token.

---

## 4. Frontend: Service worker and scripts

### `app/static/firebase-messaging-sw.js` (new file)

- **importScripts:** Firebase App and Messaging compat SDK (same version as in `index.html`).
- **Config:** Same `firebaseConfig` as in the main app (hardcoded; matches `index.html`).
- **`onBackgroundMessage`:** Shows a notification with `payload.notification.title/body` and `payload.data` (so `data.url` is available on the notification object).
- **`notificationclick`:** Closes the notification and opens `event.notification.data?.url || "/"` (either in an existing window or via `clients.openWindow`).

### `app/static/index.html`

- **Script tag added:**  
  `<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js"></script>`  
  (after `firebase-auth-compat.js`).

### `app/static/js/app.js`

- **New function `registerRemindersIfEnabled()`** (called once after a 3s timeout):
  - Fetches `GET /api/config` for `vapidKey`; if missing, exits.
  - Checks `Notification.permission`; if `"default"`, calls `Notification.requestPermission()`.
  - If not `"granted"`, exits.
  - Registers the service worker: `navigator.serviceWorker.register("/static/firebase-messaging-sw.js", { scope: "/static/" })`.
  - Gets FCM token with `firebase.messaging().getToken({ vapidKey, serviceWorkerRegistration })`.
  - `POST /api/reminders/register` with `Authorization: Bearer <medlive_id_token>` and body: `fcm_token`, `reminder_meds_enabled: true`, `reminder_lunch_enabled: true`, `lunch_reminder_time: "12:00"`, `timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"`.
  - On success, sets `localStorage.setItem("medlive_reminders_registered", "1")` (optional for future use).

- **Check-in from push (URL params):**  
  Existing block that runs when `?checkin=true` now also reads `type` from the query string:
  - If `type=meds`: system message includes “from a medication reminder”.
  - If `type=lunch`: “from a lunch reminder”.
  - Otherwise: “from a check-in notification” (unchanged).

---

## 5. Config and environment

### `.env.example`

**Added:**

- `REMINDERS_TRIGGER_SECRET=your-internal-secret-for-cloud-scheduler`
- `MEDLIVE_APP_URL=https://your-app-domain.com`
- `VAPID_KEY=` (with comment: from Firebase Console → Project Settings → Cloud Messaging → Web configuration)

---

## 6. Documentation and prompts

### `docs/REMINDERS.md`

- **Rewritten** to describe the **current** behavior:
  - Registration flow (permission → FCM token → `POST /api/reminders/register`).
  - Trigger flow (Cloud Scheduler → `POST /api/reminders/trigger` → timezone-aware slot matching → FCM send).
  - Delivery and deep link (service worker, `data.url`, `?checkin=true&type=meds|lunch`).
- **New section:** “Cloud Scheduler setup” — 15-minute job, POST to `/api/reminders/trigger`, header `Authorization: Bearer <REMINDERS_TRIGGER_SECRET>` or `X-CloudScheduler-Secret`, plus local `curl` example.
- **New section:** “Config and env” (backend and frontend).
- **Summary table:** “Proactive ‘time for meds’ push” and “Proactive ‘log lunch’ push” marked as **Built**.

### `agents/shared/prompts.py`

- **Root agent (`ROOT_AGENT_INSTRUCTION`), “Reminders” bullet:**  
  Replaced “app does not yet send proactive push reminders” with wording that says: if the patient has enabled reminders, they get push at medication times and for lunch; tap to open and the agent helps log; if they didn’t get a reminder, suggest checking notifications and offer to go through schedule or log now.

- **Guardian agent, “Reminders (meals and medication)” bullet:**  
  Replaced “app does not send scheduled push reminders” with: if the user has enabled reminders, they get notifications at med times and lunch and can tap to open; if they ask how reminders work or say they didn’t get one, explain enabling and that the agent can always go through schedule or log with them.

---

## 7. Summary: files touched

| File | Action |
|------|--------|
| `agents/shared/firestore_service.py` | Modified (new methods + `reminder_subscribers` usage) |
| `app/api/reminders.py` | **Created** |
| `app/main.py` | Modified (reminders router + `GET /api/config`) |
| `app/static/firebase-messaging-sw.js` | **Created** |
| `app/static/index.html` | Modified (messaging script) |
| `app/static/js/app.js` | Modified (register reminders + check-in `type`) |
| `.env.example` | Modified (reminder-related env vars) |
| `docs/REMINDERS.md` | Rewritten (current behavior + scheduler + summary) |
| `agents/shared/prompts.py` | Modified (Root and Guardian reminder bullets) |
| `docs/REMINDERS_IMPLEMENTATION_CHANGELOG.md` | **Created** (this file) |

---

## 8. What is *not* in the repo (operator tasks)

- **Cloud Scheduler job:** Must be created in GCP (or Terraform): 15-minute schedule, POST to `https://<cloud-run-url>/api/reminders/trigger` with `Authorization: Bearer <REMINDERS_TRIGGER_SECRET>` (or `X-CloudScheduler-Secret`). Not created by code.
- **Environment variables:** `REMINDERS_TRIGGER_SECRET`, `MEDLIVE_APP_URL`, and `VAPID_KEY` must be set in the running environment (e.g. Cloud Run, or `.env` for local).

---

## 9. Quick catch-up for Claude

- **Backend:** Reminder state lives in Firestore (`users/{uid}` + `reminder_subscribers/{uid}`). Register endpoint writes there; trigger endpoint reads subscribers, computes local time per user, and sends FCM via `firebase_admin.messaging`.
- **Frontend:** One service worker for FCM; main app gets token and calls `POST /api/reminders/register`; notification click opens `data.url` (app with `?checkin=true&type=meds|lunch`).
- **Scheduler:** External (Cloud Scheduler) hits `POST /api/reminders/trigger` with a secret header every 15 minutes.
- **Prompts and docs:** REMINDERS.md and agent prompts describe proactive reminders as available and how they work.
