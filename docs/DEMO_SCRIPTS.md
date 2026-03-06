# MedLive Demo Scenario Scripts

Target: < 4 minutes total for the Gemini Live Agent Challenge submission video.

---

## Scene 0: Opening Hook (0:00 - 0:25)

**Visual:** Split screen — video call with elderly parent on one side, worried child abroad on the other.

**Voiceover (English):**
> "My parents are in India. My colleague's abuela is in Mexico. We both worry every day — did they take the right pill? Is their blood sugar okay? What if something goes wrong and no one's there?"
>
> "MedLive is the AI health guardian that speaks their language, sees their pills, and knows their name."

---

## Scene 1: Character Creation + Hindi Prescription Reading (0:25 - 1:10)

### Setup
- Language: Hindi
- Companion name: Dr. Priya
- Fresh onboarding session

### Script

**[Show onboarding screen]**
1. User selects Hindi, types "Dr. Priya" as companion name.
2. User clicks "Random Avatar" — Pixar-style avatar generates.
3. User clicks "Finish Setup" — redirected to main UI.

**[Main voice UI — Dr. Priya avatar visible]**

4. User taps the avatar to start listening.

**Dr. Priya (Hindi):** "Namaste ji! Main Dr. Priya hoon, aapki health companion. Aap kaise hain aaj?"

5. User holds up a printed prescription to the camera (Verify Pill button to activate camera).

**User (Hindi):** "Dr. Priya, yeh meri nayi prescription hai, isko padh dijiye."

**Dr. Priya (Hindi):** "Ji bilkul, main dekh rahi hoon... Yeh teen dawaiyan hain — Metformin 500mg sugar ke liye, Lisinopril 10mg blood pressure ke liye, aur Atorvastatin 20mg cholesterol ke liye. Kya yeh sahi hai?"

**User:** "Haan, sahi hai."

**Dr. Priya:** "Bahut accha! Maine sab save kar diya hai. Agar aur koi help chahiye toh bataiye ji."

