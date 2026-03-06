/**
 * MedLive WebSocket Client & UI Controller (Phase 4)
 *
 * Handles:
 * - Firebase Auth gate (redirect to auth.html if not signed in)
 * - WebSocket connection with real Firebase UID + ID token
 * - Audio recording (microphone) and playback (Gemini responses)
 * - Camera frame capture for pill verification
 * - Streaming transcript accumulation
 * - Custom avatar + companion name from localStorage
 * - Hero avatar tap to start/stop listening
 * - Chat-active body class triggers layout transition
 */

import { AudioRecorder } from "./audio-recorder.js";
import { AudioPlayer } from "./audio-player.js";
import { CameraManager } from "./camera.js";

// ---------------------------------------------------------------------------
// Auth gate — must be signed in before anything else
// ---------------------------------------------------------------------------

const uid = localStorage.getItem("medlive_uid");
const idToken = localStorage.getItem("medlive_id_token");

if (!uid || !idToken) {
  window.location.href = "/static/auth.html";
  // halt execution while redirect happens
  throw new Error("Redirecting to auth");
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let websocket = null;
let audioRecorder = null;
let audioPlayer = null;
let cameraManager = null;

let isConnected = false;
let isListening = false;
let hasGreeted = false;
let isGeminiReady = false;   // true after server sends {type:"ready"}
let pendingGreeting = false; // true if user tapped before Gemini was ready
let cameraInterval = null;
let upstreamFlushIntervalId = null; // cleared in stopListening

// Streaming transcript: track the current "live" agent bubble
let currentAgentBubble = null;
let accumulatedAgentText = "";

// Same for user (input_transcription is also cumulative)
let currentUserBubble = null;
let accumulatedUserText = "";

// Track current UI mode to avoid redundant DOM thrashing on every audio chunk
let currentStatusMode = "";

// Debounced scroll — batches scrollTop updates to one per animation frame
let _scrollPending = false;
function scheduleTranscriptScroll() {
  if (_scrollPending) return;
  _scrollPending = true;
  requestAnimationFrame(() => {
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
    _scrollPending = false;
  });
}

// ---------------------------------------------------------------------------
// Locale strings
// ---------------------------------------------------------------------------

const LOCALE = {
  en: {
    listening: "Listening...", speaking: "Speaking...", tapToSpeak: "Tap to speak",
    you: "You", disconnected: "Disconnected",
    pill: "Verify Pill", appts: "My Appointments", doctor: "Call Doctor", sos: "Emergency",
  },
  hi: {
    listening: "Sun raha hoon...", speaking: "Bol raha hoon...", tapToSpeak: "Bolne ke liye tap karein",
    you: "Aap", disconnected: "Disconnected",
    pill: "Goli Jaanchen", appts: "Meri Appointments", doctor: "Doctor ko Call", sos: "Emergency",
  },
  es: {
    listening: "Escuchando...", speaking: "Hablando...", tapToSpeak: "Toca para hablar",
    you: "Tú", disconnected: "Desconectado",
    pill: "Verificar Pastilla", appts: "Mis Citas", doctor: "Llamar Doctor", sos: "Emergencia",
  },
  kn: {
    listening: "ಆಲಿಸುತ್ತಿದ್ದೇನೆ...", speaking: "ಮಾತನಾಡುತ್ತಿದ್ದೇನೆ...", tapToSpeak: "ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ",
    you: "ನೀವು", disconnected: "ಸಂಪರ್ಕ ಕಡಿತ",
    pill: "ಮಾತ್ರೆ ಪರಿಶೀಲಿಸಿ", appts: "ನನ್ನ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್", doctor: "ವೈದ್ಯರಿಗೆ ಕರೆ ಮಾಡಿ", sos: "ತುರ್ತು",
  },
};

const LANG_TO_LOCALE = {
  "English": LOCALE.en,
  "Hindi": LOCALE.hi,
  "Spanish": LOCALE.es,
  "Kannada": LOCALE.kn,
};

const LANG_TO_GREETING = {
  "English": "Hello! How can I help you today?",
  "Hindi": "Namaste! Main aapki kaise madad kar sakti hoon?",
  "Spanish": "¡Hola! ¿En qué te ayudo?",
  "Kannada": "ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
};

// Language + companion name from localStorage (written by onboarding)
const language = localStorage.getItem("medlive_language") || "English";
let currentLocale = LANG_TO_LOCALE[language] || LOCALE.en;

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------

const statusText = document.getElementById("status-text");
const transcript = document.getElementById("transcript");
const transcriptDrawer = document.getElementById("transcript-drawer");
const drawerHandle = document.getElementById("drawer-handle");
const avatarHeroTap = document.getElementById("avatar-hero-tap");
const avatarImg = document.getElementById("companion-avatar");
const avatarName = document.getElementById("companion-name");
const avatarGreeting = document.getElementById("companion-greeting");
const avatarBubble = document.getElementById("avatar-bubble");
const showPillBtn = document.getElementById("show-pill-btn");
const cameraContainer = document.getElementById("camera-container");
const closeCameraBtn = document.getElementById("close-camera-btn");
const chatEndBtn = document.getElementById("chat-end-btn");

// ---------------------------------------------------------------------------
// Initialize persona UI from localStorage
// ---------------------------------------------------------------------------

function initPersonaUI() {
  const companionName = localStorage.getItem("medlive_companion_name") || "Health Companion";
  const avatarB64 = localStorage.getItem("medlive_avatar");

  // Set companion name
  if (avatarName) avatarName.textContent = companionName;

  // Set greeting
  const greeting = LANG_TO_GREETING[language] || LANG_TO_GREETING["English"];
  if (avatarGreeting) avatarGreeting.textContent = greeting;

  // Set custom avatar if available
  if (avatarImg && avatarB64) {
    avatarImg.src = avatarB64;
    avatarImg.style.display = "block";
    const fallback = document.getElementById("avatar-icon-fallback");
    if (fallback) fallback.style.display = "none";
  }

  // Apply localized button labels
  const lPill = document.getElementById("label-pill");
  const lAppts = document.getElementById("label-appts");
  const lDoctor = document.getElementById("label-doctor");
  const lSos = document.getElementById("label-sos");
  if (lPill) lPill.textContent = currentLocale.pill;
  if (lAppts) lAppts.textContent = currentLocale.appts;
  if (lDoctor) lDoctor.textContent = currentLocale.doctor;
  if (lSos) lSos.textContent = currentLocale.sos;
}

initPersonaUI();

// ---------------------------------------------------------------------------
// Token refresh: keep Firebase ID token fresh every 50 min
// ---------------------------------------------------------------------------

async function refreshToken() {
  if (idToken === "demo") return; // skip when using skip-auth-for-testing
  try {
    // firebase global is available from the compat SDK loaded in index.html
    const user = firebase.auth().currentUser;
    if (!user) {
      console.warn("[MedLive] refreshToken: no current user, skipping");
      return;
    }
    const newToken = await user.getIdToken(/* forceRefresh= */ true);
    localStorage.setItem("medlive_id_token", newToken);
    console.log("[MedLive] Token refreshed successfully");
  } catch (e) {
    console.error("[MedLive] Token refresh failed:", e);
    // If refresh fails, redirect to auth so user can re-sign in
    window.location.href = "/static/auth.html";
  }
}

setInterval(refreshToken, 50 * 60 * 1000);

// ---------------------------------------------------------------------------
// FCM push reminders: register token + preferences when user allows notifications
// ---------------------------------------------------------------------------

async function registerRemindersIfEnabled() {
  try {
    const res = await fetch("/api/config");
    const config = await res.json();
    const vapidKey = config.vapidKey && config.vapidKey.trim();
    if (!vapidKey) return;

    if (!("Notification" in window) || !firebase.messaging) return;
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.register("/static/firebase-messaging-sw.js", {
      scope: "/static/",
    });
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) return;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const registerRes = await fetch("/api/reminders/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("medlive_id_token")}`,
      },
      body: JSON.stringify({
        fcm_token: token,
        reminder_meds_enabled: true,
        reminder_lunch_enabled: true,
        lunch_reminder_time: "12:00",
        timezone,
      }),
    });
    if (registerRes.ok) {
      localStorage.setItem("medlive_reminders_registered", "1");
      console.log("[MedLive] Reminders registered");
    }
  } catch (e) {
    console.warn("[MedLive] Reminders registration skipped or failed:", e);
  }
}

