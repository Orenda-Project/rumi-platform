#!/bin/bash
set -euo pipefail

# ============================================================================
# sync-from-internal.sh
#
# Generates a unified diff patch from the internal repo to the public monorepo,
# respecting the path mappings, exclusions, and publicOnly rules defined in
# .sync-manifest.json at the monorepo root.
#
# Usage:
#   ./infrastructure/scripts/sync-from-internal.sh \
#     --internal-path ~/Projects/whatsapp-ai-bot \
#     --since "2026-01-15" \
#     --dry-run
#
#   # Apply the generated patch afterward:
#   git apply sync-patch-2026-01-28.patch
# ============================================================================

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
INTERNAL_PATH=""
SINCE_DATE=""
DRY_RUN=false
OUTPUT_FILE=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$MONOREPO_ROOT/.sync-manifest.json"
TODAY="$(date +%Y-%m-%d)"
TEMP_DIR=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { printf "\033[1;34m[INFO]\033[0m  %s\n" "$*"; }
warn()  { printf "\033[1;33m[WARN]\033[0m  %s\n" "$*"; }
error() { printf "\033[1;31m[ERROR]\033[0m %s\n" "$*" >&2; }
bold()  { printf "\033[1m%s\033[0m" "$*"; }

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'USAGE'
Usage: sync-from-internal.sh [OPTIONS]

Options:
  --internal-path PATH   Path to the internal repo (required)
  --since DATE           Only diff files modified after DATE (YYYY-MM-DD)
  --dry-run              Show what would be synced without generating a patch
  --output FILE          Output patch file name (default: sync-patch-YYYY-MM-DD.patch)
  -h, --help             Show this help message

Examples:
  # Generate patch from internal repo
  ./infrastructure/scripts/sync-from-internal.sh \
    --internal-path ~/Projects/whatsapp-ai-bot \
    --since "2026-01-15"

  # Dry run
  ./infrastructure/scripts/sync-from-internal.sh \
    --internal-path ~/Projects/whatsapp-ai-bot \
    --dry-run

  # Apply the generated patch
  git apply sync-patch-2026-01-28.patch
USAGE
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --internal-path)
      INTERNAL_PATH="$2"
      shift 2
      ;;
    --since)
      SINCE_DATE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [[ -z "$INTERNAL_PATH" ]]; then
  error "Missing required flag: --internal-path"
  usage
  exit 1
fi

# Resolve to absolute path
INTERNAL_PATH="$(cd "$INTERNAL_PATH" 2>/dev/null && pwd)" || {
  error "Internal path does not exist or is not accessible: $INTERNAL_PATH"
  exit 1
}

if [[ ! -d "$INTERNAL_PATH" ]]; then
  error "Internal path is not a directory: $INTERNAL_PATH"
  exit 1
fi

if [[ ! -f "$MANIFEST" ]]; then
  error "Sync manifest not found at: $MANIFEST"
  error "Expected .sync-manifest.json at the monorepo root ($MONOREPO_ROOT)"
  exit 1
fi

# Check for required tools
for cmd in jq diff find; do
  if ! command -v "$cmd" &>/dev/null; then
    error "Required command not found: $cmd"
    exit 1
  fi
done

if [[ -n "$SINCE_DATE" ]]; then
  # Validate date format (loose check)
  if ! date -j -f "%Y-%m-%d" "$SINCE_DATE" "+%s" &>/dev/null 2>&1; then
    # Try GNU date as fallback
    if ! date -d "$SINCE_DATE" "+%s" &>/dev/null 2>&1; then
      error "Invalid date format for --since: $SINCE_DATE (expected YYYY-MM-DD)"
      exit 1
    fi
  fi
fi

# Default output file
if [[ -z "$OUTPUT_FILE" ]]; then
  OUTPUT_FILE="sync-patch-${TODAY}.patch"
fi

# ---------------------------------------------------------------------------
# Read manifest
# ---------------------------------------------------------------------------
MAPPING_COUNT=$(jq '.mappings | length' "$MANIFEST")
EXCLUDE_PATTERNS=$(jq -r '.exclude[]' "$MANIFEST")
PUBLIC_ONLY=$(jq -r '.publicOnly[]' "$MANIFEST")
TRANSLATION_PATTERNS=$(jq -r '.translationRules[].pattern' "$MANIFEST" 2>/dev/null || true)

