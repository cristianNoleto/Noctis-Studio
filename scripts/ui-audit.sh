#!/usr/bin/env bash
# ui-audit.sh — varre TODAS as rotas do app em desktop+mobile via agent-browser.
# Salva prints em .ui-check/audit/<rota>-{desktop,mobile}.png e junta erros de
# console/pagina em .ui-check/audit/_errors.log. Modo local (loga sem senha).
set -uo pipefail
BASE="${BASE:-http://localhost:5173}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/.ui-check/audit"
rm -rf "$OUT"; mkdir -p "$OUT"
LOG="$OUT/_errors.log"; : > "$LOG"
export AGENT_BROWSER_SESSION="uiaudit"
SESSION_JS="localStorage.setItem('dp_local_session', JSON.stringify({email:'dev@local.test',name:'Dev Tester',plan:'MASTER'})); localStorage.setItem('dp_local_admin','dev@local.test'); 'ok'"

ROUTES="$*"
[ -z "$ROUTES" ] && ROUTES="/ /canais /quadro-ideias /desenhos /referencias /prompts /perfil /niche-finder /videos-virais /canais-removidos /dobra-de-nicho /videos-imagens /transcricao /ferramentas-texto /remocao-silencio /combinar-audios /academia /ajuda /admin /suporte /meu-plano /login /register /privacidade /termos"

# loga uma vez
agent-browser open "$BASE/login" >/dev/null 2>&1
agent-browser eval "$SESSION_JS" >/dev/null 2>&1

shot() { # rota viewport-cmd... : abre, espera, print, coleta erros
  local route="$1" name="$2"; shift 2
  local label; label="$(echo "$route" | sed 's#^/##; s#[^a-zA-Z0-9]#_#g')"; label="${label:-root}"
  agent-browser "$@" >/dev/null 2>&1
  agent-browser open "$BASE/login" >/dev/null 2>&1
  agent-browser eval "$SESSION_JS" >/dev/null 2>&1
  agent-browser open "$BASE$route" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 1
  agent-browser screenshot "$OUT/${label}-${name}.png" >/dev/null 2>&1
  local url err
  url="$(agent-browser get url 2>/dev/null | tail -1)"
  err="$(agent-browser errors 2>/dev/null | grep -iE 'error|uncaught|failed|cannot|undefined is not' | grep -viE 'favicon' | head -8)"
  {
    echo "### $route ($name)  ->  $url"
    [ -n "$err" ] && echo "$err" || echo "  ok (sem erros)"
    echo ""
  } >> "$LOG"
}

for r in $ROUTES; do
  echo "==> $r"
  shot "$r" desktop set viewport 1440 900
  shot "$r" mobile  set device "iPhone 16"
done
agent-browser close >/dev/null 2>&1
echo "=== LOG ==="; cat "$LOG"
