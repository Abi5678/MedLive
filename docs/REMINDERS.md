# How Reminders Work (Meals & Medication)

## Current behavior

**Proactive push reminders are supported** for medication times and lunch. A scheduled job triggers FCM notifications; when the user taps, the app opens with a check-in flow.

What exists today:

1. **Registration**  
   The user grants notification permission in the app. The frontend gets an FCM token and calls `POST /api/reminders/register` with the token, timezone, and preferences (meds on/off, lunch on/off, lunch time). The backend stores these in Firestore (`users/{uid}` and `reminder_subscribers/{uid}`).

2. **Trigger (internal)**  
   Cloud Scheduler calls `POST /api/reminders/trigger` every 15 minutes with a shared secret header. The handler:
   - Lists users who have a non-empty FCM token and at least one reminder enabled.
   - For each user, computes current time in their timezone (IANA, e.g. `America/Los_Angeles`).
   - **Meds:** If the current 15-minute slot matches any of their medication times (from `users/{uid}/medications`), sends one FCM notification: “Time for your medications” with a deep link.
   - **Lunch:** If `reminder_lunch_enabled` and the current slot matches `lunch_reminder_time`, sends one FCM: “Log your lunch” with a deep link.

3. **Delivery and deep link**  
   FCM delivers to the browser; the service worker (`/static/firebase-messaging-sw.js`) shows the notification. On click, the app opens at `MEDLIVE_APP_URL/?checkin=true&type=meds` or `&type=lunch`. The existing check-in logic in the frontend sends a system message so the agent starts a warm check-in (and can mention “from a medication reminder” or “from a lunch reminder” when `type` is set).

4. **In-session**  
   When the user has the app open, the agent can still use `get_medication_schedule`, `log_medication_taken`, and `log_meal` as before.

## Cloud Scheduler setup

Create one recurring job that runs every 15 minutes:

- **HTTP target:** `POST https://<your-cloud-run-url>/api/reminders/trigger`
- **Headers:**  
  `Authorization: Bearer <REMINDERS_TRIGGER_SECRET>`  
  or  
  `X-CloudScheduler-Secret: <REMINDERS_TRIGGER_SECRET>`
- **Body:** none (or empty JSON)

Set `REMINDERS_TRIGGER_SECRET` in your Cloud Run (or backend) environment and use the same value in the scheduler job. Do not commit the secret.

You can create the job in GCP Console (Cloud Scheduler → Create Job) or via Terraform if you manage infra as code.

For local dev, trigger manually, e.g.:

```bash
curl -X POST http://localhost:8000/api/reminders/trigger \
  -H "Authorization: Bearer your-secret"
```

## Config and env

- **Backend:** `REMINDERS_TRIGGER_SECRET`, `MEDLIVE_APP_URL` (used in FCM click URL). Optional: `VAPID_KEY` is only needed if you serve it via a config endpoint; the frontend uses `GET /api/config` to read `vapidKey`.
- **Frontend:** VAPID key from Firebase Console (Project Settings → Cloud Messaging → Web configuration). The app requests notification permission, gets the FCM token, and calls `/api/reminders/register` with token and preferences (timezone from browser, lunch time default `12:00`).

## Summary

| Feature                         | Status   | Notes                                                                 |
|---------------------------------|----------|-----------------------------------------------------------------------|
| Proactive “time for meds” push  | **Built**| Scheduler → trigger endpoint → FCM; deep link `?checkin=true&type=meds`. |
| Proactive “log lunch” push      | **Built**| Same flow; deep link `?checkin=true&type=lunch`.                      |
| Check-in when user opens app   | Built    | Use `?checkin=true` or “opened after X hours” logic.                  |
| Agent explains reminders        | Built    | Prompts say proactive reminders are available; tap to open and log.   |
