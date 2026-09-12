#!/bin/zsh
cd "$(dirname "$0")"
echo "Memory Card запущен: http://localhost:8080"
python3 -m http.server 8080
