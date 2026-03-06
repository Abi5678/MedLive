import asyncio
import json
from agents.insights.tools import draft_dietary_plan, generate_grocery_list

async def run():
    print("--- DRAFT DIETARY PLAN ---")
    plan = await draft_dietary_plan("Low-Sodium Trial", "Reducing salt intake to 1500mg daily to manage hypertension peaks.")
    print(json.dumps(plan, indent=2))
    
    print("\n--- GROCERY LIST ---")
    ingredients = ["Salmon", "Asparagus", "Lemon", "Olive Oil", "Black Pepper"]
    grocery = await generate_grocery_list(ingredients)
    print(json.dumps(grocery, indent=2))

asyncio.run(run())
