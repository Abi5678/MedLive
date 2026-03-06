import asyncio
from agents.shared.firestore_service import FirestoreService

async def run():
    fs = FirestoreService.get_instance()
    fs.initialize()
    profile = await fs.get_patient_profile("71D3DB14AC55F127A81379096AC55BBB")
    health = await fs.get_health_restrictions("71D3DB14AC55F127A81379096AC55BBB")
    print("--- PROFILE ---")
    print(profile)
    print("--- HEALTH ---")
    print(health)

asyncio.run(run())
