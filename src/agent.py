"""Gemini API agent wrapper."""

from google import genai
from google.genai import types


class Agent:
    """Thin wrapper around Gemini for multi-turn conversation."""

    def __init__(self, api_key: str, persona: dict, model: str = "gemini-2.5-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model
        self.persona = persona
        self.history: list[types.Content] = []

    def chat(self, user_message: str) -> str:
        """Send a message and return the assistant's reply."""
        self.history.append(
            types.Content(role="user", parts=[types.Part(text=user_message)])
        )

        response = self.client.models.generate_content(
            model=self.model,
            contents=self.history,
            config=types.GenerateContentConfig(
                system_instruction=self.persona["system_prompt"],
                temperature=0.7,
                max_output_tokens=2048,
            ),
        )

        reply = response.text or "(no response)"
        self.history.append(
            types.Content(role="model", parts=[types.Part(text=reply)])
        )
        return reply
