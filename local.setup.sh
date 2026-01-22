#!/bin/bash
set -u

# local.setup.sh
# Sets up the noise.bybraincloud.com local environment on macOS (Native/Homebrew)
# Avoids Docker as per user request.

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
WEAVIATE_VERSION="1.23.0"
OPENSEARCH_PORT=9200
DASHBOARDS_PORT=5601
NEO4J_HTTP_PORT=7474
NEO4J_BOLT_PORT=7687
WEAVIATE_PORT=8080

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

log_warn() {
    echo -e "\033[1;33m[WARN]\033[0m $1"
}

log_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

check_command() {
    command -v "$1" >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# OS Detection
# -----------------------------------------------------------------------------
OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
    log_error "This script currently supports macOS (Darwin). Detected: $OS"
    echo "For Linux/AWS, please use 'deploy.sh'."
    exit 1
fi

log_info "Detected macOS. Proceeding with native setup..."

# -----------------------------------------------------------------------------
# 1. Homebrew Check
# -----------------------------------------------------------------------------
if ! check_command brew; then
    log_error "Homebrew is not installed. Please install it first: https://brew.sh/"
    exit 1
fi
log_info "Homebrew found."

# -----------------------------------------------------------------------------
# 2. OpenSearch & Dashboards
# -----------------------------------------------------------------------------
log_info "Setting up OpenSearch..."
if ! brew list opensearch >/dev/null 2>&1; then
    log_info "Installing OpenSearch via Homebrew..."
    brew tap opensearch-project/opensearch
    brew install opensearch
else
    log_info "OpenSearch already installed."
fi

log_info "Setting up OpenSearch Dashboards..."
if ! brew list opensearch-dashboards >/dev/null 2>&1; then
    log_info "Installing OpenSearch Dashboards via Homebrew..."
    brew tap opensearch-project/opensearch-dashboards
    brew install opensearch-dashboards
else
    log_info "OpenSearch Dashboards already installed."
fi

# Fix for missing PID directory on some brew installs
if [ -d "/opt/homebrew/var" ] && [ ! -d "/opt/homebrew/var/run" ]; then
    log_info "Creating missing PID directory /opt/homebrew/var/run..."
    mkdir -p /opt/homebrew/var/run
elif [ -d "/usr/local/var" ] && [ ! -d "/usr/local/var/run" ]; then
    log_info "Creating missing PID directory /usr/local/var/run..."
    mkdir -p /usr/local/var/run
fi

# Start Services (Restart if needed to ensure config)
log_info "Starting OpenSearch services..."
brew services list | grep opensearch | grep started || brew services start opensearch
brew services list | grep opensearch-dashboards | grep started || brew services start opensearch-dashboards

# Wait for OpenSearch
log_info "Waiting for OpenSearch to be available at localhost:$OPENSEARCH_PORT..."
RETRIES=30
while [ $RETRIES -gt 0 ]; do
    if curl -s "http://localhost:$OPENSEARCH_PORT" >/dev/null; then
        log_info "OpenSearch is UP!"
        break
    fi
    sleep 2
    ((RETRIES--))
done
if [ $RETRIES -eq 0 ]; then
    log_warn "OpenSearch did not respond in time. Please check 'brew services info opensearch'."
fi

# Wait for Dashboards
log_info "Waiting for OpenSearch Dashboards at localhost:$DASHBOARDS_PORT..."
RETRIES=30
while [ $RETRIES -gt 0 ]; do
    if curl -s "http://localhost:$DASHBOARDS_PORT" >/dev/null; then
        log_info "Dashboards is UP!"
        break
    fi
    sleep 2
    ((RETRIES--))
done
if [ $RETRIES -eq 0 ]; then
    log_warn "Dashboards did not respond in time. It might still be starting."
fi

# -----------------------------------------------------------------------------
# 3. Neo4j
# -----------------------------------------------------------------------------
log_info "Setting up Neo4j..."
if ! brew list neo4j >/dev/null 2>&1; then
    log_info "Installing Neo4j Community Edition..."
    brew install neo4j
else
    log_info "Neo4j already installed."
fi

log_info "Starting Neo4j..."
brew services list | grep neo4j | grep started || brew services start neo4j

# Wait for Neo4j
log_info "Waiting for Neo4j at localhost:$NEO4J_HTTP_PORT..."
# Neo4j can take a moment
sleep 5
# Simple check
if curl -s "http://localhost:$NEO4J_HTTP_PORT" >/dev/null; then
    log_info "Neo4j is responding."
else
    log_warn "Neo4j is not immediately responding. It may still be starting up."
fi

# -----------------------------------------------------------------------------
# 4. Weaviate (Binary)
# -----------------------------------------------------------------------------
log_info "Setting up Weaviate..."
if check_command weaviate; then
    log_info "Weaviate binary found in path."
else
    # Check if we have it in a local bin folder or if user wants it installed
    # For now, let's download to ./bin/ if not present
    mkdir -p bin
    if [ ! -f "./bin/weaviate" ]; then
        log_info "Downloading Weaviate v$WEAVIATE_VERSION (Darwin All)..."
        
        WEAVIATE_URL="https://github.com/weaviate/weaviate/releases/download/v${WEAVIATE_VERSION}/weaviate-v${WEAVIATE_VERSION}-darwin-all.zip"
        log_info "Downloading from $WEAVIATE_URL" 

        curl -L -f -o weaviate.zip "$WEAVIATE_URL" || { log_error "Download failed"; rm weaviate.zip; exit 1; }
        
        # Unzip
        unzip -o weaviate.zip -d bin
        rm weaviate.zip
        
        # The binary is strictly 'weaviate' inside the zip usually
        chmod +x bin/weaviate
        log_info "Weaviate downloaded to $(pwd)/bin/weaviate"
    else
        log_info "Weaviate binary already exists in ./bin/"
    fi
fi

# Check if Weaviate is running
if pgrep -x "weaviate" >/dev/null; then
    log_info "Weaviate is already running."
else
    log_info "Starting Weaviate in background..."
    # Config parameters for local dev
    export AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED="true"
    export PERSISTENCE_DATA_PATH="./weaviate-data"
    export QUERY_DEFAULTS_LIMIT=20
    export DEFAULT_VECTORIZER_MODULE="none"
    export ENABLE_MODULES=""
    export CLUSTER_HOSTNAME="node1"
    
    # Run in background redirecting logs
    if [ -f "./bin/weaviate" ]; then
        ./bin/weaviate --host 0.0.0.0 --port "$WEAVIATE_PORT" --scheme http > weaviate.log 2>&1 &
        log_info "Weaviate started (PID: $!). Logs in weaviate.log"
    elif check_command weaviate; then
        weaviate --host 0.0.0.0 --port "$WEAVIATE_PORT" --scheme http > weaviate.log 2>&1 &
        log_info "Weaviate started (PID: $!). Logs in weaviate.log"
    else
        log_error "Could not find weaviate binary to start."
    fi
fi

# -----------------------------------------------------------------------------
# 5. Ollama
# -----------------------------------------------------------------------------
log_info "Checking Ollama..."
if check_command ollama; then
    log_info "Ollama is installed."
    # Check if serving
    if curl -s localhost:11434 >/dev/null; then
        log_info "Ollama service is running."
    else
        log_warn "Ollama is installed but not responding on port 11434. Please start it (e.g., run 'Ollama' app)."
    fi
else
    log_warn "Ollama not found. Please install via https://ollama.com/download/mac or 'brew install ollama'."
fi

# -----------------------------------------------------------------------------
# 6. Node.js & Dependencies
# -----------------------------------------------------------------------------
log_info "Setting up Node.js environment..."
if ! check_command npm; then
    log_error "npm not found. Please install Node.js."
    exit 1
fi

log_info "Installing npm dependencies..."
npm install

# -----------------------------------------------------------------------------
# 7. Env Config
# -----------------------------------------------------------------------------
log_info "Configuring .env..."
if [ ! -f .env ]; then
    log_info "Creating .env from defaults..."
    cat > .env <<EOF
# Generated by local.setup.sh
API_PORT=3001
NODE_ENV=development

# Postgres (Assuming Wiki.js existing setup)
PG_USER=wikijs
PG_HOST=localhost
PG_DATABASE=noise
PG_PASSWORD=wikijsrocks
PG_PORT=5432

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# OpenSearch
OPENSEARCH_NODE=http://localhost:9200

# Weaviate
WEAVIATE_HOST=localhost:8080
WEAVIATE_SCHEME=http
EOF
else
    log_info ".env exists. Checking for missing keys (dry run)..."
    # Logic to append missing keys could go here, but avoiding destructive edits for now
fi

# -----------------------------------------------------------------------------
# 8. Final Health Summary (New Windows)
# -----------------------------------------------------------------------------
log_info "----------------------------------------------------------------"
log_info "Setup Complete."
log_info "Opening 'Ollama Serve' in a new terminal window..."
osascript -e 'tell application "Terminal" to do script "ollama serve"'

log_info "Opening 'Service Status' table in a new terminal window..."
# Use absolute path or ensure cwd is correct for the new window
DIR="$(pwd)"
osascript -e "tell application \"Terminal\" to do script \"cd \\\"$DIR\\\" && ./check_status.sh\""

log_info "----------------------------------------------------------------"
log_info "To start the app: npm run dev"
