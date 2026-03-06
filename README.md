# Tones-and-Bones
Luxury Sales and Marketing Automation V1

## Setup

### 1. Environment Variables

Copy the example file and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env` with your actual keys. **Never commit the `.env` file.**

### 2. Verify Keys

Run the key checker to confirm everything is loaded:

```bash
python test_keys.py
```

This prints the status of each variable (set / not set) without revealing values.

### 3. Using Keys in Code

```python
from config import load_env, get_key

load_env()
gemini_key = get_key("GEMINI_API_KEY")
```
