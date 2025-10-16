#!/usr/bin/env bash
set -euo pipefail

SUDO="sudo"
if ! command -v sudo >/dev/null 2>&1; then
  SUDO=""
fi

echo "[1/5] Updating APT and installing prerequisites..."
$SUDO apt-get update -y
$SUDO apt-get install -y apt-transport-https ca-certificates gnupg curl

echo "[2/5] Adding Google Cloud SDK APT repository key..."
$SUDO mkdir -p /usr/share/keyrings
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | $SUDO gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg

echo "[3/5] Adding Google Cloud SDK repository..."
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | $SUDO tee /etc/apt/sources.list.d/google-cloud-sdk.list

echo "[4/5] Installing google-cloud-cli..."
$SUDO apt-get update -y
$SUDO apt-get install -y google-cloud-cli

echo "[5/5] Verifying installation..."
gcloud --version
echo "Google Cloud SDK installed successfully."