info "Monorepo root:  $MONOREPO_ROOT"
info "Internal path:  $INTERNAL_PATH"
info "Manifest:       $MANIFEST"
info "Mappings:       $MAPPING_COUNT"
info "Output:         $OUTPUT_FILE"
if [[ -n "$SINCE_DATE" ]]; then
  info "Since date:     $SINCE_DATE"
fi
if $DRY_RUN; then
  info "Mode:           DRY RUN"
fi
echo ""

# ---------------------------------------------------------------------------
# Build exclude arguments for diff
# ---------------------------------------------------------------------------
build_diff_excludes() {
  local excludes=()
  # Always exclude these regardless of manifest
  excludes+=("--exclude=node_modules" "--exclude=.git")

  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    # Strip trailing slash for diff --exclude
    pattern="${pattern%/}"
    excludes+=("--exclude=$pattern")
  done <<< "$EXCLUDE_PATTERNS"

  echo "${excludes[@]}"
}

# ---------------------------------------------------------------------------
# Check if a path is in the publicOnly list
# ---------------------------------------------------------------------------
is_public_only() {
  local file_path="$1"
  while IFS= read -r pub_path; do
    [[ -z "$pub_path" ]] && continue
    # Check if the file path starts with or matches the publicOnly entry
    if [[ "$file_path" == "$pub_path" || "$file_path" == "$pub_path"* ]]; then
      return 0
    fi
  done <<< "$PUBLIC_ONLY"
  return 1
}

# ---------------------------------------------------------------------------
# Create a since-date reference file for find -newer
# ---------------------------------------------------------------------------
SINCE_REF_FILE=""
if [[ -n "$SINCE_DATE" ]]; then
  TEMP_DIR="$(mktemp -d)"
  SINCE_REF_FILE="$TEMP_DIR/since-ref"
  touch -t "$(date -j -f '%Y-%m-%d' "$SINCE_DATE" '+%Y%m%d0000' 2>/dev/null || date -d "$SINCE_DATE" '+%Y%m%d0000' 2>/dev/null)" "$SINCE_REF_FILE" 2>/dev/null || {
    # Fallback: use touch with date string
    touch -d "$SINCE_DATE" "$SINCE_REF_FILE" 2>/dev/null || {
      warn "Could not create reference file for --since filtering. Proceeding without date filter."
      SINCE_REF_FILE=""
    }
  }
fi

# ---------------------------------------------------------------------------
# Main diff loop
# ---------------------------------------------------------------------------
TOTAL_FILES_CHANGED=0
TOTAL_INSERTIONS=0
TOTAL_DELETIONS=0
SQS_WARNINGS=()
DIFF_EXCLUDES=$(build_diff_excludes)
PATCH_CONTENT=""
SKIPPED_PUBLIC_ONLY=0
SKIPPED_SINCE=0
MAPPINGS_PROCESSED=0

