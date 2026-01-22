#!/bin/bash

# check_status.sh
# Checks the health of local services and prints a status table.

# Colors and formatting
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

# Function to check a URL
check_url() {
    local url=$1
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
        echo -e "${GREEN}Running${RESET}"
    else
        echo -e "${RED}Down${RESET}"
    fi
}

# Function to check a port (basic TCP check, fallback if curl fails)
check_port() {
    local port=$1
    if lsof -i :$port >/dev/null; then
        echo -e "${GREEN}Running${RESET}"
    else
        echo -e "${RED}Down${RESET}"
    fi
}

# Clear screen for a fresh table
clear

echo -e "${BOLD}Service Status${RESET}"
echo "--------------------------------------------------------------------------------"
printf "%-20s | %-10s | %-15s | %-30s\n" "Service" "Port" "Status" "Notes"
echo "--------------------------------------------------------------------------------"

# OpenSearch (9200)
STATUS_OS=$(check_url "http://localhost:9200")
printf "%-20s | %-10s | %-24s | %-30s\n" "OpenSearch" "9200" "$STATUS_OS" "Managed via brew services"

# Dashboards (5601)
STATUS_DASH=$(check_url "http://localhost:5601")
if [[ "$STATUS_DASH" == *"Down"* ]]; then
    STATUS_DASH="${YELLOW}Check${RESET}"
fi
printf "%-20s | %-10s | %-24s | %-30s\n" "Dashboards" "5601" "$STATUS_DASH" "http://localhost:5601"

# Neo4j (7474)
STATUS_NEO=$(check_url "http://localhost:7474")
printf "%-20s | %-10s | %-24s | %-30s\n" "Neo4j" "7474" "$STATUS_NEO" "User: neo4j, Pass: password"

# Weaviate (8080)
# Weaviate /v1/meta usually returns 200 OK
STATUS_WEA=$(check_url "http://localhost:8080/v1/meta")
printf "%-20s | %-10s | %-24s | %-30s\n" "Weaviate" "8080" "$STATUS_WEA" "Binary in ./bin/weaviate"

# Ollama (11434)
STATUS_OLLAMA=$(check_url "http://localhost:11434")
if [[ "$STATUS_OLLAMA" == *"Down"* ]]; then
     STATUS_OLLAMA="${YELLOW}Manual${RESET}"
fi
printf "%-20s | %-10s | %-24s | %-30s\n" "Ollama" "11434" "$STATUS_OLLAMA" "Run 'ollama serve'"

# Postgres (5432)
# Harder to curl, check port
STATUS_PG=$(check_port 5432)
printf "%-20s | %-10s | %-24s | %-30s\n" "Postgres" "5432" "$STATUS_PG" "Existing (Wiki.js)"

echo "--------------------------------------------------------------------------------"
echo ""
echo "Press any key to close this window..."
read -n 1
exit 0
