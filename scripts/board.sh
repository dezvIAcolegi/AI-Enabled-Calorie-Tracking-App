#!/usr/bin/env bash
# Message board for the four Claude Code sessions.
# The board is one GitHub issue (number in scripts/board.conf); every post is a comment.
# Needs the GitHub CLI, logged in as you: `gh auth login`.
#
#   scripts/board.sh inbox                  new posts that tag you (or @team) since you last looked
#   scripts/board.sh watch [seconds]        run inbox in a loop; prints only when something new arrives
#   scripts/board.sh post TYPE "message"    post a comment (message can also come on stdin)
#   scripts/board.sh recent [n]             last n posts from the team, tagged or not (default 15)
#   scripts/board.sh whoami                 your login, role and the board issue
#
# TYPE is one of: DONE NEED BLOCKED CLAIM RELEASE PROPOSAL FYI
# Comments from accounts outside TEAM are never shown: the repo is public and anyone can comment.
# Works with bash 3.2+ (macOS) and Git Bash on Windows.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=board.conf
source "$here/board.conf"

die() { echo "board: $*" >&2; exit 1; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

case "$BOARD_ISSUE" in ''|*[!0-9]*|0) die "set BOARD_ISSUE in scripts/board.conf" ;; esac
command -v gh >/dev/null 2>&1 || die "install the GitHub CLI and run: gh auth login"

ME="${BOARD_ME:-$(gh api user --jq .login)}"
ME_LC="$(lower "$ME")"

root="$(git -C "$here" rev-parse --show-toplevel)"
mkdir -p "$root/.board"
state="$root/.board/last-seen-$ME_LC"

role_of() {
  local who pair
  who="$(lower "$1")"
  for pair in $TEAM; do
    if [ "$(lower "${pair%%=*}")" = "$who" ]; then echo "${pair#*=}"; return 0; fi
  done
  return 1
}

# One TSV line per comment: id, login, created_at, url, body (newlines turned into " / ").
fetch() {
  local since="${1:-}" q="per_page=100"
  [ -n "$since" ] && q="$q&since=$since"
  gh api --paginate "repos/$REPO/issues/$BOARD_ISSUE/comments?$q" \
    --jq '.[] | [.id, .user.login, .created_at, .html_url, (.body | gsub("\\s*\\r?\\n\\s*"; " / "))] | @tsv'
}

mentions_me() {
  printf '%s' "$1" | grep -qiE "@(${ME}|team)([^A-Za-z0-9-]|\$)"
}

show() { # login created url body
  local role
  role="$(role_of "$1" || echo "?")"
  printf '%s  @%s (%s)  %s\n    %s\n' "$2" "$1" "$role" "$3" "$4"
}

inbox() {
  local last_id=0 last_ts="" max_id max_ts outsiders=0
  local id login created url body
  if [ -f "$state" ]; then read -r last_id last_ts < "$state" || true; fi
  max_id="$last_id"; max_ts="$last_ts"
  local lines
  lines="$(fetch "$last_ts")" || return 1
  while IFS=$'\t' read -r id login created url body; do
    [ -n "$id" ] || continue
    if [ "$id" -gt "$max_id" ]; then max_id="$id"; max_ts="$created"; fi
    [ "$id" -gt "$last_id" ] || continue
    if ! role_of "$login" >/dev/null; then outsiders=$((outsiders + 1)); continue; fi
    [ "$(lower "$login")" = "$ME_LC" ] && continue
    mentions_me "$body" || continue
    show "$login" "$created" "$url" "$body"
  done <<< "$lines"
  [ "$outsiders" -gt 0 ] && echo "board: ignored $outsiders new comment(s) from accounts outside the team" >&2
  echo "$max_id $max_ts" > "$state"
}

cmd="${1:-inbox}"
[ $# -gt 0 ] && shift

case "$cmd" in
  inbox)
    inbox
    ;;
  watch)
    interval="${1:-$WATCH_INTERVAL}"
    echo "board: watching issue #$BOARD_ISSUE for @$ME and @team every ${interval}s"
    while true; do
      inbox || echo "board: couldn't reach GitHub, retrying in ${interval}s" >&2
      sleep "$interval"
    done
    ;;
  post)
    type="$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')"
    [ $# -gt 0 ] && shift
    case "$type" in DONE|NEED|BLOCKED|CLAIM|RELEASE|PROPOSAL|FYI) ;;
      *) die "post TYPE must be one of DONE NEED BLOCKED CLAIM RELEASE PROPOSAL FYI" ;; esac
    if [ $# -gt 0 ]; then msg="$*"; else msg="$(cat)"; fi
    [ -n "$msg" ] || die "empty message"
    role="$(role_of "$ME" || echo "$ME")"
    printf '**%s** · %s\n\n%s\n' "$type" "$role" "$msg" \
      | gh issue comment "$BOARD_ISSUE" -R "$REPO" --body-file -
    ;;
  recent)
    n="${1:-15}"
    fetch "" | while IFS=$'\t' read -r id login created url body; do
      if role_of "$login" >/dev/null; then show "$login" "$created" "$url" "$body"; fi
    done | tail -n "$((n * 2))"
    ;;
  whoami)
    echo "@$ME ($(role_of "$ME" || echo "not in TEAM")) · board: https://github.com/$REPO/issues/$BOARD_ISSUE"
    ;;
  *)
    die "unknown command '$cmd' (inbox, watch, post, recent, whoami)"
    ;;
esac