// Run once after a short delay so we don't block initial load
if (typeof Promise !== "undefined" && typeof fetch !== "undefined") {
  setTimeout(registerRemindersIfEnabled, 3000);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function setStatus(text, mode = "") {
  if (statusText) statusText.textContent = text;

  // Guard: skip classList churn if mode hasn't changed (called on every audio chunk)
  if (mode === currentStatusMode) return;
  currentStatusMode = mode;

  document.body.classList.remove("listening", "speaking");
  if (mode === "listening") {
    document.body.classList.add("listening");
  } else if (mode === "active") {
    document.body.classList.add("speaking");
  }
}

/**
 * Append or stream text into the transcript drawer.
 */
function appendTranscript(text, role, streaming = false) {
  // Show chat panel when first message arrives
  if (transcriptDrawer.classList.contains("collapsed")) {
    transcriptDrawer.classList.remove("collapsed");
    document.body.classList.add("chat-active");
  }

  // Streaming text: update existing bubble with latest transcription.
  // Gemini native audio sends cumulative text (full turn so far), so replace.
  if (streaming && role === "agent" && currentAgentBubble) {
    accumulatedAgentText = text;
    const content = currentAgentBubble.querySelector(".message-content");
    content.textContent = accumulatedAgentText;
    scheduleTranscriptScroll();
    return;
  }
  if (streaming && role === "user" && currentUserBubble) {
    // Gemini input_transcription sends cumulative text for the whole turn so far, so replace.
    accumulatedUserText = text;
    const content = currentUserBubble.querySelector(".message-content");
    content.textContent = accumulatedUserText;
    scheduleTranscriptScroll();
    return;
  }

  // Create a new message bubble
  const div = document.createElement("div");
  div.className = `message ${role}`;

  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user"
    ? currentLocale.you
    : (avatarName ? avatarName.textContent.split(" ")[0] : "");

  const content = document.createElement("span");
  content.className = "message-content";
  content.textContent = text;

  div.appendChild(label);
  div.appendChild(content);
  transcript.appendChild(div);
  scheduleTranscriptScroll();

  if (role === "agent") {
    currentAgentBubble = div;
    accumulatedAgentText = text;
  } else if (role === "user") {
    currentUserBubble = div;
    accumulatedUserText = text;
  }
}

// ---------------------------------------------------------------------------
// Camera Logic
// ---------------------------------------------------------------------------

async function toggleCamera() {
  if (!cameraManager) {
    cameraManager = new CameraManager("camera-video");
  }

  if (cameraManager.isActive) {
    cameraManager.stop();
    cameraContainer.classList.remove("active");
    if (cameraInterval) clearInterval(cameraInterval);
  } else {
    const started = await cameraManager.start();
    if (started) {
      cameraContainer.classList.add("active");

      cameraInterval = setInterval(() => {
        const b64 = cameraManager.captureFrameBase64();
        if (b64 && websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: "image", data: b64 }));
        }
      }, 1000);

      if (!isListening) startListening();
    }
  }
}

