#!/usr/bin/env bash
#
# build.sh - Build the DeepSeek Research Bot Chrome Extension
#
# Usage:
#   ./build.sh              # Build to ./dist/
#   ./build.sh --clean      # Clean build (removes dist first)
#   ./build.sh --zip        # Build + create zip for Chrome Web Store
#

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"
BUILD_ZIP=false
CLEAN_BUILD=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --clean)  CLEAN_BUILD=true ;;
    --zip)    BUILD_ZIP=true ;;
    -h|--help)
      echo "Usage: $0 [--clean] [--zip]"
      echo ""
      echo "  --clean   Remove dist/ before building"
      echo "  --zip     Also create a .zip for Chrome Web Store"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

echo "╔══════════════════════════════════════════╗"
echo "║  DeepSeek Research Bot - Extension Build  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Clean if requested
if [ "$CLEAN_BUILD" = true ]; then
  echo "🧹 Cleaning previous build..."
  rm -rf "$DIST_DIR"
fi

# Create dist directory
echo "📁 Preparing dist directory..."
mkdir -p "$DIST_DIR"

# Copy manifest
echo "📋 Copying manifest.json..."
cp "${PROJECT_DIR}/manifest.json" "$DIST_DIR/"

# Copy source files
echo "📦 Copying source files..."
mkdir -p "${DIST_DIR}/src"
cp "${PROJECT_DIR}/src/content.js"      "${DIST_DIR}/src/"
cp "${PROJECT_DIR}/src/background.js"   "${DIST_DIR}/src/"
cp "${PROJECT_DIR}/src/sidepanel.html"  "${DIST_DIR}/src/"
cp "${PROJECT_DIR}/src/sidepanel.js"    "${DIST_DIR}/src/"

# Copy icons
echo "🎨 Copying icons..."
mkdir -p "${DIST_DIR}/icons"
cp "${PROJECT_DIR}/icons/"*.png "${DIST_DIR}/icons/"

# Validate manifest
echo ""
echo "🔍 Validating manifest.json..."
if python3 -c "
import json, sys
with open('${DIST_DIR}/manifest.json') as f:
    m = json.load(f)
required = ['manifest_version', 'name', 'version', 'permissions', 'content_scripts', 'background']
missing = [k for k in required if k not in m]
if missing:
    print(f'❌ Missing keys: {missing}')
    sys.exit(1)
print(f'✓ Manifest valid (v{m[\"version\"]}, MV{m[\"manifest_version\"]})')
"; then
  echo ""
else
  echo "❌ Manifest validation failed!"
  exit 1
fi

# List what was built
echo "📂 Build contents:"
find "$DIST_DIR" -type f | sort | while read -r f; do
  rel="${f#$DIST_DIR/}"
  size=$(wc -c < "$f" | tr -d ' ')
  printf "   %-40s %5s bytes\n" "$rel" "$size"
done

# Calculate total size
TOTAL_SIZE=$(find "$DIST_DIR" -type f -exec cat {} + | wc -c | tr -d ' ')
echo ""
echo "📏 Total size: ${TOTAL_SIZE} bytes"

# Optional: create zip
if [ "$BUILD_ZIP" = true ]; then
  ZIP_NAME="deepseek-research-bot-extension.zip"
  ZIP_PATH="${PROJECT_DIR}/${ZIP_NAME}"
  
  echo ""
  echo "📦 Creating zip archive..."
  
  # Remove old zip
  rm -f "$ZIP_PATH"
  
  # Create zip from inside dist so paths are relative
  (cd "$DIST_DIR" && zip -r -q "$ZIP_PATH" .)
  
  ZIP_SIZE=$(wc -c < "$ZIP_PATH" | tr -d ' ')
  echo "✓ Created: ${ZIP_NAME} (${ZIP_SIZE} bytes)"
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "To load the extension in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode' (top right)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: ${DIST_DIR}"
echo ""
