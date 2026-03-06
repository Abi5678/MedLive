# MedLive: Hackathon Architecture & Implementation Guide

This document provides a comprehensive overview of the MedLive project architecture, technical decisions, and implementation details for the Gemini Live Agent Challenge hackathon.

## System Architecture Overview

MedLive is built on a streamlined, serverless architecture leveraging Google Cloud and the Gemini Live API.

### High-Level Components

1.  **Frontend (Vanilla HTML/JS/CSS)**
    *   **Core App (`app/static/index.html`)**: A lightweight, accessible, mobile-responsive web application requiring no build step (no React/Angular overhead). Uses pure WebSockets and `AudioWorklet` for real-time PCM audio streaming.
    *   **Family Dashboard (`app/static/dashboard.html`)**: A static view for caregivers to monitor adherence, vitals, and alerts via REST APIs.
    *   **Onboarding (`app/static/onboarding.html`)**: Visual setup flow for new users to define their health profile and generate a custom AI companion avatar.

2.  **Backend (FastAPI + Python)**
    *   **Single Serverless Instance (`app/main.py`)**: A single FastAPI application hosted on Google Cloud Run. It manages the WebSocket connections from the frontend and acts as the orchestrator for the Google Agent Development Kit (ADK).
    *   **Google ADK Router (`agents/agent.py`)**: The central brain using the `RoutingFlow` pattern to dynamically route user intents to specialized sub-agents.
    *   **RAG/Database Layer (`app/services/firestore_service.py`)**: Asynchronous integration with Google Cloud Firestore to persist profiles, medications, vitals, and action logs.

3.  **Google Cloud Infrastructure (via Terraform)**
    *   **Cloud Run**: Auto-scaling serverless hosting.
    *   **Firestore**: NoSQL document database.
    *   **Cloud Scheduler & Cloud Tasks**: Drives the proactive reminder system and async background jobs (e.g., triggering the daily medication digest).

---

## Agentic AI Design (Google ADK)

We implemented an advanced, multi-agent orchestration pattern utilizing the `gemini-2.5-flash-native-audio-preview` model for bidirectional streaming.

### 1. Root Router Agent (`agents/agent.py`)
*   **Role**: Traffic controller.
*   **Mechanism**: Uses `live_request_queue` and system prompts to analyze the user's initial utterances and silently delegate the connection to the appropriate sub-agent.

### 2. Onboarding Specialist (`agents/onboarding/agent.py`)
*   **Role**: Handles first-time users.
*   **Functionality**: Gathers baseline health data (allergies, persistent conditions) through casual conversation and saves it to Firestore via the `complete_onboarding_and_save` tool.
*   **Innovation**: Uses proactive handover logic. Once onboarding is complete, it injects a hidden system prompt signaling the Guardian agent to take over and warmly introduce itself immediately, preventing awkward silence.

### 3. Guardian Agent (`agents/guardian/agent.py`)
*   **Role**: The primary daily care orchestrator.
*   **Key Tools**:
    *   `verify_pill`: **(Core Innovation)** Analyzes real-time camera frames (sent over the WebSocket as base64 JPEG blobs) to identify a pill and cross-reference its visual characteristics against the user's prescribed medication in Firestore.
    *   `log_vitals`: Listens to user-reported vitals (e.g., "My blood sugar is 190"). Features an **emergency hook** that intercepts dangerous values and dynamically pushes a `[SYSTEM DIRECTIVE]` back into the LLM context to pivot behavior to emergency management.
    *   `log_medication_schedule`: Updates the daily routine.

### 4. Booking Desk Agent (`agents/booking/agent.py`)
*   **Role**: Medical appointment logistics.
*   **Key Tools**:
    *   `find_nearby_hospitals` & `find_available_slots`: Emulates an EHR scheduling integration.
    *   `confirm_appointment`: Secures the slot.
    *   **Generative UI**: Commands custom CSS/HTML cards to appear in the frontend chat transcript to visually summarize complex booking data.

### 5. Insights Strategist (`agents/insights/agent.py`)
*   **Role**: Generates high-level health strategies and nutrition plans.
*   **Key Tools**:
    *   `suggest_safe_recipes`: Implements a **Two-Pass LLM Validation** algorithm. It generates a recipe, checks it against the user's allergy profile drawn from Firestore, corrects itself if violations exist, and finally outputs safe JSON.
    *   `draft_dietary_plan`: A caregiver approval workflow triggering an async pending state.

---

## Real-Time Modalities & Customization

### Multimodal Vision + Voice
The frontend uses `getUserMedia` to capture 1 FPS video frames when the user activates the camera. These frames are sent transparently through the Python WebSocket backend directly into the `gemini-2.5-flash-native-audio-preview` stream. The model combines the visual context of the pill with the audio context of the user asking "Is this the right medication?" to perform verification.

### Generative Avatars (Gemini Image Generation)
During onboarding, users can describe their ideal companion (e.g., "A friendly golden retriever wearing glasses"). The backend invokes `gemini-2.0-flash-exp` (or the respective image API) to generate a 2D illustration. This image is stored, passed to the frontend, blended into the UI with CSS multiply blend modes, and features dynamic CSS keyframe "breathing" animations synced to the model's audio output activity.

### Proactive Reminders (Cloud Tasks & WebSockets)
Traditional chatbots wait for the user to speak. MedLive is proactive:
1.  **Cloud Scheduler** triggers a Cloud Task endpoint (`/api/tasks/reminder`).
2.  The endpoint looks up connected WebSocket sessions in a global registry.
3.  If the user is active, it injects a dynamic prompt (e.g., `[SYSTEM_INJECTION: Tell the user it's time for their evening Lisinopril]`) directly into the Gemini live session.
4.  Gemini instantly synthesizes voice and speaks to the user unprompted.

---

## Technical Learnings & Bug Fixes

*   **Audio Sample Rates**: Browsers capture mic audio at varying hardware sample rates (e.g., 44.1kHz or 48kHz on Macs). The Gemini API expects strict 16kHz PCM. We had to build a custom `AudioWorkletProcessor` (`pcm-recorder-processor.js`) that downsamples raw Float32 data to Int16 at exactly 16kHz before sending it over the WebSocket.
*   **Transcript Streaming Accumulation**: Gemini's `input_transcription` and `output_transcription` events emit cumulative strings for the current turn. Attempting to concatenate them led to duplicated text (e.g., "HelloHello"). The implementation was fixed to strictly replace the active DOM element's text content with the latest payload until `turn_complete` fires.

---

## Setup & Deployment Guide

This project is fully automated via Terraform for Google Cloud Run.

### Local Development

1. Ensure Python 3.12 and `uv` are installed.
2. Clone the repository and install dependencies:
   ```bash
   uv sync
   ```
3. Copy `.env.example` to `.env` and add your `GOOGLE_API_KEY` and `GOOGLE_CLOUD_PROJECT`.
4. Start the server:
   ```bash
   uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Deploying to Google Cloud

The `infra/` folder contains the Terraform configuration for Cloud Run and Firestore.

```bash
# 1. Initialize Terraform
cd infra
terraform init

# 2. Provision Infrastructure
terraform apply -var="project_id=YOUR_PROJECT_ID" -var="gemini_api_key=YOUR_KEY"

# 3. Build & Deploy Image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/medlive
gcloud run deploy medlive --image gcr.io/YOUR_PROJECT_ID/medlive --platform managed
```

Have fun presenting the demo!