if (showPillBtn) {
  showPillBtn.addEventListener("click", () => {
    toggleCamera();

    if (websocket && isGeminiReady) {
      websocket.send(JSON.stringify({
        type: "text",
        text: "[SYSTEM: The patient has just opened their camera to show you a pill. Ask them to hold the pill steady in front of the camera so you can verify it. Do NOT start your response with 'Hello' or 'I can help with that' — just get straight to the instruction.]"
      }));
    } else {
      window.pendingPillPrompt = true;
    }

    if (!isListening) {
      appendTranscript("Activating camera to show pill...", "user");
    }
  });
}

if (closeCameraBtn) {
  closeCameraBtn.addEventListener("click", toggleCamera);
}

// ---------------------------------------------------------------------------
// Book Appointment — start voice session and route to booking agent
// ---------------------------------------------------------------------------

const bookApptBtn = document.getElementById("book-appt-btn");
if (bookApptBtn) {
  bookApptBtn.addEventListener("click", () => {
    const bookingPrompt = "[SYSTEM: The patient wants to book a doctor appointment. You are now the booking agent. Ask the patient to describe their symptoms so you can triage them and find the right doctor. Use your triage_symptoms tool, then find_nearby_hospitals, then get_available_slots, and finally book_appointment once the patient confirms. Do NOT start with a generic greeting — get straight to asking about their symptoms.]";

    if (websocket && isGeminiReady) {
      websocket.send(JSON.stringify({
        type: "text",
        text: bookingPrompt
      }));
    } else {
      window.pendingBookingPrompt = bookingPrompt;
    }

    // Start listening if not already
    if (!isListening) {
      startListening();
    }

    appendTranscript("Starting appointment booking...", "user");
  });
}

// ---------------------------------------------------------------------------
// Food Logging Mode
// ---------------------------------------------------------------------------

const foodBtn = document.getElementById("log-food-btn");
const foodOverlay = document.getElementById("food-overlay");
const foodVideo = document.getElementById("food-video");
const foodCaptureBtn = document.getElementById("food-capture-btn");
const foodCloseBtn = document.getElementById("food-close-btn");
const foodResults = document.getElementById("food-results");
const foodResultsBody = document.getElementById("food-results-body");
const foodConfirmBtn = document.getElementById("food-confirm-btn");
const foodRetryBtn = document.getElementById("food-retry-btn");

let foodStream = null;
let currentFoodData = null; // Store fetched macros for saving

async function openFoodMode() {
  if (!foodOverlay) return;
  try {
    foodStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    foodVideo.srcObject = foodStream;
    foodOverlay.style.display = "flex";
    foodOverlay.classList.add("active");
    foodResults.style.display = "none";
  } catch (err) {
    console.error("Food camera error:", err);
    alert("Could not access camera for food logging.");
  }
}

function closeFoodMode() {
  if (foodStream) {
    foodStream.getTracks().forEach((t) => t.stop());
    foodStream = null;
  }
  if (foodVideo) foodVideo.srcObject = null;
  if (foodOverlay) {
    foodOverlay.style.display = "none";
    foodOverlay.classList.remove("active");
  }
}

async function performFoodScan() {
  if (!foodVideo || !foodStream) return;
  if (!scanCanvas) {
    scanCanvas = document.createElement("canvas");
  }
  scanCanvas.width = foodVideo.videoWidth || 1280;
  scanCanvas.height = foodVideo.videoHeight || 960;
  const ctx = scanCanvas.getContext("2d");
  ctx.drawImage(foodVideo, 0, 0, scanCanvas.width, scanCanvas.height);
  const dataUrl = scanCanvas.toDataURL("image/jpeg", 0.7);
  const b64 = dataUrl.split(",")[1];

  // Show loading state
  foodResults.style.display = "flex";
  foodResultsBody.innerHTML = '<p style="text-align:center;">Analyzing macros with AI...</p>';
  foodConfirmBtn.style.display = "none";
  foodRetryBtn.style.display = "none";

  try {
    const res = await fetch("/api/food/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: b64 }),
    });

    if (!res.ok) throw new Error("Failed to analyze image");

    currentFoodData = await res.json();
    renderFoodResults(currentFoodData);
  } catch (err) {
    foodResultsBody.innerHTML = `<p style="color:var(--accent);">${escHtml(err.message)}</p>`;
    foodConfirmBtn.style.display = "none";
    foodRetryBtn.style.display = "inline-block";
  }
}

function renderFoodResults(data) {
  if (data.food_items.length === 0 || data.calories === 0) {
    foodResultsBody.innerHTML = "<p>No food detected. Please try again with a clearer image.</p>";
    foodConfirmBtn.style.display = "none";
    foodRetryBtn.style.display = "inline-block";
    return;
  }

  let html = `<p><strong>Items:</strong> ${escHtml(data.food_items.join(", "))}</p>`;
  html += `<table style="width:100%; margin-top:8px;">`;
  html += `<tr><td>Calories</td><td style="text-align:right"><strong>${data.calories}</strong></td></tr>`;
  html += `<tr><td>Protein</td><td style="text-align:right">${data.protein_g}g</td></tr>`;
  html += `<tr><td>Carbs</td><td style="text-align:right">${data.carbs_g}g</td></tr>`;
  html += `<tr><td>Fat</td><td style="text-align:right">${data.fat_g}g</td></tr>`;
  html += `</table>`;

  foodResultsBody.innerHTML = html;
  foodConfirmBtn.style.display = "inline-block";
  foodRetryBtn.style.display = "inline-block";
}

