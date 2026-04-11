# Tones & Bones — Sneaker Agency

Automated sneaker acquisition system. Beats the bots at their own game.

## Features

| Feature | Details |
|---|---|
| **Multi-retailer** | Nike SNKRS, Adidas (incl. Confirmed draws), Foot Locker, any Shopify boutique |
| **Release monitor** | Watches Nike, Adidas & SneakerNews calendars; auto-creates checkout tasks on keyword match |
| **Proxy rotation** | Health-checks your proxy pool; rotates and marks dead on ban |
| **Profile manager** | Shipping + payment profiles encrypted at rest (AES-256-GCM + scrypt) |
| **Fast Shopify ATC** | Skips PDP — hits `/cart/add.js` directly via variant ID |
| **Captcha solving** | 2captcha and anticaptcha integrations |
| **Discord alerts** | Rich embeds for every success, failure, and new drop |
| **Rich CLI** | Tables, banners, task/profile/proxy management |

## Quick Start

```bash
# 1. Install dependencies
pip install -r sneaker_agency/requirements.txt

# 2. Install Playwright browsers
playwright install chromium

# 3. Edit your config
cp sneaker_agency/config.yaml my_config.yaml
# → fill in profiles, proxies, Discord webhook, tasks

# 4. Run tasks
python -m sneaker_agency run -c my_config.yaml

# 5. Monitor mode only (alerts, no auto-checkout)
python -m sneaker_agency monitor -c my_config.yaml
```

## CLI Reference

```
Commands:
  run             Run all enabled checkout tasks
  monitor         Monitor release calendars (keyword alerts)
  sizes <URL>     Check available sizes on any supported URL
  tasks           List configured tasks
  profiles        List profiles (cards masked)
  proxies check   Health-check proxy pool
```

### Example: check what sizes are left on a Nike page
```bash
python -m sneaker_agency sizes https://www.nike.com/launch/t/air-jordan-1 --retailer nike
```

### Example: check a Shopify boutique
```bash
python -m sneaker_agency sizes https://kith.com/products/example-shoe --retailer shopify
```

## Config Reference (`config.yaml`)

### Profiles
```yaml
profiles:
  - id: "main"
    first_name: "Jordan"
    last_name: "Smith"
    email: "you@example.com"
    phone: "5551234567"
    address_1: "123 Main St"
    city: "New York"
    state: "NY"
    zip: "10001"
    country: "US"
    card_number: "4111111111111111"
    card_expiry: "12/28"
    card_cvv: "123"
    card_holder: "Jordan Smith"
```

### Tasks
```yaml
tasks:
  - id: "jordan-1-chicago"
    enabled: true
    retailer: "nike"          # nike | adidas | footlocker | shopify
    product_url: "https://www.nike.com/launch/t/air-jordan-1-retro-high-og-chicago"
    style_code: "DZ5485-612"  # optional — used by monitor matching
    sizes: ["US 10", "US 10.5", "US 11"]   # tries in order
    quantity: 1
    profile_id: "main"
    mode: "safe"              # safe (human-like) | fast (max speed)
```

### Monitor
```yaml
monitor:
  enabled: true
  check_interval_seconds: 60
  keywords:
    - "Jordan 1 Chicago"
    - "Yeezy 350 Zebra"
  sizes: ["US 10"]
  profile_id: "main"
  retailers: ["nike", "adidas", "footlocker"]
```

### Proxies
```yaml
proxies:
  enabled: true
  rotate_on_ban: true
  list:
    - "http://user:pass@proxy1.example.com:8080"
    - "socks5://user:pass@proxy2.example.com:1080"
```

## Supported Retailers

| Retailer | Key | Notes |
|---|---|---|
| Nike / SNKRS | `nike` | Standard PDP + SNKRS draw entry |
| Adidas | `adidas` | Standard PDP + Confirmed draw entry |
| Foot Locker | `footlocker` | Also works for Champs Sports, Eastbay |
| Shopify stores | `shopify` | KITH, Concepts, END., NRML, etc. Uses fast `/cart/add.js` API |

## Architecture

```
sneaker_agency/
├── main.py              ← CLI entry point
├── config.yaml          ← Your configuration
├── core/
│   ├── bot.py           ← Main orchestrator (async task runner)
│   └── monitor.py       ← Release calendar poller
├── retailers/
│   ├── base.py          ← Abstract base (page helpers, delay logic)
│   ├── nike.py          ← Nike adapter
│   ├── adidas.py        ← Adidas adapter
│   ├── footlocker.py    ← Foot Locker adapter
│   └── shopify.py       ← Generic Shopify adapter
├── profiles/
│   └── manager.py       ← Profile storage + AES-256-GCM encryption
├── proxies/
│   └── manager.py       ← Proxy pool + health checking
├── notifications/
│   └── discord.py       ← Discord webhook embeds
└── utils/
    ├── logger.py        ← Coloured structured logging
    └── captcha.py       ← 2captcha / anticaptcha integration
```
