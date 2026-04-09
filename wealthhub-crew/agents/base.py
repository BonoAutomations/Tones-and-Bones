import os
import anthropic


class BaseAgent:
    """Base class for all WealthHub crew agents."""

    MODEL = "claude-opus-4-6"

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.niche = os.getenv("WEALTHHUB_NICHE", "wealth management automation")
        self.service = os.getenv("WEALTHHUB_SERVICE", "AI-powered client acquisition and retention automation")
        self.price = os.getenv("WEALTHHUB_PRICE", "2500")

    def ask(self, system: str, prompt: str, max_tokens: int = 2048) -> str:
        """Call Claude with a system + user prompt, return text."""
        msg = self.client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()

    def save(self, path: str, content: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(content)
        print(f"  [saved] {path}")
