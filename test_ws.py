import asyncio
import websockets
import json

async def test():
    uri = "ws://127.0.0.1:8000/ws/demo_user?token=demo"
    async with websockets.connect(uri) as websocket:
        print("Connected!")
        try:
            while True:
                msg = await websocket.recv()
                print(f"< {msg}")
                data = json.loads(msg)
                if data.get("type") == "ready":
                    # emulate sendGreeting()
                    greeting = {
                        "type": "text",
                        "text": "[SYSTEM: The patient just connected.]"
                    }
                    print(f"> {json.dumps(greeting)}")
                    await websocket.send(json.dumps(greeting))
                    break
            
            # Keep reading to see the crash
            while True:
                msg = await websocket.recv()
                print(f"< {msg}")
        except websockets.exceptions.ConnectionClosed as e:
            print(f"Connection closed: {e}")

asyncio.run(test())
