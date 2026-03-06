import asyncio
import base64
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

async def test_audio_streaming():
    client = genai.Client()
    model = os.getenv("MEDLIVE_MODEL", "gemini-2.5-flash-native-audio-latest")
    print(f"Testing model: {model}")
    
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
    )
    
    async with client.aio.live.connect(model=model, config=config) as session:
        print("Connected.")
        
        # Send a simple greeting as text
        await session.send_client_content(
            turns=types.Content(role="user", parts=[types.Part(text="Hello! Please reply with a short greeting and tell me your name.")])
        )
        print("Sent greeting.")
        
        # Listen for response
        try:
            async for response in session.receive():
                server_content = response.server_content
                if server_content and server_content.model_turn:
                    for part in server_content.model_turn.parts:
                        if part.inline_data:
                            print(f"Received audio chunk: {len(part.inline_data.data)} bytes")
                        if part.text:
                            print(f"Received text: {part.text}")
                
                if server_content and server_content.turn_complete:
                    print("Turn complete.")
                    break
        except Exception as e:
            print(f"Error reading response: {e}")

if __name__ == "__main__":
    asyncio.run(test_audio_streaming())
