#!/usr/bin/env bash
set -euo pipefail

# bmo install script
# Builds the binary and installs tools, skills, and optionally the binary itself.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default install locations
BMO_DATA="${BMO_DATA:-$HOME/.local/share/bmo}"
INSTALL_BIN="${INSTALL_BIN:-$HOME/.local/bin}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

info() { printf "${GREEN}[install]${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}[install]${NC} %s\n" "$1"; }
error() { printf "${RED}[install]${NC} %s\n" "$1" >&2; }

usage() {
    cat << USAGE
Usage: $0 [OPTIONS]

Builds bmo and installs tools, skills, and binary.

Options:
    --no-build      Skip building (use existing dist/bmo)
    --no-binary     Skip installing binary to INSTALL_BIN
    --force         Overwrite existing files without prompting
    -h, --help      Show this help

Environment variables:
    BMO_DATA        Data directory (default: ~/.local/share/bmo)
    INSTALL_BIN     Binary install directory (default: ~/.local/bin)

USAGE
}

# Parse args
DO_BUILD=1
DO_BINARY=1
FORCE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-build)  DO_BUILD=0; shift ;;
        --no-binary) DO_BINARY=0; shift ;;
        --force)     FORCE=1; shift ;;
        -h|--help)   usage; exit 0 ;;
        *)           error "Unknown option: $1"; usage; exit 1 ;;
    esac
done

# Step 1: Build (unless --no-build)
if [[ $DO_BUILD -eq 1 ]]; then
    info "Building bmo..."
    cd "$PROJECT_ROOT"
    bun run build
fi

# Verify binary exists
if [[ ! -f "$PROJECT_ROOT/dist/bmo" ]]; then
    error "Binary not found at $PROJECT_ROOT/dist/bmo"
    error "Run without --no-build or build manually first."
    exit 1
fi

# Step 2: Create data directories
info "Creating data directories at $BMO_DATA..."
mkdir -p "$BMO_DATA/tools"
mkdir -p "$BMO_DATA/skills"
mkdir -p "$BMO_DATA/docs"
mkdir -p "$BMO_DATA/sessions"
mkdir -p "$BMO_DATA/snapshots"
mkdir -p "$BMO_DATA/summaries"

# Step 3: Copy tools
if [[ -d "$PROJECT_ROOT/tools" ]]; then
    TOOL_COUNT=$(find "$PROJECT_ROOT/tools" -name "*.mjs" | wc -l | tr -d ' ')
    if [[ $TOOL_COUNT -gt 0 ]]; then
        info "Installing $TOOL_COUNT tool(s)..."
        cp -v "$PROJECT_ROOT/tools/"*.mjs "$BMO_DATA/tools/" 2>/dev/null || true
    else
        warn "No .mjs tools found in $PROJECT_ROOT/tools"
    fi
else
    warn "No tools directory found at $PROJECT_ROOT/tools"
fi

# Step 4: Copy skills
if [[ -d "$PROJECT_ROOT/skills" ]]; then
    SKILL_COUNT=$(find "$PROJECT_ROOT/skills" -name "*.md" | wc -l | tr -d ' ')
    if [[ $SKILL_COUNT -gt 0 ]]; then
        info "Installing $SKILL_COUNT skill(s)..."
        cp -v "$PROJECT_ROOT/skills/"*.md "$BMO_DATA/skills/" 2>/dev/null || true
    else
        warn "No .md skills found in $PROJECT_ROOT/skills"
    fi
else
    warn "No skills directory found at $PROJECT_ROOT/skills"
fi

# Step 5: Copy docs (preserving existing content where possible)
if [[ -d "$PROJECT_ROOT/docs" ]]; then
    info "Installing docs..."
    # These are append-style logs, so we copy only if destination doesn't exist
    for doc in IMPROVEMENTS.md OPPORTUNITIES.md EXPERIMENT.md; do
        src="$PROJECT_ROOT/docs/$doc"
        dst="$BMO_DATA/docs/$doc"
        if [[ -f "$src" ]]; then
            if [[ ! -f "$dst" ]] || [[ $FORCE -eq 1 ]]; then
                cp -v "$src" "$dst"
            else
                warn "Skipping $doc (already exists, use --force to overwrite)"
            fi
        fi
    done
fi

# Step 6: Install binary (unless --no-binary)
if [[ $DO_BINARY -eq 1 ]]; then
    mkdir -p "$INSTALL_BIN"
    DEST="$INSTALL_BIN/bmo"
    if [[ -f "$DEST" ]] && [[ $FORCE -eq 0 ]]; then
        warn "Binary already exists at $DEST"
        read -p "Overwrite? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "Skipping binary install"
        else
            cp "$PROJECT_ROOT/dist/bmo" "$DEST"
            info "Binary installed to $DEST"
        fi
    else
        cp "$PROJECT_ROOT/dist/bmo" "$DEST"
        info "Binary installed to $DEST"
    fi
    
    # Check if INSTALL_BIN is in PATH
    if [[ ":$PATH:" != *":$INSTALL_BIN:"* ]]; then
        warn "$INSTALL_BIN is not in your PATH"
        warn "Add this to your shell profile:"
        echo "    export PATH=\"\$PATH:$INSTALL_BIN\""
    fi
fi

# Summary
echo
info "Installation complete!"
echo "    Data directory: $BMO_DATA"
echo "    Tools: $(ls "$BMO_DATA/tools/"*.mjs 2>/dev/null | wc -l | tr -d ' ') installed"
echo "    Skills: $(ls "$BMO_DATA/skills/"*.md 2>/dev/null | wc -l | tr -d ' ') installed"
if [[ $DO_BINARY -eq 1 ]]; then
    echo "    Binary: $INSTALL_BIN/bmo"
fi
echo
info "Run 'bmo' to start, or 'bmo --help' for options."
