#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8000}"

echo "== health =="
curl -s "$BASE_URL/api/health"
echo

echo "== research keys =="
curl -s "$BASE_URL/api/research" | node -e 'let data="";process.stdin.on("data",c=>data+=c);process.stdin.on("end",()=>console.log(Object.keys(JSON.parse(data)).join(",")))'

echo "== create journal entry =="
curl -s -X POST "$BASE_URL/api/journal" \
  -H 'Content-Type: application/json' \
  -d '{"name":"BTC watch","thesis":"Momentum continuation above resistance","risk":"Lose prior support and thesis breaks"}'
echo

echo "== summarize upload =="
curl -s -X POST "$BASE_URL/api/uploads/summarize" \
  -H 'Content-Type: application/json' \
  -d '{"files":[{"name":"notes.txt","content":"alpha beta gamma delta epsilon"}]}'
echo
