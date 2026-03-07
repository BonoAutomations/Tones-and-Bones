#!/usr/bin/env python3
import os
import sys
from pathlib import Path
from typing import Optional

import google.generativeai as genai

# Pulls the key you set in ~/.zshrc
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("Error: GEMINI_API_KEY not found. Run 'export GEMINI_API_KEY=your_key_here'")
    sys.exit(1)

genai.configure(api_key=api_key)

PROMPTS = {
    "fix": "Fix this code and explain the changes:\n\n{content}",
    "summarize": "Give me a high-level summary of this file:\n\n{content}",
    "explain": "Explain this error and how to solve it:\n\n{content}"
}

def configure_gemini():
    # Using the Gemini 1.5 Flash model for speed
    return genai.GenerativeModel('gemini-1.5-flash')

def get_ai_response(model: genai.GenerativeModel, mode: str, content: str) -> Optional[str]:
    mode = mode.lower().strip()
    if mode not in PROMPTS:
        print(f"Error: unknown mode '{mode}'", file=sys.stderr)
        print(f"Allowed: {', '.join(sorted(PROMPTS))}", file=sys.stderr)
        return None

    prompt = PROMPTS[mode].format(content=content.strip())

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        return text if text else "(empty response)"
    except Exception as e:
        print(f"Gemini error: {e}", file=sys.stderr)
        return None

def main():
    if len(sys.argv) != 3:
        print("Usage: ai.py <mode> <input>", file=sys.stderr)
        sys.exit(1)

    _, mode, target = sys.argv

    try:
        if os.path.isfile(target):
            content = Path(target).read_text(encoding="utf-8")
        else:
            content = target
    except Exception as e:
        print(f"Cannot read '{target}': {e}", file=sys.stderr)
        sys.exit(1)

    if not content.strip():
        print("No content provided", file=sys.stderr)
        sys.exit(1)

    model = configure_gemini()
    result = get_ai_response(model, mode, content)

    if result is None:
        sys.exit(1)

    print(f"\n─── Gemini • {mode.upper()} ───")
    print(result)
    print("─" * 50 + "\n")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.")
        sys.exit(130)
