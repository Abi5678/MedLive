"""MedLive Root Coordinator Agent.

Routes user requests to the appropriate sub-agent:
- Interpreter: translation, prescription/label reading
- Guardian: medication reminders, pill verification, vitals, diet
- Insights: adherence scoring, trends, digests, family alerts
- Booking: symptom triage, hospital search, appointment booking
"""

from google.adk.agents import Agent

from agents.shared.constants import LIVE_MODEL
from agents.shared.prompts import ROOT_AGENT_INSTRUCTION
from agents.interpreter.agent import interpreter_agent
from agents.guardian.agent import guardian_agent
from agents.insights.agent import insights_agent
from agents.onboarding.agent import onboarding_agent
from agents.booking.agent import booking_agent

root_agent = Agent(
    name="medlive",
    model=LIVE_MODEL,
    description="MedLive health guardian coordinator — routes to interpreter, guardian, insights, booking, or onboarding agents",
    instruction=ROOT_AGENT_INSTRUCTION,
    sub_agents=[interpreter_agent, guardian_agent, insights_agent, onboarding_agent, booking_agent],
)
