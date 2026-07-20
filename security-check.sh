#!/bin/bash
# security-check.sh — READ-ONLY security review against SECURITY.md.
# Changes nothing; only prints what passes and what's missing.
# Run on demand: ./security-check.sh   (never wired into deploys/CI by design)

cd "$(dirname "$0")" || exit 1
PASS=0; WARN=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "Security review — $(date '+%Y-%m-%d %H:%M') — read-only, no changes made"

echo
echo "§1 Secrets in the built bundle (dist/)"
if [ -d dist/assets ]; then
  HITS=$(grep -rhoE "sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|VITE_[A-Z_]*KEY" dist/assets/ 2>/dev/null | sort -u)
  if [ -n "$HITS" ]; then bad "Possible secret in bundle: $(echo "$HITS" | head -3 | tr '\n' ' ')"
  else ok "No key patterns found in dist/assets"; fi
else
  warn "No dist/ build found — run 'npx vite build' first for a real bundle check"
fi

echo
echo "§1 Secrets in source / env files"
SRC_HITS=$(grep -rnE "sk-ant-|api\.anthropic\.com" src/ 2>/dev/null | grep -v "functions/v1")
[ -n "$SRC_HITS" ] && bad "Direct API/key reference in src/: $(echo "$SRC_HITS" | head -2)" || ok "No direct Anthropic calls or key literals in src/"
for f in .env .env.local .env.production; do
  if [ -f "$f" ]; then
    SUS=$(grep -E "^VITE_.*(KEY|SECRET|TOKEN|PASS)" "$f" 2>/dev/null)
    [ -n "$SUS" ] && bad "$f exposes a secret-looking VITE_ var: $(echo "$SUS" | cut -d= -f1 | tr '\n' ' ')" || ok "$f has no secret-looking VITE_ vars"
  fi
done

echo
echo "§6 Git hygiene"
if git check-ignore -q .env 2>/dev/null; then ok ".env is gitignored"; else bad ".env is NOT gitignored — fix before any .env file exists"; fi
TRACKED_ENV=$(git ls-files | grep -E "^\.env" )
[ -n "$TRACKED_ENV" ] && bad "env file tracked in git: $TRACKED_ENV" || ok "No .env files tracked in git"
HIST=$(git log --all -p -G "sk-ant-" --oneline 2>/dev/null | grep -cE "^\+.*sk-ant-")
if [ "${HIST:-0}" -gt 0 ]; then warn "Key-like strings appear in git history ($HIST additions) — rotation required (§5), history keeps them forever"
else ok "No Anthropic key patterns in git history"; fi

echo
echo "§6 Dependencies"
AUDIT=$(npm audit --audit-level=high 2>/dev/null | tail -2)
if echo "$AUDIT" | grep -qi "found 0"; then ok "npm audit: no high/critical vulnerabilities"
elif [ -z "$AUDIT" ]; then warn "npm audit could not run (offline?)"
else warn "npm audit reports issues: $AUDIT"; fi

echo
echo "Manual items this script cannot check (review yourself):"
echo "  • RLS enabled + policies on every Supabase table (dashboard → Database → Tables)"
echo "  • 2FA on Supabase / GitHub / Vercel / Anthropic accounts"
echo "  • Anthropic monthly spend limit set"
echo "  • Edge Function secrets set; VITE_ANTHROPIC_KEY removed from Vercel"
echo "  • Temporary access (demo codes) still needed?"

echo
echo "Result: $PASS passed, $WARN warnings, $FAIL failures"
[ "$FAIL" -gt 0 ] && exit 1 || exit 0