async function saveFoodLog() {
  if (!currentFoodData) return;
  foodConfirmBtn.textContent = "Saving...";
  foodConfirmBtn.disabled = true;

  try {
    const res = await fetch("/api/food/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: uid, ...currentFoodData }),
    });
    if (!res.ok) throw new Error("Failed to save log");

    closeFoodMode();
    appendTranscript(`Logged ${currentFoodData.calories} calories to your journal.`, "user");

    // Notify the Live Agent about the logged food
    if (websocket && isGeminiReady) {
      const foodItemsStr = currentFoodData.food_items.join(", ");
      const prompt = `[SYSTEM: The patient just logged a meal consisting of: ${foodItemsStr}. Macros: ${currentFoodData.calories} calories, ${currentFoodData.protein_g}g protein, ${currentFoodData.carbs_g}g carbs, ${currentFoodData.fat_g}g fat. Briefly acknowledge this enthusiastically in ${language} and perhaps offer a short comment on the meal's nutritional value.]`;
      websocket.send(JSON.stringify({ type: "text", text: prompt }));

      // Auto-start listening if not already, so the agent can respond
      if (!isListening) {
        startListening();
      }
    }

  } catch (err) {
    console.error(err);
    alert("Could not save info.");
  } finally {
    foodConfirmBtn.textContent = "Log Food";
    foodConfirmBtn.disabled = false;
  }
}

if (foodBtn) foodBtn.addEventListener("click", openFoodMode);
if (foodCloseBtn) foodCloseBtn.addEventListener("click", closeFoodMode);
if (foodCaptureBtn) foodCaptureBtn.addEventListener("click", performFoodScan);
if (foodRetryBtn) foodRetryBtn.addEventListener("click", () => { foodResults.style.display = "none"; });
if (foodConfirmBtn) foodConfirmBtn.addEventListener("click", saveFoodLog);

// ---------------------------------------------------------------------------
// Document Scan Mode (single-shot high-res capture)
// ---------------------------------------------------------------------------

const scanOverlay = document.getElementById("scan-overlay");
const scanVideo = document.getElementById("scan-video");
const scanCaptureBtn = document.getElementById("scan-capture-btn");
const scanCloseBtn = document.getElementById("scan-close-btn");
const scanTypeToggle = document.getElementById("scan-type-toggle");
const scanTypeLabel = document.getElementById("scan-type-label");
const scanResults = document.getElementById("scan-results");
const scanResultsTitle = document.getElementById("scan-results-title");
const scanResultsBody = document.getElementById("scan-results-body");
const scanConfirmBtn = document.getElementById("scan-confirm-btn");
const scanRetryBtn = document.getElementById("scan-retry-btn");
const scanBtn = document.getElementById("scan-btn");

let scanStream = null;
let scanType = "prescription"; // or "report"
let scanCanvas = null;

function escHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

async function openScanMode() {
  if (!scanOverlay) return;
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    scanVideo.srcObject = scanStream;
    scanOverlay.classList.add("active");
    scanResults.style.display = "none";
  } catch (err) {
    console.error("Scan camera error:", err);
    alert("Could not access camera for scanning.");
  }
}

function closeScanMode() {
  if (scanStream) {
    scanStream.getTracks().forEach((t) => t.stop());
    scanStream = null;
  }
  if (scanVideo) scanVideo.srcObject = null;
  if (scanOverlay) scanOverlay.classList.remove("active");
}

function captureFrame() {
  if (!scanVideo || !scanStream) return null;
  if (!scanCanvas) {
    scanCanvas = document.createElement("canvas");
  }
  scanCanvas.width = scanVideo.videoWidth || 1280;
  scanCanvas.height = scanVideo.videoHeight || 960;
  const ctx = scanCanvas.getContext("2d");
  ctx.drawImage(scanVideo, 0, 0, scanCanvas.width, scanCanvas.height);
  // Compress to ~80% JPEG quality
  const dataUrl = scanCanvas.toDataURL("image/jpeg", 0.8);
  return dataUrl.split(",")[1];
}

async function performScan() {
  const b64 = captureFrame();
  if (!b64) return;

  // Show loading state
  scanResults.style.display = "flex";
  scanResultsTitle.textContent = "Scanning...";
  scanResultsBody.innerHTML = '<p style="text-align:center;">Extracting details with AI...</p>';
  scanConfirmBtn.style.display = "none";
  scanRetryBtn.style.display = "none";

  const token = localStorage.getItem("medlive_id_token") || "";
  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image_b64: b64, scan_type: scanType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    renderScanResults(data);
  } catch (err) {
    scanResultsTitle.textContent = "Scan Failed";
    scanResultsBody.innerHTML = `<p style="color:var(--accent);">${escHtml(err.message)}</p>`;
    scanConfirmBtn.style.display = "none";
    scanRetryBtn.style.display = "inline-block";
  }
}

