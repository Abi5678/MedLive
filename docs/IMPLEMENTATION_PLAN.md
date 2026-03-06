# MedLive Implementation Plan

## Context

MedLive is a real-time, multilingual AI health guardian for the **Gemini Live Agent Challenge** hackathon (deadline: March 16, 2026). It bridges the gap between elderly parents managing health independently and their children living abroad. The project targets the **Live Agents** track, requiring real-time voice interaction via Gemini Live API, Google ADK for multi-agent orchestration, and hosting on Google Cloud.

**Current state**: Empty project directory. Starting from scratch.
**Team**: Larger team (see Team Roles below). Parallel workstreams possible.
**Languages**: Hindi + Spanish + English (cross-cultural breadth for demo impact).
**GCP project**: `medlive-488722` (Project name: medlive, Project number: 479757625763). Created and ready.

---

## Hackathon Compliance Checklist

| Requirement | How MedLive Satisfies It |
|---|---|
| Leverage a Gemini model | `gemini-2.5-flash-native-audio-preview` for bidi voice/video streaming |
| Use Google GenAI SDK or ADK | Google ADK with multi-agent `sub_agents` and `runner.run_live()` |
| Integrate >= 1 Google Cloud service | Firestore (data), Cloud Run (hosting), Cloud Scheduler (reminders) |
| Hosted on Google Cloud | Cloud Run deployment via Terraform |
| Public GitHub repo + spin-up instructions | README with `docker-compose up` and `terraform apply` |
| GCP deployment proof | Screen recording of Cloud Run console + live URL |
| Architecture diagram | Shows Client -> Cloud Run -> ADK Agents -> Gemini Live API -> Firestore |
| Demo video < 4 minutes | Scripted: wrong pill catch, multilingual, reminders, dashboard |
| **Bonus**: IaC automation | Terraform in `infra/` |
| **Bonus**: Blog post | "#GeminiLiveAgentChallenge" tagged post |
| **Bonus**: GDG profile | Join and link |

---

## Project Structure

```
/Users/abishek/Medlive/
├── agents/                          # ADK agent package
│   ├── __init__.py                  # Exports root_agent
│   ├── agent.py                     # Root coordinator (routes to sub-agents)
│   ├── interpreter/
│   │   ├── __init__.py
│   │   ├── agent.py                 # Live voice translation + prescription reading
│   │   └── tools.py                 # translate_text, read_prescription, read_medication_label
│   ├── guardian/
│   │   ├── __init__.py
│   │   ├── agent.py                 # Medication reminders, pill verify, vitals, diet
│   │   └── tools.py                 # verify_pill, log_vitals, get_medication_schedule, log_meal
│   ├── insights/
│   │   ├── __init__.py
│   │   ├── agent.py                 # Adherence scoring, trends, digests, alerts
│   │   └── tools.py                 # get_adherence_score, get_trends, generate_digest, send_alert
│   └── shared/
│       ├── __init__.py
│       ├── prompts.py               # System instructions for all agents
│       └── constants.py             # Model names, config constants
│
├── app/                             # FastAPI application
│   ├── __init__.py
│   ├── main.py                      # FastAPI + WebSocket endpoint + static files
│   ├── services/
│   │   ├── __init__.py
│   │   ├── firestore_service.py     # Async Firestore CRUD wrapper
│   │   ├── medication_service.py    # Medication schedule logic
│   │   └── notification_service.py  # FCM push notifications
│   ├── models/
│   │   ├── __init__.py
│   │   ├── medication.py            # Pydantic: name, dosage, schedule, color, shape
│   │   ├── vitals.py                # Pydantic: BP, glucose, weight
│   │   └── user_profile.py          # Pydantic: profile, language, emergency contacts
│   ├── api/
│   │   ├── __init__.py
│   │   ├── reminders.py             # POST /api/trigger-reminder (Cloud Scheduler target)
│   │   ├── dashboard.py             # GET /api/dashboard/{user_id}
│   │   ├── character.py             # POST /api/character/generate (Gemini Image gen for avatar)
│   │   └── health.py                # GET /health (Cloud Run health check)
│   └── static/                      # Web UI (HTML/JS/CSS, no build step)
│       ├── index.html               # Parent voice UI (large mic button + camera toggle + avatar)
│       ├── onboarding.html          # Character selection/creation page (preset or describe)
│       ├── dashboard.html           # Family dashboard (charts, alerts, digests)
│       ├── css/style.css
│       └── js/
│           ├── app.js               # WebSocket client, audio/video handling
│           ├── audio-player.js      # PCM audio playback (AudioWorklet)
│           ├── audio-recorder.js    # Microphone capture (AudioWorklet)
│           └── camera.js            # Camera frame capture for pill verification
│
├── infra/                           # Terraform IaC (bonus points)
│   ├── main.tf                      # Provider config
│   ├── variables.tf
│   ├── outputs.tf
│   ├── cloud_run.tf                 # Cloud Run service
│   ├── firestore.tf                 # Firestore database
│   ├── scheduler.tf                 # Cloud Scheduler for reminders
│   └── iam.tf                       # Service accounts
│
├── scripts/
│   ├── setup_gcp.sh                 # One-time GCP project setup
│   ├── deploy.sh                    # Build + deploy to Cloud Run
│   └── seed_data.py                 # Seed Firestore with demo data
│
├── tests/
│   ├── test_tools.py                # Unit tests for agent tools
│   └── test_services.py             # Firestore service tests
│
├── .env.example
├── .gitignore
├── pyproject.toml                   # Dependencies: google-adk, fastapi, uvicorn, google-cloud-firestore, firebase-admin, pydantic
├── Dockerfile
├── docker-compose.yml               # Local dev: app + Firestore emulator
├── README.md
└── LICENSE
```

