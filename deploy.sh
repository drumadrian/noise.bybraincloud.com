#!/bin/bash

# deploy.sh
# Deploys the noise.bybraincloud.com application stack on Amazon Linux

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

update_os() {
    log_status "Updating Operating System"
    sudo yum update -y
}

install_node() {
    log_status "Installing Node.js"
    if ! command -v node &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    else
        echo "Node.js is already installed."
    fi
}

fetch_code() {
    log_status "Fetching Code from GitHub"
    if [ -d "$SERVER_DIR" ]; then
        echo "Directory $SERVER_DIR exists. Pulling latest changes..."
        cd "$SERVER_DIR"
        git pull
    else
        echo "Cloning repository..."
        cd /home/ec2-user
        git clone "$REPO_URL"
    fi
}

install_postgres() {
    log_status "Installing Postgres"
    sudo yum install -y postgresql-server
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
}


setup_db() {
    log_status "Setting up Database"
    cd "$SERVER_DIR"
    chmod +x create-database-noise.sh
    ./create-database-noise.sh
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
    sudo yum install -y httpd
    sudo systemctl enable httpd
    
    # Configure httpd to serve the React app build
    # Assuming the build output is in 'build' or 'dist'
    BUILD_DIR="$SERVER_DIR/build" # React default, change to dist if using Vite
    
    # Create a config to point to the build directory and handle React routing
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
    
    # Comment out default welcome page if exists
    if [ -f /etc/httpd/conf.d/welcome.conf ]; then
        sudo mv /etc/httpd/conf.d/welcome.conf /etc/httpd/conf.d/welcome.conf.disabled
    fi
}

install_opensearch() {
    log_status "Installing OpenSearch"
    
    # Add OpenSearch repo
    sudo curl -SL https://artifacts.opensearch.org/releases/bundle/opensearch/2.x/opensearch-2.x.repo -o /etc/yum.repos.d/opensearch-2.x.repo
    
    sudo yum install -y opensearch
    
    # Enable and start
    sudo systemctl daemon-reload
    sudo systemctl enable opensearch
    sudo systemctl start opensearch
}

install_opensearch_dashboards() {
    log_status "Installing OpenSearch Dashboards"
    
    sudo yum install -y opensearch-dashboards
    
    # Configure to run on 0.0.0.0 and port 5601
    sudo sed -i 's/#server.port: 5601/server.port: 5601/' /etc/opensearch-dashboards/opensearch_dashboards.yml
    sudo sed -i 's/#server.host: "localhost"/server.host: "0.0.0.0"/' /etc/opensearch-dashboards/opensearch_dashboards.yml
    
    sudo systemctl enable opensearch-dashboards
    sudo systemctl start opensearch-dashboards
}

check_nvidia_smi() {
    log_status "Checking nvidia-smi"
    nvidia-smi
}

install_ollama() {
    log_status "Installing Ollama"
    curl -fsSL https://ollama.com/install.sh | sh
    
    # The install script usually sets up a service, but ensure it's enabled
    # Sometimes it sets up a user service, for system wide we might need to adjust
    # But usually 'ollama serve' is the command.
    # The install script creates a systemd service 'ollama'
    
    sudo systemctl enable ollama
    sudo systemctl start ollama
}

install_neo4j() {
    log_status "Installing Neo4j"
    
    # Import GPG key
    sudo rpm --import https://debian.neo4j.com/neotechnology.gpg.key
    
    # Add repo
    sudo tee /etc/yum.repos.d/neo4j.repo > /dev/null <<EOF
[neo4j]
name=Neo4j RPM Repository
baseurl=https://yum.neo4j.com/stable/5
enabled=1
gpgcheck=1
EOF

    # Neo4j requires Java 17
    sudo yum install -y java-17-amazon-corretto-devel
    
    sudo yum install -y neo4j
    sudo systemctl enable neo4j
    sudo systemctl start neo4j
}

install_weaviate() {
    log_status "Installing Weaviate"
    
    # Installing via binary to run as a service without docker (as per request style, though docker is preferred usually)
    # Finding a binary release for linux amd64
    WEAVIATE_VERSION="1.23.0" # Example version
    wget -q https://github.com/weaviate/weaviate/releases/download/v${WEAVIATE_VERSION}/weaviate-v${WEAVIATE_VERSION}-linux-amd64.tar.gz
    tar -xzf weaviate-v${WEAVIATE_VERSION}-linux-amd64.tar.gz
    sudo mv weaviate /usr/local/bin/
    rm weaviate-v${WEAVIATE_VERSION}-linux-amd64.tar.gz
    
    # Create systemd service
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

    sudo systemctl daemon-reload
    sudo systemctl enable weaviate
    sudo systemctl start weaviate
}

install_cloudwatch_agent() {
    log_status "Installing CloudWatch Agent"
    sudo yum install -y amazon-cloudwatch-agent
    
    # Configure logs
    # Creating a JSON config for the agent to collect httpd access logs
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
    
    sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
}

start_httpd() {
    log_status "Starting httpd"
    sudo systemctl restart httpd
}


# Main Execution Flow
update_os
install_node
fetch_code
install_postgres
setup_db
install_dependencies
build_app
install_httpd
install_opensearch
install_opensearch_dashboards
check_nvidia_smi
install_ollama
install_neo4j
install_weaviate
install_cloudwatch_agent
start_httpd

log_status "Deployment Complete!"