function renderScanResults(data) {
  scanConfirmBtn.style.display = "inline-block";
  scanRetryBtn.style.display = "inline-block";

  if (scanType === "prescription") {
    scanResultsTitle.textContent = "Prescription Found";
    const meds = data.medications || [];
    if (meds.length === 0) {
      scanResultsBody.innerHTML = "<p>No medications detected. Try again with a clearer image.</p>";
      return;
    }
    let html = "<table><tr><th>Medication</th><th>Dosage</th><th>Frequency</th></tr>";
    for (const m of meds) {
      html += `<tr><td>${escHtml(m.name)}</td><td>${escHtml(m.dosage)}</td><td>${escHtml(m.frequency)}</td></tr>`;
    }
    html += "</table>";
    if (data.doctor_name) html += `<p><strong>Doctor:</strong> ${escHtml(data.doctor_name)}</p>`;
    if (data.date) html += `<p><strong>Date:</strong> ${escHtml(data.date)}</p>`;
    scanResultsBody.innerHTML = html;
  } else {
    scanResultsTitle.textContent = "Lab Report Found";
    const tests = data.tests || [];
    if (tests.length === 0) {
      scanResultsBody.innerHTML = "<p>No test results detected. Try again with a clearer image.</p>";
      return;
    }
    let html = "<table><tr><th>Test</th><th>Value</th><th>Range</th><th>Status</th></tr>";
    for (const t of tests) {
      const statusColor = t.status === "high" || t.status === "low" ? "var(--accent)" : "inherit";
      html += `<tr><td>${escHtml(t.name)}</td><td>${escHtml(t.value)} ${escHtml(t.unit)}</td>`;
      html += `<td>${escHtml(t.reference_range)}</td>`;
      html += `<td style="color:${statusColor};font-weight:700;">${escHtml(t.status)}</td></tr>`;
    }
    html += "</table>";
    if (data.lab_name) html += `<p><strong>Lab:</strong> ${escHtml(data.lab_name)}</p>`;
    if (data.date) html += `<p><strong>Date:</strong> ${escHtml(data.date)}</p>`;
    scanResultsBody.innerHTML = html;
  }
}

// Wire up scan buttons
if (scanBtn) {
  scanBtn.addEventListener("click", openScanMode);
}

if (scanCaptureBtn) {
  scanCaptureBtn.addEventListener("click", performScan);
}

if (scanCloseBtn) {
  scanCloseBtn.addEventListener("click", closeScanMode);
}

if (scanTypeToggle) {
  scanTypeToggle.addEventListener("click", () => {
    scanType = scanType === "prescription" ? "report" : "prescription";
    if (scanTypeLabel) scanTypeLabel.textContent = scanType === "prescription" ? "Prescription" : "Lab Report";
  });
}

if (scanConfirmBtn) {
  scanConfirmBtn.addEventListener("click", () => {
    closeScanMode();
    appendTranscript(`${scanType === "prescription" ? "Prescription" : "Lab report"} saved.`, "user");
  });
}

if (scanRetryBtn) {
  scanRetryBtn.addEventListener("click", () => {
    scanResults.style.display = "none";
  });
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const currentToken = localStorage.getItem("medlive_id_token") || "";

  const query = new URLSearchParams({
    token: currentToken,
  }).toString();

  const url = `${protocol}//${window.location.host}/ws/${uid}?${query}`;
  websocket = new WebSocket(url);

  websocket.onopen = () => {
    console.log("[MedLive] WebSocket connected to server, waiting for Gemini...");
    isConnected = true;
    setStatus("Connecting...", ""); // Gemini Live not ready yet
  };

  websocket.onmessage = (event) => {
    try {
      const adkEvent = JSON.parse(event.data);

      if (adkEvent.type === "ready") {
        console.log("[MedLive] Gemini Live ready");
        isGeminiReady = true;

        if (window.pendingPillPrompt) {
          websocket.send(JSON.stringify({
            type: "text",
            text: "[SYSTEM: The patient has just opened their camera to show you a pill. Ask them to hold the pill steady in front of the camera so you can verify it. Do NOT start your response with 'Hello' or 'I can help with that' — just get straight to the instruction.]"
          }));
          window.pendingPillPrompt = false;
        }

        if (window.pendingBookingPrompt) {
          websocket.send(JSON.stringify({
            type: "text",
            text: window.pendingBookingPrompt
          }));
          window.pendingBookingPrompt = null;
        }

        if (!isListening) setStatus(currentLocale.tapToSpeak, "");
        // Do NOT create AudioPlayer here: it would run without a user gesture and
        // the AudioContext would stay suspended, so playback would never start.
        // AudioPlayer is created only in startListening() when the user taps.
        return;
      }

      // Custom Generative UI Payload Handling
      if (adkEvent.type === "ui_update") {
        console.log("[MedLive] UI Update received:", adkEvent);
        handleUIUpdate(adkEvent);
        return;
      }

      // Debug: log when we get a non-ready event (so we can see if responses arrive)
      const content = adkEvent.content;
      const hasParts = content && content.parts && content.parts.length > 0;
      let hasAudio = false;
      if (hasParts) {
        for (const p of content.parts) {
          const d = p.inlineData || p.inline_data;
          if (d && (d.data != null) && (typeof d.data === "string" ? d.data.length > 0 : d.data.byteLength > 0)) hasAudio = true;
        }
        if (hasAudio || adkEvent.turnComplete || adkEvent.turn_complete) {
          console.log("[MedLive] Event from server: hasAudio=" + hasAudio + " turnComplete=" + (adkEvent.turnComplete || adkEvent.turn_complete));
        }
      }

      handleADKEvent(adkEvent);
    } catch (e) {
      console.error("[MedLive] Parse error:", e);
    }
  };

  websocket.onerror = (err) => {
    console.error("[MedLive] WebSocket error:", err);
  };

  websocket.onclose = (event) => {
    console.log("[MedLive] WebSocket closed:", event.code, event.reason);
    isConnected = false;
    hasGreeted = false;
    isGeminiReady = false;
    pendingGreeting = false;

    if (event.code === 4401 && uid !== "demo_user") {
      // Auth failure — token expired, redirect to auth (skip when using skip-auth-for-testing)
      console.warn("[MedLive] Auth token rejected, redirecting to auth");
      localStorage.removeItem("medlive_id_token");
      window.location.href = "/static/auth.html";
      return;
    }

    setStatus(currentLocale.disconnected, "");
    setTimeout(connectWebSocket, 3000);
  };
}

