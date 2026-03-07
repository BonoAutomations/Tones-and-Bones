import sys
import os
import google.generativeai as genai

# Setup - set GEMINI_API_KEY environment variable or replace below
API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

MODES = {
    "fix": "Act as a senior dev. Fix this code, explain why, and provide the corrected version in a code block:\n\n{}",
    "summarize": "Summarize this file. Provide a TL;DR, key functions/logic, and any dependencies:\n\n{}",
    "explain": "Explain this error message in simple terms and provide a likely solution:\n\n{}"
}


def get_ai_response(mode, content):
    prompt_template = MODES.get(mode)
    if not prompt_template:
        print(f"Unknown mode: {mode}")
        print(f"Available modes: {', '.join(MODES.keys())}")
        sys.exit(1)

    response = model.generate_content(prompt_template.format(content))
    print(f"\n--- AI {mode.upper()} RESULT ---\n")
    print(response.text)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 ai.py [fix|summarize|explain] [filename or \"error string\"]")
        sys.exit(1)

    mode = sys.argv[1]
    input_data = sys.argv[2]

    # Check if the input is a file path or just a string
    if os.path.exists(input_data):
        with open(input_data, 'r') as f:
            content = f.read()
    else:
        content = input_data

    get_ai_response(mode, content)
