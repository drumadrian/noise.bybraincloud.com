#!/bin/bash
set -euo pipefail

# deploy.sh
# Deploys the noise.bybraincloud.com application stack on Amazon Linux 2023

SERVER_DIR="/home/ec2-user/noise.bybraincloud.com"
REPO_URL="https://github.com/drumadrian/noise.bybraincloud.com.git"
LOG_GROUP_NAME="noise.bybraincloud.com-access-logs"
ACCESS_LOG_FILE="/var/log/httpd/access.log"

# function to log status
log_status() {
    echo "----------------------------------------------------------------"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
    echo "----------------------------------------------------------------"
}

# Helper for optional steps (safe with set -e)
try_step() {
    local desc="$1"; shift
    log_status "OPTIONAL: $desc"
    set +e
    "$@"
    local rc=$?
    set -e
    if [ $rc -ne 0 ]; then
        echo "WARN: optional step failed ($rc): $desc"
    fi
    return 0
}

update_os() {
    log_status "Updating Operating System"
    sudo dnf update -y
}

install_node() {
    log_status "Installing Node.js"
    if ! command -v node &> /dev/null; then
        # Using NodeSource for Node 20.x
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo dnf install -y nodejs
    else
        echo "Node.js is already installed."
    fi
}

fetch_code() {
    log_status "Fetching Code from GitHub"
    if [ -d "$SERVER_DIR/.git" ]; then
        echo "Repo exists at $SERVER_DIR. Pulling latest changes..."
        cd "$SERVER_DIR"
        git pull
    else
        echo "Cloning repository..."
        cd /home/ec2-user
        rm -rf "$SERVER_DIR" || true
        git clone "$REPO_URL"
    fi
}

install_dependencies() {
    log_status "Installing Node Dependencies"
    cd "$SERVER_DIR"
    npm install
}

build_app() {
    log_status "Building React App"
    cd "$SERVER_DIR"
    npm run build
}

install_httpd() {
    log_status "Installing and Configuring httpd"
    sudo dnf install -y httpd
    sudo systemctl enable httpd

    # Check for rewrite module (usually built-in on AL2023)
    if ! sudo httpd -M 2>/dev/null | grep -q rewrite; then
        echo "WARN: mod_rewrite does not appear to be loaded. React Router rewrites may not work."
    fi

    # Configure httpd to serve the React app build
    BUILD_DIR="$SERVER_DIR/build"

    sudo tee /etc/httpd/conf.d/noise.conf > /dev/null <<EOF
<VirtualHost *:80>
    ServerAdmin webmaster@noise.bybraincloud.com
    DocumentRoot $BUILD_DIR

    <Directory "$BUILD_DIR">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
        RewriteEngine on
        # Don't rewrite files or directories
        RewriteCond %{REQUEST_FILENAME} -f [OR]
        RewriteCond %{REQUEST_FILENAME} -d
        RewriteRule ^ - [L]
        # Rewrite everything else to index.html for React Router
        RewriteRule ^ index.html [L]
    </Directory>

    ErrorLog /var/log/httpd/error.log
    CustomLog $ACCESS_LOG_FILE combined
</VirtualHost>
EOF

    # Disable welcome page
    if [ -f /etc/httpd/conf.d/welcome.conf ]; then
        sudo mv /etc/httpd/conf.d/welcome.conf /etc/httpd/conf.d/welcome.conf.disabled
    fi
}

fix_permissions_for_apache() {
    log_status "Fixing Permissions for Apache"
    # Apache 403 fix: enable traversal of /home/ec2-user
    sudo chmod 711 /home/ec2-user
    sudo chmod -R a+rX "$SERVER_DIR/build" || true
}

restart_httpd() {
    log_status "Restarting httpd"
    sudo systemctl restart httpd

    # Verification
    if curl -I http://localhost | head -n 1 | grep -q "200"; then
        echo "Httpd is serving 200 OK locally."
    else
        echo "WARN: Httpd local check failed."
    fi
}

install_postgres() {
    log_status "Installing Postgres"

    # AL2023 package names
    sudo dnf install -y postgresql15-server || sudo dnf install -y postgresql-server

    # Init DB only if not already initialized (different paths depending on version)
    if [ -f /var/lib/pgsql/data/PG_VERSION ] || [ -f /var/lib/pgsql/15/data/PG_VERSION ]; then
        echo "Postgres database already initialized."
    else
        echo "Initializing Postgres database..."
        sudo postgresql-setup --initdb || sudo /usr/bin/postgresql-setup --initdb || true
    fi

    sudo systemctl enable postgresql || true
    sudo systemctl start postgresql || true
}

setup_db() {
    log_status "Setting up Database"

    if systemctl is-active --quiet postgresql; then
        if id "postgres" &>/dev/null; then
            cd "$SERVER_DIR"
            chmod +x create-database-noise.sh
            ./create-database-noise.sh
        else
            echo "WARN: postgres user not found, skipping setup_db script."
        fi
    else
        echo "WARN: postgresql service is not active, skipping setup_db script."
    fi
}