// ---------------------------------------------------------------------------
// Generative UI Events Handling
// ---------------------------------------------------------------------------

function handleUIUpdate(event) {
  if (event.target === "voice_update") {
    const voice = event.data?.voice || "";
    showToast(`Voice changed to ${voice}. Reconnecting...`);
  } else if (event.target === "profile_preview") {
    showToast(`Profile data saved successfully!`);
  } else if (event.target === "adherence_chart") {
    showToast("Chart data updated.");

    // ── Booking: Nearby Hospitals Card ──
  } else if (event.target === "booking_hospitals") {
    const d = event.data;
    let html = `<div class="booking-card booking-hospitals">
      <div class="booking-card-header" style="background:#e8f5e9;border-bottom:2px dashed #4caf50;">
        🏥 <strong>Nearby Clinics</strong>
        <span style="font-size:0.75rem;opacity:0.6;margin-left:8px;">${d.department?.replace(/_/g, ' ') || ''}</span>
      </div>`;
    (d.hospitals || []).forEach((h, i) => {
      html += `<div class="booking-hospital-item" style="${i > 0 ? 'border-top:1px dashed #ccc;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${h.name}</strong>
          <span class="booking-badge" style="background:#c8e6c9;color:#2e7d32;">${h.distance_miles} mi</span>
        </div>
        <div style="font-size:0.78rem;opacity:0.6;margin-top:2px;">📍 ${h.address}</div>
        <div style="font-size:0.78rem;opacity:0.5;margin-top:1px;">📞 ${h.phone || ''}</div>
      </div>`;
    });
    html += `</div>`;
    appendBookingCard(html);

    // ── Booking: Available Slots Card ──
  } else if (event.target === "booking_slots") {
    const d = event.data;
    let html = `<div class="booking-card booking-slots">
      <div class="booking-card-header" style="background:#e3f2fd;border-bottom:2px dashed #1976d2;">
        📅 <strong>Available Appointments</strong>
        <span style="font-size:0.75rem;opacity:0.6;margin-left:8px;">${d.hospital_name || ''}</span>
      </div>`;
    (d.slots || []).forEach((s, i) => {
      html += `<div class="booking-slot-item" style="${i > 0 ? 'border-top:1px dashed #ccc;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong style="color:#1976d2;">${s.time}</strong>
            <span style="font-size:0.82rem;opacity:0.7;margin-left:6px;">${s.date}</span>
          </div>
        </div>
        <div style="font-size:0.85rem;margin-top:3px;">👨‍⚕️ ${s.doctor_name}</div>
      </div>`;
    });
    html += `</div>`;
    appendBookingCard(html);

    // ── Booking: Confirmation Card ──
  } else if (event.target === "booking_confirmed") {
    const a = event.data;
    const html = `<div class="booking-card booking-confirmed">
      <div class="booking-card-header" style="background:#c8e6c9;border-bottom:2px dashed #2e7d32;text-align:center;">
        ✅ <strong>Appointment Confirmed!</strong>
      </div>
      <div style="padding:14px;text-align:center;">
        <div style="font-size:1.1rem;font-weight:700;">📅 ${a.date} at ${a.time}</div>
        <div style="margin-top:6px;">🏥 ${a.hospital_name}</div>
        <div style="font-size:0.82rem;opacity:0.6;">📍 ${a.hospital_address}</div>
        <div style="margin-top:6px;">👨‍⚕️ <strong>${a.doctor_name}</strong></div>
        <div style="margin-top:10px;">
          <span style="background:#c8e6c9;padding:4px 12px;border-radius:6px;font-size:0.82rem;font-weight:600;color:#2e7d32;">
            ✅ Confirmed
          </span>
        </div>
        <div style="margin-top:8px;font-size:0.78rem;opacity:0.5;">Don't forget your medications list and insurance card!</div>
      </div>
    </div>`;
    appendBookingCard(html);

    // ── Booking: Emergency Alert ──
  } else if (event.target === "booking_emergency") {
    const d = event.data;
    const html = `<div class="booking-card booking-emergency" style="animation:pulse-red 1.5s infinite;">
      <div class="booking-card-header" style="background:#ffcdd2;border-bottom:2px dashed #d32f2f;text-align:center;">
        🚨 <strong>EMERGENCY — BOOKING REFUSED</strong>
      </div>
      <div style="padding:14px;text-align:center;">
        <div style="font-size:1rem;font-weight:700;color:#d32f2f;">${d.message}</div>
        <div style="margin-top:8px;font-size:0.85rem;opacity:0.7;">
          Detected: <strong>"${d.keyword}"</strong><br>
          Agent will NOT proceed with booking.
        </div>
      </div>
    </div>`;
    appendBookingCard(html);

  } else {
    showToast(`Action Completed: ${event.target.replace('_', ' ')}`);
  }
}

// Insert a rich HTML card into the transcript panel
function appendBookingCard(html) {
  if (transcriptDrawer.classList.contains("collapsed")) {
    transcriptDrawer.classList.remove("collapsed");
    document.body.classList.add("chat-active");
  }
  const div = document.createElement("div");
  div.className = "message agent booking-card-wrapper";
  div.innerHTML = html;
  transcript.appendChild(div);
  scheduleTranscriptScroll();
}

