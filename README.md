# MedLive — Real-Time Multilingual AI Health Guardian

> Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) · March 2026

MedLive is a **voice-first, vision-enabled AI health companion** for elderly patients managing complex medication regimens across language barriers. It speaks **Hindi, Spanish, and English**, reads prescriptions and lab reports via camera, catches wrong pills before they're swallowed, sends proactive reminders, and keeps family caregivers informed through a live dashboard.

---

## ✨ Features

| Feature | What it does |
|---------|-------------|
| 🎙️ **Voice Guardian** | Real-time bidi voice conversation (Gemini Live API) in Hindi, Spanish, English |
| 💊 **Pill Verification** | Point camera at pills → AI confirms correct medication, dose, and timing |
| 📄 **Prescription Scanning** | Photograph prescription → extracts medications → stores to Firestore |
| 🧪 **Lab Report Reading** | Photograph lab results → structured extraction → caregiver dashboard |
| 🚨 **Emergency Protocol** | Red-line keyword detection (chest pain, stroke, etc.) → immediate emergency guidance + family alert |
| 📲 **Proactive Reminders** | FCM push notifications at medication times; no app-open required |
| 👨‍👩‍👧 **Family Dashboard** | Live adherence charts, vitals trends, missed dose alerts for caregivers |
| 📞 **Family Calling** | "Call my son" → Twilio PSTN bridge to family member's phone |
| 🌐 **Multilingual** | All responses auto-detected from user's preferred language |

---

## 🏗️ Architecture

```
Browser (voice + camera)
  ├── Firebase Auth (Google Sign-In)
  ├── WebSocket /ws/{uid}?token=...
  │     ├── Upstream:  16kHz PCM mic  → ADK → Gemini Live API
  │     └── Downstream: Gemini audio  → 24kHz PCM → speakers
  └── REST: profile, dashboard, scan, avatar, family, reminders

Cloud Run (FastAPI + uvicorn)
  ├── ADK Runner → root_agent
  │     ├── Guardian agent   — medications, vitals, meals, emergency
  │     ├── Insights agent   — adherence scoring, trends, daily digest
  │     └── Interpreter agent — prescriptions, translation
  ├── Gemini Live API (gemini-2.5-flash-native-audio-latest)
  ├── Gemini 2.0 Flash (prescription/report extraction)
  ├── Imagen 3 (avatar generation)
  └── Cloud Firestore (users, medications, vitals, adherence, alerts)

Cloud Scheduler → POST /api/reminders/trigger (every 15 min)
```

[View full architecture diagram →](docs/architecture.html)

---

## 🚀 Quick Start — No Docker

The fastest way to run locally uses in-memory mock data (no Firebase required):

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/medlive.git
cd medlive

# 2. Install dependencies (requires uv: https://docs.astral.sh/uv/)
uv sync

# 3. Configure
cp .env.example .env
# Edit .env — set GOOGLE_API_KEY and USE_FIRESTORE=false

# 4. Run
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 5. Open http://localhost:8000
```

With `USE_FIRESTORE=false`, all data is held in-memory using `agents/shared/mock_data.py` — no Firebase or GCP credentials needed.

---

## 🐳 Local Dev with Docker + Firestore Emulator

```bash
cp .env.example .env
# Edit .env — set GOOGLE_API_KEY (required for Gemini)

# Start app + Firestore emulator + seed demo data
docker-compose up

# App:             http://localhost:8000
# Emulator UI:     http://localhost:4000

# Tear down
docker-compose down -v
```

The `seed` service automatically populates the emulator with Maria Garcia's demo profile, 4 medications, 7 days of adherence history, and vitals logs.

---

## ☁️ Cloud Run Deployment

### Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`)
- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5 (for IaC path)
- Firebase project linked to your GCP project
- Docker (for Cloud Build)

### Option A — Shell Scripts (recommended for first deploy)

```bash
# 1. One-time GCP setup (APIs, secrets, IAM, Cloud Scheduler)
#    Requires: GOOGLE_API_KEY in .env, credentials/firebase-admin-sdk.json present
bash scripts/setup_gcp.sh

# 2. Build + deploy + seed
bash scripts/deploy.sh

# 3. Post-deploy (manual — Firebase Console)
#    Enable Google Sign-In:
#    https://console.firebase.google.com/project/medlive-488722/authentication/providers
#
#    Add Cloud Run URL to Authorized Domains:
#    https://console.firebase.google.com/project/medlive-488722/authentication/settings
```

### Option B — Terraform IaC (bonus points ✨)

```bash
cd infra

# First deploy: create secrets first via setup_gcp.sh, then:
terraform init
terraform plan -var="image=gcr.io/medlive-488722/medlive"
terraform apply -var="image=gcr.io/medlive-488722/medlive"

# After getting the Cloud Run URL, activate the Scheduler:
terraform apply \
  -var="image=gcr.io/medlive-488722/medlive" \
  -var="app_url=https://medlive-HASH-uc.a.run.app"
```

### Re-deploy After Code Changes

```bash
bash scripts/deploy.sh --skip-seed   # rebuild image + deploy, skip Firestore seed
```

---

## 🔐 Firebase Setup

1. **Create Firebase project** linked to GCP project `medlive-488722`
2. **Enable Google Sign-In**: Firebase Console → Authentication → Sign-in providers → Google → Enable
3. **Download service account**: Project Settings → Service Accounts → Generate new private key → save as `credentials/firebase-admin-sdk.json`
4. **Add authorized domains**: Authentication → Settings → Authorized domains → add your Cloud Run URL