---

## Architecture Decisions

1. **Single Cloud Run service** (not microservices) - one FastAPI server hosts WebSocket for voice, REST APIs for scheduler/dashboard, and static files. One Dockerfile, one deploy.
2. **ADK native multi-agent routing** - root agent uses `sub_agents=[interpreter, guardian, insights]` with `transfer_to_agent` auto-delegation. No custom routing code.
3. **Web UI for parent (not Flutter)** - HTML/CSS/JS served from FastAPI. Voice-first with large mic button + camera toggle. Works on any device. No build step. Flutter would take too long to build + debug for the demo; a web app is universally accessible and simpler to deploy. The family dashboard can be a separate Next.js app if a frontend team member builds it, or static HTML if not.
4. **Custom WebSocket server** (not `adk web`) - based on [ADK bidi-demo pattern](https://github.com/google/adk-samples/tree/main/python/agents/bidi-demo). Needed for camera frames, REST endpoints, Firestore session persistence.
5. **Firestore as single database** - satisfies GCP requirement, has async Python client, local emulator for dev.
6. **RAG pipeline CUT** - too complex for 17 days. Rely on Gemini's built-in medical knowledge + strong disclaimers + tool-grounded responses from Firestore data.
7. **Python 3.12 + uv** - ADK requires 3.10+, uv is already installed for fast dependency management.
8. **Character avatars via Gemini 2.5 Flash Image (NanoBanana)** - Users can choose from preset companion personas OR describe their ideal health companion. Gemini's image generation creates a personalized avatar that appears in the UI during conversations. This leverages another Gemini capability (image gen) beyond voice/vision, boosting the "Innovation & Multimodal UX" score. The avatar is generated once and cached; it's shown as a static/animated character in the conversation UI.

---

## Implementation Phases

### Phase 1: Foundation & Scaffolding (Day 1)
**Goal**: Working dev environment with a basic streaming voice agent

| Task | Details |
|---|---|
| Init project | `uv init`, configure `pyproject.toml` with deps: `google-adk`, `fastapi`, `uvicorn[standard]`, `google-cloud-firestore`, `firebase-admin`, `python-dotenv`, `pydantic` |
| Git init | Initialize repo, `.gitignore`, initial commit |
| **Set GCP project** | `gcloud config set project medlive-488722` (already created) |
| **Enable billing** | Link billing account if not already done |
| **Enable APIs** | `gcloud services enable aiplatform.googleapis.com run.googleapis.com firestore.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com` |
| **Get API key** | Create Gemini API key from [AI Studio](https://aistudio.google.com/apikey) or via `gcloud services api-keys create --display-name=medlive` |
| **Create Artifact Registry** | `gcloud artifacts repositories create medlive --repository-format=docker --location=us-central1` |
| Minimal root agent | `agents/agent.py` with model + basic system instruction, no sub-agents yet |
| Bidi-streaming server | `app/main.py` - FastAPI + WebSocket based on ADK bidi-demo reference |
| Basic voice UI | `app/static/index.html` - mic button, WebSocket client, audio worklets |
| `.env.example` | `GOOGLE_API_KEY`, `GOOGLE_CLOUD_PROJECT` |

**Milestone**: Speak into browser mic, get Gemini voice response back.

**Key files**: `pyproject.toml`, `agents/agent.py`, `agents/__init__.py`, `app/main.py`, `app/static/index.html`, `app/static/js/app.js`, `app/static/js/audio-player.js`, `app/static/js/audio-recorder.js`

---

### Phase 2: Three-Agent System (Days 2-5)
**Goal**: All three sub-agents functional with tools, routing via ADK transfer

**Day 2 - Interpreter Agent**:
- `agents/interpreter/agent.py` - Agent definition with description for auto-routing
- `agents/interpreter/tools.py`:
  - `read_prescription(image_description: str) -> dict` - Triggers structured extraction from camera context
  - `read_medication_label(image_description: str) -> dict` - Extracts drug name, strength, expiry
- Note: Gemini Live API natively handles multilingual voice - no custom translation tool needed, just system instruction

**Day 3-4 - Guardian Agent** (THE CRITICAL PATH):
- `agents/guardian/agent.py` - Agent for medication management
- `agents/guardian/tools.py`:
  - `verify_pill(pill_description: str, expected_medication: str) -> dict` - **THE WOW FACTOR**. Compares camera-visible pill against Firestore medication record. Returns `{match, confidence, warning}`
  - `get_medication_schedule(user_id: str) -> dict` - Reads schedule from Firestore
  - `log_medication_taken(medication_name: str, taken: bool) -> dict` - Records adherence
  - `log_vitals(vital_type: str, value: float, unit: str) -> dict` - Writes vitals
  - `log_meal(description: str, meal_type: str) -> dict` - Logs dietary intake

**Day 5 - Insights Agent + Root Wiring**:
- `agents/insights/agent.py` - Analytics agent (can use non-streaming `gemini-2.0-flash`)
- `agents/insights/tools.py`:
  - `get_adherence_score(user_id: str, days: int) -> dict` - Computes adherence %
  - `get_vital_trends(user_id: str, vital_type: str, days: int) -> dict` - Detects trends
  - `generate_daily_digest(user_id: str) -> dict` - Summarizes the day
  - `send_family_alert(user_id: str, alert_type: str, message: str) -> dict` - FCM notification
- Update `agents/agent.py` with all three `sub_agents`

**Milestone**: Via `adk web`, test routing: "read this prescription" -> interpreter, "check my pills" -> guardian, "how's my adherence" -> insights.

---

### Phase 3: Firestore Data Layer (Days 6-8)
**Goal**: All tools read/write real data in Firestore

**Firestore Collections**:
```
users/{userId}                    # profile, language, emergency contacts
users/{userId}/medications/{medId} # name, dosage, schedule_times, color, shape, imprint
users/{userId}/encounters/{encId}  # timestamp, agent_used, transcript, actions
users/{userId}/vitals/{vitalId}    # timestamp, type (BP/glucose/weight), value, unit
users/{userId}/adherence/{date}    # per-medication taken/missed log
```

**Files**:
- `app/services/firestore_service.py` - Async Firestore client wrapper with all CRUD methods
- `app/models/medication.py`, `vitals.py`, `user_profile.py` - Pydantic models
- `scripts/seed_data.py` - Seeds demo user with 3-4 medications (Metformin 500mg white round, Lisinopril 10mg pink round, Atorvastatin 20mg white oval, Glimepiride 2mg green oblong), sample vitals, adherence history
- `docker-compose.yml` - App + Firestore emulator for local dev
- Wire all agent tools to use `FirestoreService`

**Key design**: Agent tools are `async` functions. ADK supports async tool functions. Session state is pre-loaded with user profile + medications when WebSocket connects.

**Milestone**: Voice conversation triggers Firestore writes. `verify_pill` returns `{match: False}` when describing a pill that doesn't match stored medication attributes.

---

### Phase 4: Camera Integration + Full Web UI (Days 9-11)
**Goal**: Parent-facing web UI with voice + camera for pill verification

**Camera module** (`app/static/js/camera.js`):
- Captures frames at 1 FPS from `getUserMedia` video stream
- Sends as base64 JPEG via WebSocket when camera toggle is active
- Used during pill verification: user says "let me show you" -> camera activates -> Gemini sees the pill

**Parent UI** (`app/static/index.html`):
- Large centered microphone button (primary interaction)
- Camera toggle button (for pill verification)
- Small video preview of camera feed
- Status indicator: "Listening...", "Speaking...", "Verifying pill..."
- Scrolling transcript display
- Large, high-contrast text (accessibility for elderly users)
- Language selector dropdown

**WebSocket protocol update** (`app/main.py`):
- Handle camera frame messages from client
- Forward as `image/jpeg` blobs to Gemini Live API via `live_request_queue.send_realtime()`
- Inject user context (medications, profile) into session state on connect
- Configure `SessionResumptionConfig` for reconnection handling

**Milestone**: Full voice conversation with camera. Show a pill, agent describes it and verifies against medication record. Wrong pill triggers vocal warning.

---

### Phase 4B: Personalized Character Avatar (Day 11, parallel with Phase 4)
**Goal**: Users can choose or create a personalized AI companion character

**How it works**:
1. **Onboarding page** (`app/static/onboarding.html`): First-time users see a character selection screen
   - **Preset characters** (4-5 options): "Dr. Priya" (Indian female doctor), "Abuela Rosa" (Latina grandmother nurse), "Dr. Chen" (male physician), "Nurse Maya" (young friendly nurse) — each with a pre-generated avatar image and matching voice personality
   - **Custom character**: User describes their ideal companion in text (e.g., "a warm grandmotherly figure with grey hair and glasses") and Gemini 2.5 Flash Image generates the avatar

2. **Character generation endpoint** (`app/api/character.py`):
   ```python
   @router.post("/api/character/generate")
   async def generate_character(request: CharacterRequest):
       """Uses Gemini 2.5 Flash Image to generate a companion avatar."""
       prompt = f"A friendly, warm healthcare companion character portrait: {request.description}.
                  Cartoon/illustration style, soft colors, approachable expression,
                  medical-themed, suitable for elderly users. No text."

       response = await client.models.generate_images(
           model="gemini-2.0-flash-exp",  # Image generation model
           prompt=prompt
       )
       # Save to Cloud Storage or encode as base64, store URL in user profile
       avatar_url = await save_avatar(request.user_id, response.images[0])
       return {"avatar_url": avatar_url}
   ```

3. **UI integration**: The character avatar appears in the conversation UI as a circular image that subtly animates (pulse/glow) when MedLive is speaking. This makes the voice agent feel like a real companion rather than a faceless bot.

4. **System instruction personalization**: The character's personality description is injected into the root agent's system instruction, so MedLive speaks in-character (e.g., Dr. Priya uses Indian English mannerisms, Abuela Rosa uses warm Spanish phrases).

**Why this matters for judging**:
- **Innovation & Multimodal UX (40%)**: Goes beyond voice — adds visual identity to the agent, uses Gemini for image generation AND voice AND vision
- **Makes it personal**: Elderly users connect better with a familiar, friendly face
- **Demo impact**: Showing character creation is a visually compelling moment in the video

**Files**: `app/static/onboarding.html`, `app/api/character.py`, `app/services/character_service.py`

**Milestone**: User describes a character, avatar is generated, appears in conversation UI while MedLive speaks.

---

### Phase 5: Proactive Reminders + Family Dashboard (Days 12-14)
**Goal**: Cloud Scheduler triggers medication reminders; family can view health status

**Cloud Scheduler** (Day 12-13):
- `app/api/reminders.py` - POST `/api/trigger-reminder` endpoint
  - Checks which medications are due for a user
  - Sends FCM push notification (or simplified: logs to Firestore for dashboard pickup)
  - If user has active WebSocket session, agent proactively speaks the reminder
- Pre-configure a reminder to trigger during demo recording

**Family Dashboard** (Day 14):
- `app/api/dashboard.py` - GET `/api/dashboard/{user_id}` returns aggregated data
- `app/static/dashboard.html` - Simple HTML page:
  - 7-day medication adherence chart (CSS bars or Chart.js)
  - Recent vital signs with trend arrows (up/down/stable)
  - Last 5 encounter summaries
  - Active alerts section (pill mismatches, missed doses)
  - All data fetched via `fetch()` calls to REST API

**Milestone**: Reminder triggers proactively during conversation. Family dashboard shows real adherence data from Firestore.

---

### Phase 6: Cloud Deployment + Terraform (Days 15-16)
**Goal**: Deployed to Cloud Run, accessible via public URL

**Dockerfile**:
- Base: `python:3.12-slim`
- Install uv, sync dependencies, copy app code
- `CMD: uv run uvicorn app.main:app --host 0.0.0.0 --port 8080`

**Terraform** (`infra/`):
- `cloud_run.tf` - Service with 1Gi memory, 2 CPU, session affinity (for WebSocket), min 0 / max 3 instances
- `firestore.tf` - Firestore Native database
- `scheduler.tf` - Cloud Scheduler jobs for medication reminders (8am, 12pm, 6pm, 10pm)
- `iam.tf` - Service accounts for Cloud Run, Cloud Scheduler

**Deploy script** (`scripts/deploy.sh`):
1. `gcloud builds submit` to build + push Docker image
2. `terraform apply` to provision infrastructure
3. `python scripts/seed_data.py` to seed demo data

**README.md** - Complete spin-up instructions:
- Prerequisites (GCP account, gcloud CLI, Terraform, uv)
- One-command local dev: `docker-compose up`
- One-command cloud deploy: `./scripts/deploy.sh`
- Architecture overview

**Milestone**: Cloud Run URL serves working voice app. Cloud Scheduler triggers reminders on schedule.

---

### Phase 7: Demo, Submission & Bonus (Day 17)
**Goal**: Polished submission with all required + bonus deliverables

**Demo Video Script (< 4 min)**:

| Time | Scene | Content |
|---|---|---|
| 0:00-0:25 | Personal Story | "My parents are in India. My colleague's abuela is in Mexico. We both worry every day..." Emotional hook. |
| 0:25-0:50 | Character Creation | User describes "a warm Indian grandmother doctor with a stethoscope." Gemini generates the avatar in real-time. "Meet Dr. Priya, your personal health companion." **VISUAL WOW.** |
| 0:50-1:25 | Hindi: Prescription Reading | Parent speaks Hindi to Dr. Priya. MedLive responds in Hindi. Shows prescription via camera — extracts medication name, dosage. |
| 1:25-2:25 | Spanish: **Wrong Pill Catch** | Switch to Abuela Rosa persona. Abuela speaks Spanish, MedLive reminds about Metformin. Shows wrong pill. MedLive catches it: "Espere, eso no coincide..." Shows correct pill. MedLive confirms + logs. **THE CRITICAL WOW MOMENT.** |
| 2:25-2:50 | English: Proactive Reminder | Cloud Scheduler triggers reminder. MedLive proactively speaks: "It's time for your evening medications." User reports vitals. |
| 2:50-3:15 | Family Dashboard | Adherence scores, vitals, alerts. Show alert from wrong-pill incident. |
| 3:15-3:45 | Architecture | Flash diagram. Cloud Run in GCP console. Highlight: ADK 3-agent system, Gemini Live API bidi-streaming, Gemini Image Gen for avatars, Firestore, Cloud Scheduler. |
| 3:45-4:00 | Closing | "MedLive: Because every parent deserves a health guardian that speaks their language, sees their pills, and knows their name." |

**Submission artifacts**:
1. Text description on DevPost
2. Public GitHub repo link
3. GCP deployment proof (screen recording of Cloud Run console)
4. Architecture diagram (created in draw.io or similar)
5. Demo video (recorded + edited, uploaded)
6. Blog post with #GeminiLiveAgentChallenge (bonus)
7. GDG profile link (bonus)

---

## Critical Path (Larger Team - Parallel Workstreams)

```
                    ABISHEK (Backend)          FRONTEND DEV             HEALTHCARE / QA
                    ─────────────────          ────────────             ───────────────
Day 1:              Scaffolding + GCP setup    Dev env setup            Research med terminology
Day 2:              Interpreter Agent          Prototype mic UI         Draft system prompts (Hindi/Spanish/English)
Day 3-4:            Guardian Agent             Build parent UI shell    Demo scenario scripts + pill photos
Day 5:              Insights Agent + Wiring    Audio worklets           Test agent prompts via adk web
Day 6-8:            Firestore integration      Camera module (JS)       Seed data (medications, vitals)
Day 9-11:           WebSocket server           Full parent UI + camera  E2E testing all 3 languages
Day 11:             Character gen API          Onboarding UI + avatars  Character persona prompts
Day 12-13:          Cloud Scheduler            Family dashboard         Test reminders + alerts
Day 14:             Dashboard API              Dashboard polish         User testing with real elderly user
Day 15-16:          Cloud Run + Terraform      Deploy verification      Architecture diagram + blog draft
Day 17:             Final deploy + fixes       Demo video recording     Video editing + submission writeup
```

**If time runs short**: Cut family dashboard to static mockup. Simplify Cloud Scheduler to manual trigger. Focus on the three demo-critical flows: (1) Hindi prescription reading, (2) Spanish wrong pill catch, (3) English proactive reminder.

---

## What's Built vs. Simplified vs. Cut

| Feature | Level | Who Owns | Why |
|---|---|---|---|
| Bidi voice streaming (Gemini Live API) | **FULL** | Abishek | Core hackathon requirement, 40% of judging |
| Pill verification via camera | **FULL** | Abishek + Frontend | The "wow factor" differentiator |
| Multi-agent routing (ADK, 3 agents) | **FULL** | Abishek | Shows technical sophistication |
| Firestore persistence | **FULL** | Abishek | Required GCP service |
| Hindi + Spanish + English voice | **FULL** | All | Gemini handles natively; system instructions + demo scripts drive it |
| Prescription/label reading (camera) | **FULL** | Abishek + Frontend | Gemini vision + structured tool output |
| Parent web UI (voice + camera) | **FULL** | Frontend Dev | Polished, accessible, elderly-friendly |
| Cloud Scheduler reminders | **FULL** | Abishek | Pre-configure demo triggers |
| Family dashboard | **MODERATE** | Frontend Dev | Static HTML + Chart.js; upgrade to Next.js if time allows |
| FCM notifications | **MODERATE** | Abishek | Real FCM for family alerts; fallback to Firestore-based |
| Terraform IaC | **MODERATE** | Abishek | Enough .tf files for full infra + bonus points |
| Demo video + blog post | **FULL** | Healthcare/QA | Professional quality for 30% judging weight |
| Character avatars (Gemini Image Gen) | **FULL** | Frontend + Abishek | Preset characters + custom generation via NanoBanana/Gemini 2.5 Flash Image; adds visual wow factor |
| Vertex AI RAG (SNOMED/ICD-10) | **CUT** | -- | Too complex; rely on Gemini's knowledge + disclaimers |
| Flutter mobile app | **CUT** | -- | Web UI instead; works on all devices via browser |

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Gemini Live API latency | Use Flash model, buffering strategy, fallback to async translation |
| Pill verification accuracy | Confidence threshold, always ask user to confirm, disclaimer |
| Medical hallucinations | Strong system instructions, tool-grounded responses from Firestore, explicit disclaimers |
| WebSocket timeout on Cloud Run | Session affinity in Terraform, ADK `SessionResumptionConfig` |
| Time crunch (17 days) | Prioritize demo-critical paths, cut dashboard/RAG if needed |
| Demo reliability | Pre-seed Firestore with known data, rehearse demo flow, have backup recording |

---

## Verification Strategy

1. **After Phase 1**: Speak into browser, get voice response back
2. **After Phase 2**: Test agent routing via `adk web` - each intent routes to correct agent
3. **After Phase 3**: Voice conversation triggers Firestore writes; `verify_pill` correctly rejects mismatched pills
4. **After Phase 4**: Full browser demo - voice + camera pill verification end-to-end
5. **After Phase 5**: Cloud Scheduler triggers reminder during active session; dashboard shows real data
6. **After Phase 6**: Cloud Run URL serves full app; all flows work on deployed version
7. **After Phase 7**: Demo video under 4 minutes, all submission artifacts complete

---

## Team Roles & Parallel Workstreams

| Role | Focus | Phases |
|---|---|---|
| **Abishek (Lead / AI Engineer)** | Gemini Live API, ADK multi-agent, Cloud Run, Firestore, Terraform | All phases - owns backend |
| **Frontend Developer** | Parent web UI (voice + camera), family dashboard (Next.js or static), CSS/UX | Joins Phase 4 (Day 9+), owns UI polish |
| **Healthcare Advisor / QA** | Medical terminology validation, demo scenario design, blog post, video editing, user testing | Joins Phase 2 (Day 3+) for prompts, leads Phase 7 |

**Parallelization opportunities**:
- While Abishek builds agents (Phase 2), Frontend Dev can prototype UI components and Healthcare Advisor can draft system prompts + demo scenarios
- While Abishek does Firestore integration (Phase 3), Frontend Dev can build the parent UI shell and dashboard layout
- Phase 4 (camera integration) and Phase 5 (dashboard + reminders) can overlap across team members
- Phase 7 (demo video) can be split: one person records, one edits, one writes blog post

---

## Key Files to Implement (in priority order)

1. `app/main.py` - FastAPI + WebSocket server (the backbone)
2. `agents/agent.py` - Root coordinator with sub_agents
3. `agents/guardian/tools.py` - `verify_pill()` is the wow factor
4. `app/services/firestore_service.py` - Async Firestore wrapper
5. `agents/guardian/agent.py` - Guardian agent definition
6. `agents/interpreter/agent.py` + `tools.py` - Interpreter agent
7. `agents/insights/agent.py` + `tools.py` - Insights agent
8. `app/static/index.html` + `js/app.js` - Parent voice UI
9. `app/static/js/camera.js` - Camera frame capture
10. `app/api/reminders.py` - Cloud Scheduler endpoint
11. `app/static/dashboard.html` + `js/dashboard-app.js` - Family dashboard
12. `infra/*.tf` - Terraform configs
13. `Dockerfile` + `docker-compose.yml` - Containerization
14. `scripts/seed_data.py` - Demo data seeding
15. `README.md` - Spin-up instructions
