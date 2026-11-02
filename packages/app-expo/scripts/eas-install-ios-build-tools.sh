#!/usr/bin/env bash
set -euo pipefail

if [[ "${EAS_BUILD_PLATFORM:-}" != "ios" ]]; then
  echo "Skipping iOS build tools install: EAS_BUILD_PLATFORM=${EAS_BUILD_PLATFORM:-unset}"
  exit 0
fi

missing_tools=()

if ! command -v cmake >/dev/null 2>&1; then
  missing_tools+=("cmake")
fi

if ! command -v pkg-config >/dev/null 2>&1; then
  missing_tools+=("pkg-config")
fi

if [[ ${#missing_tools[@]} -eq 0 ]]; then
  echo "iOS build tools already available."
  cmake --version | head -n 1
  pkg-config --version
  exit 0
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install ${missing_tools[*]} on the EAS macOS image."
  exit 1
fi

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1

echo "Installing iOS build tools: ${missing_tools[*]}"
brew install "${missing_tools[@]}"

cmake --version | head -n 1
pkg-config --version