---

## 🌱 Seed Demo Data

To populate Firestore with Maria Garcia's demo profile (4 medications, 7 days of vitals and adherence):

```bash
# Requires GOOGLE_APPLICATION_CREDENTIALS pointing to firebase-admin-sdk.json
uv run python scripts/seed_firestore.py
```

Demo user ID: `demo_user`
Demo patient: **Maria Garcia**, 72, medications: Metformin, Lisinopril, Atorvastatin, Glimepiride

---

## 🧪 Running Tests

```bash
uv run pytest tests/ -v
# 22/22 passing — guardian, insights, interpreter tool tests
```

---

## 📁 Project Structure

```
medlive/
├── agents/                    # Google ADK multi-agent system
│   ├── agent.py               # Root coordinator
│   ├── guardian/              # Medications, vitals, emergency, calling
│   ├── insights/              # Adherence scoring, trends, alerts
│   ├── interpreter/           # Prescriptions, translation, reports
│   └── shared/                # Prompts, constants, Firestore service, mock data
├── app/
│   ├── main.py                # FastAPI app — WebSocket, REST endpoints
│   ├── api/
│   │   ├── avatar.py          # POST /api/avatar/generate (Imagen 3)
│   │   ├── calling.py         # POST /api/calling/initiate (Twilio)
│   │   ├── family.py          # Family link code generate/verify
│   │   ├── reminders.py       # POST /api/reminders/trigger (Cloud Scheduler)
│   │   └── scan.py            # POST /api/scan (Gemini Vision extraction)
│   └── static/
│       ├── index.html         # Patient voice UI
│       ├── auth.html          # Google Sign-In
│       ├── onboarding.html    # 2-step onboarding (language, avatar)
│       ├── dashboard.html     # Family caregiver dashboard
│       └── js/
│           ├── app.js         # WebSocket client, audio pipeline controller
│           ├── audio-player.js    # 24kHz PCM playback (AudioWorklet)
│           ├── audio-recorder.js  # 16kHz mic capture (AudioWorklet)
│           └── camera.js          # Camera frame capture
├── infra/                     # Terraform IaC
│   ├── main.tf                # Provider + APIs
│   ├── cloud_run.tf           # Cloud Run service
│   ├── firestore.tf           # Firestore + indexes
│   ├── scheduler.tf           # Cloud Scheduler (reminders)
│   ├── iam.tf                 # Service accounts + roles
│   ├── secrets.tf             # Secret Manager wiring
│   ├── variables.tf
│   └── outputs.tf
├── scripts/
│   ├── setup_gcp.sh           # One-time GCP project setup
│   ├── deploy.sh              # Build + deploy to Cloud Run
│   └── seed_firestore.py      # Seed Firestore with demo data
├── tests/
│   └── test_tools.py          # 22 async tool tests
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
└── .env.example
```

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | ✅ | Gemini API key from [AI Studio](https://aistudio.google.com/app/apikey) |
| `GOOGLE_CLOUD_PROJECT` | ✅ | GCP project ID |
| `GOOGLE_CLOUD_LOCATION` | ✅ | GCP region (e.g. `us-central1`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | For Firestore | Path to Firebase Admin SDK JSON |
| `GOOGLE_GENAI_USE_VERTEXAI` | | `TRUE` to route via Vertex AI (default: `FALSE`) |
| `MEDLIVE_MODEL` | | Gemini model (default: `gemini-2.5-flash-native-audio-latest`) |
| `USE_FIRESTORE` | | `true` for Firestore, `false` for in-memory mock |
| `REMINDERS_TRIGGER_SECRET` | For reminders | Bearer token for Cloud Scheduler auth |
| `MEDLIVE_APP_URL` | For reminders | Public URL of deployed app |
| `VAPID_KEY` | For push | Firebase Cloud Messaging VAPID key |
| `TWILIO_ACCOUNT_SID` | For calling | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | For calling | Twilio auth token |
| `TWILIO_FROM_NUMBER` | For calling | Twilio phone number (E.164 format) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Voice AI | Gemini Live API (`gemini-2.5-flash-native-audio-latest`) |
| Vision AI | Gemini 2.0 Flash (prescription/report extraction) |
| Image Gen | Imagen 3 (avatar generation) |
| Agent Framework | Google ADK (Agent Development Kit) |
| Backend | Python 3.12, FastAPI, WebSocket |
| Auth | Firebase Authentication (Google Sign-In) |
| Database | Cloud Firestore |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| Calling | Twilio PSTN bridge |
| Hosting | Google Cloud Run |
| IaC | Terraform |
| Scheduler | Google Cloud Scheduler |
| Package Manager | uv |

---

## 🎬 Demo Script

1. **Onboarding**: Sign in → choose language (Hindi) → generate avatar
2. **Greeting**: "Namaste! Main aapka swasthya sahayak hoon…" (warm Hindi greeting)
3. **Medication reminder**: AI proactively asks about morning Metformin + Glimepiride
4. **Pill verification**: Hold up wrong pill → "Yeh Aspirin hai, Metformin nahin!" (wrong pill caught)
5. **Prescription scan**: Tap scan button → photograph prescription → shows extracted medications
6. **Emergency protocol**: Say "seene mein dard" → AI: "Yeh ek medical emergency hai. 112 pe call karein abhi."
7. **Dashboard**: Family member views live adherence chart, vitals trend, alerts

---

## 📄 License

MIT — see [LICENSE](LICENSE)