install_opensearch() {
    log_status "Installing OpenSearch"

    # Add OpenSearch repo
    sudo curl -SL https://artifacts.opensearch.org/releases/bundle/opensearch/2.x/opensearch-2.x.repo \
        -o /etc/yum.repos.d/opensearch-2.x.repo

    # Install (best effort)
    if ! sudo dnf install -y opensearch; then
        echo "WARN: OpenSearch install failed. Skipping."
        return 0
    fi

    sudo systemctl daemon-reload || true
    sudo systemctl enable opensearch || true

    if sudo systemctl restart opensearch; then
        echo "OpenSearch started successfully."
    else
        echo "WARN: OpenSearch failed to start. Checking logs..."
        sudo systemctl status opensearch --no-pager || true
        sudo journalctl -xeu opensearch --no-pager | tail -n 60 || true
        if [ -f /var/log/opensearch/install_demo_configuration.log ]; then
            echo "---- /var/log/opensearch/install_demo_configuration.log (tail) ----"
            tail -n 80 /var/log/opensearch/install_demo_configuration.log || true
        fi
        # Do not fail deploy
        return 0
    fi

    if ! systemctl is-active --quiet opensearch; then
        echo "WARN: OpenSearch service is not active."
    fi
}

install_opensearch_dashboards() {
    log_status "Installing OpenSearch Dashboards"

    # Optional: may not exist in your configured repos
    if sudo dnf install -y opensearch-dashboards; then
        sudo sed -i 's/#server.port: 5601/server.port: 5601/' /etc/opensearch-dashboards/opensearch_dashboards.yml || true
        sudo sed -i 's/#server.host: "localhost"/server.host: "0.0.0.0"/' /etc/opensearch-dashboards/opensearch_dashboards.yml || true

        sudo systemctl enable opensearch-dashboards || true
        sudo systemctl start opensearch-dashboards || echo "WARN: OpenSearch Dashboards start failed"
    else
        echo "WARN: OpenSearch Dashboards package not found or failed to install. Skipping."
    fi
}

check_nvidia_smi() {
    log_status "Checking nvidia-smi"
    if command -v nvidia-smi &> /dev/null; then
        nvidia-smi || true
    else
        echo "nvidia-smi not found (skipping)"
    fi
}

install_ollama() {
    log_status "Installing Ollama"
    curl -fsSL https://ollama.com/install.sh | sh
    sudo systemctl enable ollama || true
    sudo systemctl start ollama || true
}

install_neo4j() {
    log_status "Installing Neo4j"
    sudo rpm --import https://debian.neo4j.com/neotechnology.gpg.key || true

    sudo tee /etc/yum.repos.d/neo4j.repo > /dev/null <<EOF
[neo4j]
name=Neo4j RPM Repository
baseurl=https://yum.neo4j.com/stable/5
enabled=1
gpgcheck=1
EOF

    sudo dnf install -y java-17-amazon-corretto-devel
    sudo dnf install -y neo4j
    sudo systemctl enable neo4j || true
    sudo systemctl start neo4j || true
}

install_weaviate() {
    log_status "Installing Weaviate"

    WEAVIATE_VERSION="1.23.0"

    # Optional/best effort download & install
    wget -q "https://github.com/weaviate/weaviate/releases/download/v${WEAVIATE_VERSION}/weaviate-v${WEAVIATE_VERSION}-linux-amd64.tar.gz" \
        || { echo "WARN: Weaviate download failed. Skipping."; return 0; }

    tar -xzf "weaviate-v${WEAVIATE_VERSION}-linux-amd64.tar.gz" \
        || { echo "WARN: Weaviate extract failed. Skipping."; return 0; }

    sudo mv weaviate /usr/local/bin/ || { echo "WARN: Weaviate binary move failed. Skipping."; return 0; }
    rm -f "weaviate-v${WEAVIATE_VERSION}-linux-amd64.tar.gz" || true

    sudo tee /etc/systemd/system/weaviate.service > /dev/null <<EOF
[Unit]
Description=Weaviate Vector Database
After=network.target

[Service]
ExecStart=/usr/local/bin/weaviate --host 0.0.0.0 --port 8080 --scheme http
Restart=on-failure
User=ec2-user
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload || true
    sudo systemctl enable weaviate || true
    sudo systemctl start weaviate || true
}

install_cloudwatch_agent() {
    log_status "Installing CloudWatch Agent"
    sudo dnf install -y amazon-cloudwatch-agent || true

    sudo tee /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json > /dev/null <<EOF
{
  "agent": {
    "run_as_user": "root"
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "$ACCESS_LOG_FILE",
            "log_group_name": "$LOG_GROUP_NAME",
            "log_stream_name": "{instance_id}",
            "retention_in_days": -1
          }
        ]
      }
    }
  }
}
EOF

    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
        -a fetch-config -m ec2 -s \
        -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json || true
}

health_summary() {
    log_status "Health Summary"
    echo "HTTPD Status:"
    systemctl is-active httpd || echo "inactive"

    echo "Local Curl Check:"
    curl -I http://localhost | head -n 1 || echo "Check failed"

    echo "OpenSearch Status:"
    systemctl is-active opensearch || echo "inactive"

    echo "Nvidia SMI:"
    nvidia-smi || echo "Not available"

    echo "Listening Ports:"
    ss -lntp | egrep ':80|:5432|:9200|:5601|:7474|:8080' || echo "None found"
}

# Main Execution Flow
update_os
install_node
fetch_code
install_dependencies
build_app
install_httpd
fix_permissions_for_apache
restart_httpd

# Non-fatal database and search
install_postgres || echo "WARN: Postgres install failed"
setup_db || echo "WARN: DB setup failed"
install_opensearch || echo "WARN: OpenSearch install failed"

# Optional components
try_step "Install OpenSearch Dashboards" install_opensearch_dashboards
try_step "Check NVIDIA SMI" check_nvidia_smi
try_step "Install Ollama" install_ollama
try_step "Install Neo4j" install_neo4j
try_step "Install Weaviate" install_weaviate
try_step "Install CloudWatch Agent" install_cloudwatch_agent

health_summary

log_status "Deployment Complete!"