for i in $(seq 0 $((MAPPING_COUNT - 1))); do
  INTERNAL_REL=$(jq -r ".mappings[$i].internal" "$MANIFEST")
  PUBLIC_REL=$(jq -r ".mappings[$i].public" "$MANIFEST")
  DIRECTION=$(jq -r ".mappings[$i].direction" "$MANIFEST")
  NOTES=$(jq -r ".mappings[$i].notes" "$MANIFEST")

  # Only process internal-to-public mappings
  if [[ "$DIRECTION" != "internal-to-public" ]]; then
    info "Skipping mapping (direction=$DIRECTION): $INTERNAL_REL"
    continue
  fi

  INTERNAL_FULL="$INTERNAL_PATH/$INTERNAL_REL"
  PUBLIC_FULL="$MONOREPO_ROOT/$PUBLIC_REL"

  # Check that internal source exists
  if [[ ! -d "$INTERNAL_FULL" ]]; then
    warn "Internal path does not exist, skipping: $INTERNAL_FULL"
    continue
  fi

  MAPPINGS_PROCESSED=$((MAPPINGS_PROCESSED + 1))
  info "Processing mapping $MAPPINGS_PROCESSED: $(bold "$INTERNAL_REL") -> $(bold "$PUBLIC_REL")"
  if [[ "$NOTES" != "null" && -n "$NOTES" ]]; then
    info "  Notes: $NOTES"
  fi

  # If public path doesn't exist, the diff will show all files as new
  if [[ ! -d "$PUBLIC_FULL" ]]; then
    warn "  Public path does not exist (will show as new files): $PUBLIC_FULL"
    mkdir -p "$PUBLIC_FULL"
  fi

  # If --since is set, check if any files in the internal path were modified
  if [[ -n "$SINCE_REF_FILE" ]]; then
    MODIFIED_FILES=$(find "$INTERNAL_FULL" -type f -newer "$SINCE_REF_FILE" \
      -not -path "*/node_modules/*" \
      -not -path "*/.git/*" \
      2>/dev/null | head -1)
    if [[ -z "$MODIFIED_FILES" ]]; then
      info "  No files modified since $SINCE_DATE, skipping."
      SKIPPED_SINCE=$((SKIPPED_SINCE + 1))
      continue
    fi
  fi

  # Generate diff for this mapping
  # We use labels to rewrite the paths in the patch so they are relative to
  # the monorepo root, making the patch directly applicable with git apply.
  MAPPING_DIFF=$(diff -ruN \
    $DIFF_EXCLUDES \
    --label "a/$PUBLIC_REL" \
    --label "b/$PUBLIC_REL" \
    "$PUBLIC_FULL" \
    "$INTERNAL_FULL" 2>/dev/null || true)

  if [[ -z "$MAPPING_DIFF" ]]; then
    info "  No differences found."
    continue
  fi

  # Post-process the diff: fix paths so they're relative to monorepo root
  # diff -ruN outputs paths like:
  #   --- /absolute/path/to/public/file
  #   +++ /absolute/path/to/internal/file
  # We need them as:
  #   --- a/bot/shared/handlers/file
  #   +++ b/bot/shared/handlers/file
  PROCESSED_DIFF=$(echo "$MAPPING_DIFF" | while IFS= read -r line; do
    if [[ "$line" =~ ^---\ .+ ]]; then
      # Extract file path relative to the public dir
      file_rel="${line#*"$PUBLIC_FULL"}"
      if [[ "$file_rel" == "$line" ]]; then
        # Try internal path (for new files)
        file_rel="${line#*"$INTERNAL_FULL"}"
      fi
      file_rel="${file_rel#/}"
      full_public_path="${PUBLIC_REL%/}/${file_rel}"

      # Check if this file is in publicOnly list
      if is_public_only "$full_public_path"; then
        # We'll filter this entire file block out below
        echo "___SKIP_PUBLIC_ONLY___"
        continue
      fi

      echo "--- a/${full_public_path}"
    elif [[ "$line" =~ ^\+\+\+\ .+ ]]; then
      file_rel="${line#*"$INTERNAL_FULL"}"
      if [[ "$file_rel" == "$line" ]]; then
        file_rel="${line#*"$PUBLIC_FULL"}"
      fi
      file_rel="${file_rel#/}"
      full_public_path="${PUBLIC_REL%/}/${file_rel}"

      if is_public_only "$full_public_path"; then
        echo "___SKIP_PUBLIC_ONLY___"
        continue
      fi

      echo "+++ b/${full_public_path}"
    else
      echo "$line"
    fi
  done)

  # Filter out publicOnly file blocks
  # A file block starts with "diff -ruN" or "---" and ends before the next one
  FILTERED_DIFF=""
  SKIP_BLOCK=false
  while IFS= read -r line; do
    if [[ "$line" == "___SKIP_PUBLIC_ONLY___" ]]; then
      SKIP_BLOCK=true
      SKIPPED_PUBLIC_ONLY=$((SKIPPED_PUBLIC_ONLY + 1))
      continue
    fi

    if [[ "$line" =~ ^diff\ -ruN || "$line" =~ ^---\ [ab]/ ]]; then
      SKIP_BLOCK=false
    fi

    if ! $SKIP_BLOCK; then
      FILTERED_DIFF+="$line"$'\n'
    fi
  done <<< "$PROCESSED_DIFF"

  if [[ -n "$FILTERED_DIFF" ]]; then
    PATCH_CONTENT+="$FILTERED_DIFF"

    # Count stats for this mapping
    FILES_IN_MAPPING=$(echo "$FILTERED_DIFF" | grep -c "^--- " || true)
    INSERTIONS_IN_MAPPING=$(echo "$FILTERED_DIFF" | grep -c "^+" | head -1 || true)
    DELETIONS_IN_MAPPING=$(echo "$FILTERED_DIFF" | grep -c "^-" | head -1 || true)
    # Subtract the --- and +++ header lines from counts
    INSERTIONS_IN_MAPPING=$((INSERTIONS_IN_MAPPING - FILES_IN_MAPPING))
    DELETIONS_IN_MAPPING=$((DELETIONS_IN_MAPPING - FILES_IN_MAPPING))
    # Clamp to zero
    [[ $INSERTIONS_IN_MAPPING -lt 0 ]] && INSERTIONS_IN_MAPPING=0
    [[ $DELETIONS_IN_MAPPING -lt 0 ]] && DELETIONS_IN_MAPPING=0

    TOTAL_FILES_CHANGED=$((TOTAL_FILES_CHANGED + FILES_IN_MAPPING))
    TOTAL_INSERTIONS=$((TOTAL_INSERTIONS + INSERTIONS_IN_MAPPING))
    TOTAL_DELETIONS=$((TOTAL_DELETIONS + DELETIONS_IN_MAPPING))

    info "  Files changed: $FILES_IN_MAPPING | +$INSERTIONS_IN_MAPPING -$DELETIONS_IN_MAPPING"

    # Check for SQS references
    SQS_HITS=$(echo "$FILTERED_DIFF" | grep -n -i "sqs" || true)
    if [[ -n "$SQS_HITS" ]]; then
      SQS_WARNINGS+=("$PUBLIC_REL")
      warn "  SQS references detected in diff for $PUBLIC_REL"
    fi
  else
    info "  No differences after filtering."
  fi

  echo ""
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "============================================================================"
bold "  SYNC SUMMARY"
echo ""
echo "============================================================================"
echo ""
info "Mappings processed:    $MAPPINGS_PROCESSED"
info "Files changed:         $TOTAL_FILES_CHANGED"
info "Insertions:            +$TOTAL_INSERTIONS"
info "Deletions:             -$TOTAL_DELETIONS"

