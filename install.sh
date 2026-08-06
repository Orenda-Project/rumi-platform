#!/usr/bin/env bash
# Rumi — install.
#
# The mechanical half of onboarding, and only that: check the tools, install
# dependencies, create .env from the template, put the `rumi` command on your
# PATH. It asks nothing about your accounts or credentials — that is `rumi
# setup`, which this script offers to run for you at the end.
#
# The split exists so that re-running either half is safe. This one is
# idempotent (it never overwrites an existing .env); the wizard remembers what
# is already configured and skips it.
#
#   ./install.sh
#
# See docs/onboarding/sandbox-production-design.md §5.

set -euo pipefail

# ${BASH_SOURCE[0]:-$0} rather than ${BASH_SOURCE[0]}: under `set -u` the bare
# form aborts when the script is piped into bash instead of executed.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
cd "$SCRIPT_DIR"

# Colour only when a human is watching, matching bot/scripts/setup/ui.js — a
# piped install log should stay readable.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  BOLD=$'\033[1m'; DIM=$'\033[38;2;140;152;168m'; GREEN=$'\033[38;2;37;211;102m'
  TEAL=$'\033[38;2;125;232;205m'; AMBER=$'\033[38;2;245;176;66m'; RED=$'\033[38;2;239;83;80m'
  RESET=$'\033[0m'
else
  BOLD=''; DIM=''; GREEN=''; TEAL=''; AMBER=''; RED=''; RESET=''
fi

step()  { printf '%s→%s %s\n' "$AMBER" "$RESET" "$1"; }
ok()    { printf '%s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn()  { printf '%s!%s %s\n' "$AMBER" "$RESET" "$1"; }
note()  { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
fail()  { printf '%s✘%s %s\n' "$RED" "$RESET" "$1"; exit 1; }

printf '\n'
printf '%s██████╗ ██╗   ██╗███╗   ███╗██╗%s\n' "$TEAL" "$RESET"
printf '%s██╔══██╗██║   ██║████╗ ████║██║%s\n' "$TEAL" "$RESET"
printf '%s██████╔╝██║   ██║██╔████╔██║██║%s\n' "$GREEN" "$RESET"
printf '%s██╔══██╗██║   ██║██║╚██╔╝██║██║%s\n' "$GREEN" "$RESET"
printf '%s██║  ██║╚██████╔╝██║ ╚═╝ ██║██║%s\n' "$GREEN" "$RESET"
printf '%s╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝%s\n' "$GREEN" "$RESET"
printf '\n%sAn AI teaching companion that lives in WhatsApp%s\n\n' "$DIM" "$RESET"

# --- 1. Tools ----------------------------------------------------------------

step "Checking the tools this needs"

command -v git >/dev/null 2>&1 || fail "git is not installed. Install it, then run this again."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Get version 18 or newer from https://nodejs.org, then run this again."
command -v npm >/dev/null 2>&1 || fail "npm is not installed — it normally comes with Node.js. Reinstall Node from https://nodejs.org"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Rumi needs Node 18 or newer; this is $(node -v). Update from https://nodejs.org, then run this again."
fi
ok "Node $(node -v), npm $(npm -v), git"

# --- 2. Dependencies ---------------------------------------------------------

step "Installing dependencies — a few minutes, and the noisiest part of this"
npm install --no-fund --no-audit
(cd bot && npm install --no-fund --no-audit)
ok "Dependencies installed"

# --- 3. Settings file --------------------------------------------------------

if [ -f .env ]; then
  ok "Found your existing .env — left exactly as it was"
else
  cp .env.template .env
  ok "Created .env (your settings file; it stays on this machine and is never committed)"
fi

# --- 4. The `rumi` command ---------------------------------------------------

RUMI_CMD="node bin/rumi.js"
step "Putting the 'rumi' command on your PATH"
if npm link >/dev/null 2>&1; then
  RUMI_CMD="rumi"
  ok "You can now run 'rumi' from anywhere"
  note "(a global npm link; undo it any time with 'npm unlink -g rumi')"
else
  warn "Could not add it (this usually means npm needs different permissions)"
  note "Not a problem — use 'node bin/rumi.js <command>' instead of 'rumi <command>'."
fi

# --- 5. Straight into setup --------------------------------------------------

printf '\n%s%s%s\n' "$DIM" "──────────────────────────────────────────────────────────────" "$RESET"
ok "Installed."
printf '\n'
printf '  %sNext:%s connect Rumi to your accounts. Takes about fifteen minutes,\n' "$BOLD" "$RESET"
printf '  and it explains every step as it goes.\n\n'
printf '      %s%s setup%s\n\n' "$TEAL" "$RUMI_CMD" "$RESET"

# Offered rather than assumed: the wizard needs accounts and keys to hand, and
# someone who ran this on a server at midnight may not have them yet.
if [ -t 0 ]; then
  printf '  %sRun it now? [Y/n]%s ' "$DIM" "$RESET"
  read -r ANSWER || ANSWER=""
  case "${ANSWER:-Y}" in
    [Yy]*|"") exec $RUMI_CMD setup ;;
    *) note "When you are ready: $RUMI_CMD setup" ;;
  esac
fi
printf '\n'