### What This Tests
- Interpreter agent routing (prescription reading)
- Natural Hindi conversation (Hinglish style, no robotic readback)
- Anti-repetition (summarizes in one natural sentence, doesn't list line-by-line)
- Avatar display and persona

---

## Scene 2: Spanish Wrong Pill Catch (1:10 - 2:10)

### Setup
- Language: Spanish
- Companion name: Enfermera Elena
- Patient: Maria Garcia (demo user with 4 medications)

### Script

**[Main voice UI — Elena avatar visible, evening time]**

1. User taps avatar to start.

**Elena (Spanish):** "Buenas tardes, mi amor. ¿Cómo te sientes hoy?"

**User (Spanish):** "Bien, Elena. ¿Qué medicinas me tocan esta noche?"

**Elena:** "Esta noche tienes dos: Metformin 500mg para el azúcar y Atorvastatin 20mg para el colesterol. ¿Las tienes a la mano?"

2. User activates camera (Verify Pill button) and shows a BLUE OVAL pill (wrong pill — does not match any medication).

**User:** "Mira, ¿esta es la correcta?"

**Elena (firm but caring):** "Espera, mi amor — esa pastilla azul y ovalada NO coincide con ninguna de tus medicinas. Tu Metformin es blanca y redonda con '500' marcado, y tu Atorvastatin es blanca y ovalada con 'ATV 20'. Por favor, no la tomes. Revisa con tu farmacéutico."

3. User shows the CORRECT white round pill with "500" imprint.

**User:** "¿Y esta?"

**Elena (relieved):** "¡Esa sí! Es tu Metformin 500mg. ¿La tomaste ya?"

**User:** "Sí, ya la tomé."

**Elena:** "Perfecto, ya la registré. Recuerda tómala con comida para evitar malestar estomacal. ¿Necesitas algo más?"

### What This Tests
- Guardian agent pill verification (wrong pill catch — the critical wow moment)
- Safety: firm warning in Spanish, doesn't let the patient take it
- Correct pill confirmation and logging
- Domain knowledge: reminds about food instructions
- Natural Spanish conversation with warmth

---

## Scene 3: English Health Check-in + Predictive Insights (2:10 - 3:15)

### Setup
- Language: English
- Companion name: Dr. Chen
- Morning check-in triggered by push notification

### Script

**[Main voice UI — Dr. Chen avatar, morning time, opened from notification]**

1. Auto-greeting fires from notification check-in.

**Dr. Chen:** "Good morning! I see it's time for your morning check-in. How are you feeling today?"

**User:** "I had some oatmeal with fruit for breakfast."

**Dr. Chen:** "That sounds healthy — I've logged that. Did you take your morning medications? You have Metformin, Lisinopril, and Glimepiride scheduled for this morning."

**User:** "Yes, took all three with breakfast."

**Dr. Chen:** "Great, all three are logged. Did you check your blood sugar today?"

**User:** "Yes, it was 128."

**Dr. Chen:** "128 — that's in a good range for a fasting reading. I've recorded it. By the way, looking at your week, your blood sugar has been coming down steadily from 145 to 128. The medications seem to be working well. Your adherence has been excellent — you took almost every dose this week."

2. User mentions a symptom.

**User:** "Actually, I've been feeling a bit dizzy this morning."

**Dr. Chen:** "I want to make sure you're safe. Since you took both Glimepiride and Lisinopril this morning, the dizziness could be related to low blood sugar — those two together can sometimes cause that. Please sit down if you're standing. Do you have some juice or candy nearby? If the dizziness doesn't improve in a few minutes, I'd recommend calling your doctor. Would you like me to call your son Carlos?"

**User:** "No, I think I'll be fine. Just need to sit for a bit."

**Dr. Chen:** "That's wise. Take it easy. I'll note this in your records so your daughter Sofia can see it on the dashboard. Please don't hesitate to call me if it gets worse."

### What This Tests
- Guardian check-in flow (natural, not interrogating)
- Vitals logging + Insights trend analysis in conversation
- Predictive knowledge: recognizes Glimepiride + Lisinopril dizziness link
- Emergency detection: moderate symptom path (not Red Line)
- First-aid guidance: sit down, juice, monitor
- Family communication offer
- Adherence encouragement

---

## Scene 4: Family Dashboard + Architecture (3:15 - 3:55)

**[Switch to dashboard.html in browser]**

**Voiceover:**
> "Meanwhile, Carlos and Sofia can check on their mother from anywhere in the world."

**[Show dashboard with:]**
- 7-day adherence chart (93%)
- Blood sugar trend (improving: 145 → 128)
- Blood pressure trend (stable: ~130/82)
- Today's digest: 3 doses taken, 0 missed
- Alert: "Dizziness reported — moderate, first aid given"

**[Flash architecture diagram]**

**Voiceover:**
> "Under the hood: Gemini 2.5 Flash for native audio streaming, Google ADK orchestrating three specialized agents, Firestore for real-time data, and RxNorm plus OpenFDA for drug interaction intelligence — all running on Cloud Run."

---

## Scene 5: Closing (3:55 - 4:00)

**Voiceover:**
> "MedLive — because every parent deserves a health guardian that speaks their language, sees their pills, and knows their name."

---

## Pre-Demo Checklist

- [ ] Firestore seeded with demo data (Maria Garcia, 4 medications, 7 days of adherence/vitals)
- [ ] Camera accessible (for pill verification scenes)
- [ ] Physical pills ready: one WRONG pill (blue oval), one CORRECT Metformin (white round "500")
- [ ] Three browser tabs pre-loaded: Hindi onboarding, Spanish main UI, English main UI
- [ ] Dashboard tab open with patient_uid parameter
- [ ] Screen recording software configured (1080p, mic + system audio)
- [ ] Architecture diagram image ready
- [ ] Rehearse each scene 2-3 times before final recording
