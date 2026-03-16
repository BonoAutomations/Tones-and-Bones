# Tones-and-Bones
Luxury Sales and Marketing Automation V1

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set up your API key
cp .env.example .env
# Edit .env and add your Gemini API key from https://aistudio.google.com/apikey

# 3. Run the agent
cd src
python cli.py
```

## Personas

Switch personas by setting `AGENT_PERSONA` in `.env`:

| Value | Description |
|-------|-------------|
| `general` | General-purpose assistant (default) |
| `luxury_sales` | Luxury brand sales & marketing advisor |
| `educator` | CognitoSphere adaptive tutor |

## Project Structure

```
src/
  cli.py        # Interactive CLI entry point
  agent.py      # Gemini API agent wrapper
  personas.py   # Persona/prompt definitions
```
