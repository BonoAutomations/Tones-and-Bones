"""Interactive CLI for the Tones & Bones agent."""

import os
import sys

from dotenv import load_dotenv
from rich.console import Console
from rich.markdown import Markdown

from agent import Agent
from personas import get_persona


def main():
    load_dotenv()
    console = Console()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or api_key == "your-api-key-here":
        console.print(
            "[bold red]Missing GEMINI_API_KEY.[/] "
            "Copy .env.example to .env and add your key from "
            "https://aistudio.google.com/apikey"
        )
        sys.exit(1)

    persona_name = os.getenv("AGENT_PERSONA", "general")
    persona = get_persona(persona_name)

    console.print(f"\n[bold cyan]{persona['name']}[/] is ready. Type [bold]/quit[/] to exit.\n")

    agent = Agent(api_key=api_key, persona=persona)

    while True:
        try:
            user_input = console.input("[bold green]You:[/] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\nGoodbye!")
            break

        if not user_input:
            continue
        if user_input.lower() in ("/quit", "/exit", "quit", "exit"):
            console.print("Goodbye!")
            break
        if user_input.lower() == "/persona":
            console.print(f"Current persona: [bold]{persona_name}[/]")
            console.print("Available: general, luxury_sales, educator")
            console.print("Set AGENT_PERSONA in .env to switch.")
            continue

        try:
            reply = agent.chat(user_input)
            console.print(f"\n[bold cyan]{persona['name']}:[/]")
            console.print(Markdown(reply))
            console.print()
        except Exception as e:
            console.print(f"[bold red]Error:[/] {e}")


if __name__ == "__main__":
    main()