function showToast(message) {
  let toast = document.getElementById("medlive-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "medlive-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = "var(--primary)";
    toast.style.color = "white";
    toast.style.padding = "12px 24px";
    toast.style.borderRadius = "20px";
    toast.style.zIndex = "9999";
    toast.style.boxShadow = "var(--shadow-btn)";
    toast.style.fontFamily = "var(--font-primary)";
    toast.style.transition = "opacity 0.3s";
    toast.style.pointerEvents = "none";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = "1";

  if (toast.timeoutId) clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.style.opacity = "0";
  }, 3000);
}

// ---------------------------------------------------------------------------
// ADK Event Handling
// ---------------------------------------------------------------------------

function handleADKEvent(event) {
  const content = event.content;
  if (content && content.parts) {
    for (const part of content.parts) {
      const inlineData = part.inlineData || part.inline_data;
      const audioData = inlineData && (inlineData.data != null) ? String(inlineData.data) : null;
      if (audioData && audioData.length > 0) {
        const mimeType = (inlineData && (inlineData.mimeType || inlineData.mime_type)) || "";
        console.log("[MedLive] Playing audio chunk, mime:", mimeType || "(none)", "len:", audioData.length);
        setStatus(currentLocale.speaking, "active");
        // Mute mic while agent is speaking to prevent echo feedback loop
        if (audioRecorder && !audioRecorder.isMuted) {
          audioRecorder.mute();
        }
        if (audioPlayer && audioPlayer.isInitialized) {
          audioPlayer.playBase64(audioData);
        } else {
          // Queue only; do not create AudioPlayer here (no user gesture = suspended context).
          // Player is created in startListening() on tap; it will flush this queue.
          if (!window._audioChunkQueue) window._audioChunkQueue = [];
          window._audioChunkQueue.push(audioData);
          if (window._audioChunkQueue.length === 1) {
            console.log("[MedLive] Audio queued (tap to start listening to hear it)");
          }
        }
      }
    }
  }

  // Strip control chars and <ctrlNN> artifacts from transcripts before display
  function sanitizeTranscriptText(s) {
    if (typeof s !== "string") return s;
    return s
      .replace(/<ctrl\d+>/gi, "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .trim();
  }

  const inputTx = event.inputTranscription || event.input_transcription;
  if (inputTx?.text) {
    appendTranscript(sanitizeTranscriptText(inputTx.text), "user", true);
  }

  const outputTx = event.outputTranscription || event.output_transcription;
  if (outputTx?.text) {
    appendTranscript(sanitizeTranscriptText(outputTx.text), "agent", true);
  }

  if (event.turnComplete || event.turn_complete) {
    currentAgentBubble = null;
    accumulatedAgentText = "";
    currentUserBubble = null;
    accumulatedUserText = "";
    // Don't flip to "listening" immediately — the ring buffer may still have
    // audio queued. audioPlayer.onDrained fires when the speaker goes quiet.
    // Fallback: if player isn't active, switch immediately.
    if (!audioPlayer || !audioPlayer.isInitialized) {
      // Unmute mic now that agent is done
      if (audioRecorder) audioRecorder.unmute();
      setStatus(currentLocale.listening, "listening");
    }
  }

  if (event.interrupted) {
    if (audioPlayer) audioPlayer.clear();
    // Unmute mic immediately on interruption
    if (audioRecorder) audioRecorder.unmute();
    currentAgentBubble = null;
    accumulatedAgentText = "";
    currentUserBubble = null;
    accumulatedUserText = "";
    setStatus(currentLocale.listening, "listening");
  }
}

// ---------------------------------------------------------------------------
// Greeting helper — extracted so it can be called from onmessage (ready) too
// ---------------------------------------------------------------------------

function sendGreeting() {
  if (hasGreeted || !websocket || websocket.readyState !== WebSocket.OPEN) return;
  const companionName = localStorage.getItem("medlive_companion_name") || "Health Companion";
  websocket.send(
    JSON.stringify({
      type: "text",
      text: `[SYSTEM: The patient just connected. You are ${companionName}. Greet them warmly in ${language}. Keep it brief — one or two sentences. Then ask how they are feeling today.]`,
    })
  );
  hasGreeted = true;
  console.log("[MedLive] Greeting sent to Gemini");
}

// ---------------------------------------------------------------------------
// Audio Recording
// ---------------------------------------------------------------------------

async function startListening() {
  if (isListening) return;

  if (!audioPlayer) {
    audioPlayer = new AudioPlayer();
    audioPlayer.onAudioError = (message) => {
      setStatus(message, "");
      console.warn("[MedLive] Audio error:", message);
    };
    await audioPlayer.initialize();
    // Switch aura from "speaking" → "listening" only after buffer fully drains
    audioPlayer.onDrained = () => {
      // Unmute mic now that speaker buffer is empty
      if (audioRecorder) audioRecorder.unmute();
      if (isListening && document.body.classList.contains("speaking")) {
        setStatus(currentLocale.listening, "listening");
      }
    };
    // Play any chunks that arrived before we had a player (e.g. greeting response)
    const queued = window._audioChunkQueue ? window._audioChunkQueue.length : 0;
    if (queued) {
      console.log("[MedLive] Flushing", queued, "queued audio chunks");
      while (window._audioChunkQueue && window._audioChunkQueue.length) {
        audioPlayer.playBase64(window._audioChunkQueue.shift());
      }
    }
  }

  try {
    // Send audio in ~50ms chunks (1600 bytes @ 16kHz) per ADK recommendation for reliable VAD/response.
    // Flush partial batches every FLUSH_INTERVAL_MS so end-of-speech is not held in the buffer
    // (otherwise the model may never see the tail of the utterance and VAD won't commit).
    const UPSTREAM_BATCH_BYTES = 1600;
    const FLUSH_INTERVAL_MS = 50;
    let upstreamBatch = [];
    let upstreamBatchBytes = 0;

    function flushUpstreamBatch() {
      if (upstreamBatch.length === 0 || !websocket || websocket.readyState !== WebSocket.OPEN) return;
      const merged = new Uint8Array(upstreamBatchBytes);
      let offset = 0;
      for (const b of upstreamBatch) {
        merged.set(new Uint8Array(b), offset);
        offset += b.byteLength;
      }
      upstreamBatch = [];
      upstreamBatchBytes = 0;
      const base64 = arrayBufferToBase64(merged.buffer);
      websocket.send(JSON.stringify({ type: "audio", data: base64 }));
    }

    audioRecorder = new AudioRecorder((audioData) => {
      if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
      const ab = audioData instanceof ArrayBuffer ? audioData : audioData.buffer;
      upstreamBatch.push(ab);
      upstreamBatchBytes += ab.byteLength;

      if (upstreamBatchBytes >= UPSTREAM_BATCH_BYTES) {
        flushUpstreamBatch();
      }
    });
    if (upstreamFlushIntervalId) clearInterval(upstreamFlushIntervalId);
    upstreamFlushIntervalId = setInterval(flushUpstreamBatch, FLUSH_INTERVAL_MS);
    await audioRecorder.start();
    console.log("[MedLive] Audio recording started");
    isListening = true;
    setStatus(currentLocale.listening, "listening");

    // Send greeting on first mic start. Send immediately so we don't deadlock:
    // "ready" may only arrive after Gemini sends its first event, which can be
    // in response to this greeting.
    if (!hasGreeted) {
      sendGreeting();
    }
  } catch (e) {
    console.error("[MedLive] Microphone error:", e);
    setStatus("Mic blocked — check permissions", "");
  }
}

function stopListening() {
  if (!isListening) return;
  if (upstreamFlushIntervalId) {
    clearInterval(upstreamFlushIntervalId);
    upstreamFlushIntervalId = null;
  }
  if (audioRecorder) {
    audioRecorder.stop();
    audioRecorder = null;
  }
  // Tell the server (and Gemini) the user finished speaking so it responds to what they said.
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ type: "end_turn" }));
  }
  isListening = false;
  setStatus(currentLocale.tapToSpeak, "");
}