if [[ $SKIPPED_PUBLIC_ONLY -gt 0 ]]; then
  info "Skipped (publicOnly):  $SKIPPED_PUBLIC_ONLY file(s)"
fi
if [[ $SKIPPED_SINCE -gt 0 ]]; then
  info "Skipped (not modified since $SINCE_DATE): $SKIPPED_SINCE mapping(s)"
fi

# SQS translation warnings
if [[ ${#SQS_WARNINGS[@]} -gt 0 ]]; then
  echo ""
  warn "========================================================================"
  warn "SQS REFERENCES DETECTED - Translation may be needed!"
  warn "The following mappings contain SQS references that should be"
  warn "translated to BullMQ equivalents before applying the patch:"
  for sqs_path in "${SQS_WARNINGS[@]}"; do
    warn "  - $sqs_path"
  done
  warn ""
  warn "Translation rules from manifest:"
  jq -r '.translationRules[] | "  \(.pattern)  ->  \(.replacement)"' "$MANIFEST" 2>/dev/null || true
  warn "========================================================================"
fi

# Credential review reminder
echo ""
warn "========================================================================"
warn "REMINDER: Review the patch for credentials, API keys, secrets,"
warn "and .env references before applying."
warn "========================================================================"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [[ $TOTAL_FILES_CHANGED -eq 0 ]]; then
  info "No changes detected. No patch file generated."
  exit 0
fi

if $DRY_RUN; then
  echo ""
  info "DRY RUN complete. No patch file was generated."
  info "Re-run without --dry-run to generate: $OUTPUT_FILE"
else
  echo "$PATCH_CONTENT" > "$OUTPUT_FILE"
  echo ""
  info "Patch written to: $(bold "$OUTPUT_FILE")"
  info "Size: $(wc -c < "$OUTPUT_FILE" | tr -d ' ') bytes"
  echo ""
  info "To apply this patch:"
  info "  cd $MONOREPO_ROOT"
  info "  git apply $OUTPUT_FILE"
  echo ""
  info "To preview what the patch would change:"
  info "  git apply --stat $OUTPUT_FILE"
fi
