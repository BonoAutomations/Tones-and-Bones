#!/usr/bin/env python3
"""
AI Code Assistant — powered by Gemini 1.5 Flash

Usage:
    python3 ai.py <mode> <file_or_text>

Modes:
    fix        Fix code and explain changes
    summarize  High-level summary of a file
    explain    Explain an error and how to solve it
"""
import os
import sys
from pathlib import Path
from typing import Optional

import google.generativeai as genai

PROMPTS = {
    "fix": "Act as a senior dev. Fix this code, explain why, and provide the corrected version in a code block:\n\n{content}",
    "summarize": "Summarize this file. Provide a TL;DR, key functions/logic, and any dependencies:\n\n{content}",
    "explain": "Explain this error message in simple terms and provide a likely solution:\n\n{content}",
}


def configure_gemini() -> genai.GenerativeModel:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found.", file=sys.stderr)
        print("Run:  export GEMINI_API_KEY='your-key-here'", file=sys.stderr)
        sys.exit(1)
    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-1.5-flash")


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
        print(__doc__.strip(), file=sys.stderr)
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