function endChat() {
  stopListening();
  // Close chat panel, restore hero
  transcriptDrawer.classList.add("collapsed");
  document.body.classList.remove("chat-active");
  // Clear transcript for next session
  if (transcript) transcript.innerHTML = "";
  currentAgentBubble = null;
  accumulatedAgentText = "";
}

// ---------------------------------------------------------------------------
// DOM Events
// ---------------------------------------------------------------------------

// Hero avatar tap → start/stop listening
if (avatarHeroTap) {
  avatarHeroTap.addEventListener("click", () => {
    isListening ? stopListening() : startListening();
  });

  // Keyboard accessibility
  avatarHeroTap.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      isListening ? stopListening() : startListening();
    }
  });
}

// Chat panel handle toggle
if (drawerHandle) {
  drawerHandle.addEventListener("click", () => {
    const isCollapsed = transcriptDrawer.classList.contains("collapsed");
    transcriptDrawer.classList.toggle("collapsed");
    if (!isCollapsed) {
      // Was open, now collapsing — remove chat-active
      document.body.classList.remove("chat-active");
    }
  });
}

// End chat button
if (chatEndBtn) {
  chatEndBtn.addEventListener("click", endChat);
}

// Change companion button — goes back to onboarding
const changePersonaBtn = document.getElementById("change-persona-btn");
if (changePersonaBtn) {
  changePersonaBtn.addEventListener("click", () => {
    localStorage.removeItem("medlive_language");
    localStorage.removeItem("medlive_companion_name");
    localStorage.removeItem("medlive_avatar");
    window.location.href = "/static/onboarding.html";
  });
}

// ---------------------------------------------------------------------------
// Page Visibility: Auto-greeting after 2h inactivity
// ---------------------------------------------------------------------------

let lastActiveTime = Date.now();

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    const inactiveMs = Date.now() - lastActiveTime;
    const TWO_HOURS = 2 * 60 * 60 * 1000;

    if (inactiveMs > TWO_HOURS && websocket && websocket.readyState === WebSocket.OPEN) {
      const hour = new Date().getHours();
      const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
      const hoursAway = Math.round(inactiveMs / 3600000);

      if (!isListening) startListening();
      websocket.send(
        JSON.stringify({
          type: "text",
          text: `[SYSTEM: User just opened the app after ${hoursAway} hours. Time of day: ${period}. Start a warm ${period} health check-in in ${language}.]`,
        })
      );
      console.log(`[MedLive] Auto-greeting triggered after ${hoursAway}h inactivity`);
    }

    lastActiveTime = Date.now();
  } else {
    lastActiveTime = Date.now();
  }
});

// Check-in from push notification (optional type=meds or type=lunch for context)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("checkin") === "true") {
  const reminderType = urlParams.get("type") || ""; // "meds" or "lunch" or ""
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        const hour = new Date().getHours();
        const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        const typeHint =
          reminderType === "meds"
            ? " from a medication reminder"
            : reminderType === "lunch"
              ? " from a lunch reminder"
              : " from a check-in notification";
        if (!isListening) startListening();
        websocket.send(
          JSON.stringify({
            type: "text",
            text: `[SYSTEM: User opened the app${typeHint}. Time of day: ${period}. Start a warm ${period} health check-in in ${language}.]`,
          })
        );
      }
    }, 2000);
  });
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

connectWebSocket();
