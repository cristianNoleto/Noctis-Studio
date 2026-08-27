#!/usr/bin/env bash
# ui-check.sh — verificacao visual + funcional de uma rota do app, em desktop e mobile,
# usando agent-browser (vercel-labs/agent-browser). Gera screenshots e dump de erros de console.
#
# Uso:
#   scripts/ui-check.sh /combinar-audios            # rota (base http://localhost:5173)
#   scripts/ui-check.sh /remocao-silencio label     # 2o arg = rotulo p/ nomear os arquivos
#   BASE=http://localhost:5173 scripts/ui-check.sh / home
#
# Pre-requisito: dev server rodando (porta 5173). Saidas em ./.ui-check/
set -uo pipefail

ROUTE="${1:-/}"
LABEL="${2:-$(echo "$ROUTE" | sed 's#[^a-zA-Z0-9]#_#g; s#^_##; s#_$##')}"
LABEL="${LABEL:-home}"
BASE="${BASE:-http://localhost:5173}"
URL="${BASE}${ROUTE}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/.ui-check"
mkdir -p "$OUT"

# Sessao isolada por rota (nao sequestra o browser de outra tarefa)
export AGENT_BROWSER_SESSION="uicheck-${LABEL}"

echo "==> agent-browser UI check: $URL  (label: $LABEL)"

# Sessao de "modo local" (sem Supabase): loga como fundador MASTER sem senha,
# injetando dp_local_session no localStorage. Assim testamos telas autenticadas.
SESSION_JS="localStorage.setItem('dp_local_session', JSON.stringify({email:'dev@local.test',name:'Dev Tester',plan:'MASTER'})); localStorage.setItem('dp_local_admin','dev@local.test'); 'ok'"

check() {
  local name="$1" ; shift          # nome (desktop / mobile)
  echo ""
  echo "--- $name ---"
  agent-browser "$@" >/dev/null 2>&1        # aplica viewport/device
  agent-browser open "$BASE/login" >/dev/null 2>&1   # origem p/ o localStorage
  agent-browser eval "$SESSION_JS" >/dev/null 2>&1   # loga (modo local)
  agent-browser open "$URL" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  sleep 1
  agent-browser screenshot "$OUT/${LABEL}-${name}.png" 2>&1 | tail -1
  echo "erros de console:"
  agent-browser errors 2>&1 | grep -iE 'error|uncaught|warning|failed' | head -15 || echo "  (nenhum)"
}

check "desktop" set viewport 1440 900
check "mobile"  set device "iPhone 16"

agent-browser close >/dev/null 2>&1
echo ""
echo "==> Screenshots em: $OUT/${LABEL}-desktop.png e ${LABEL}-mobile.png"
