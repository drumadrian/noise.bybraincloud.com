# Local Environment Setup Walkthrough

This guide provides detailed instructions for setting up the `noise.bybraincloud.com` development environment locally on macOS. The process is automated using native tools (Homebrew and binaries) to ensure a hassle-free experience without Docker.

## 🚀 Quick Start

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/drumadrian/noise.bybraincloud.com.git
    cd noise.bybraincloud.com
    ```

2.  **Run the Setup Script**:
    ```bash
    ./local.setup.sh
    ```

## 🛠️ What the Setup Script Does

The `local.setup.sh` script automates the entire provisioning process:

1.  **Prerequisites Check**: Verifies valid architecture (Apple Silicon/Intel) and `brew` installation.
2.  **Native Service Installation**:
    *   **OpenSearch** & **Dashboards**: Installed via Homebrew.
    *   **Neo4j**: Installed via Homebrew (`neo4j`).
    *   **Weaviate**: Downloads the specific v1.23.0 binary for your architecture to `./bin/weaviate` and runs it in the background.
    *   **Node.js**: Installs dependencies via `npm install`.
3.  **Configuration**: Generates a `.env` file pre-filled with local connection strings.
4.  **Auto-Launch**:
    *   Opens a **new terminal window** running `ollama serve`.
    *   Opens a **new terminal window** displaying the **Service Status Table**.

## 📊 Verifying Your Environment

### 1. The Service Status Table
At the end of the setup, a window will pop up showing the status of all services:

![Service Status Table](https://raw.githubusercontent.com/drumadrian/noise.bybraincloud.com/main/docs/images/service-status.png)
*(Note: Screenshot above is illustrative. Your local window will show live status)*

You can bring this table up at any time by running:
```bash
./check_status.sh
```

### 2. Service Endpoints
You can manually verify services are running:

| Service | Port | Endpoint | Notes |
| :--- | :--- | :--- | :--- |
| **OpenSearch** | 9200 | `http://localhost:9200` | Core search engine |
| **Dashboards** | 5601 | `http://localhost:5601` | Visualization UI |
| **Neo4j** | 7474 | `http://localhost:7474` | User: `neo4j` / Pass: `password` |
| **Weaviate** | 8080 | `http://localhost:8080/v1/meta` | Vector database |
| **Ollama** | 11434 | `http://localhost:11434` | AI Models (must run `ollama serve`) |

### 3. Ollama
The script automatically launches `ollama serve` in a dedicated window.

If you need to start it manually:
*   **Terminal**: Run `ollama serve`
*   **GUI**: Press `Cmd+Space`, type `Ollama`, and hit Enter.

## 🏃‍♂️ Running the Application

Once setup is complete, start the development server:

```bash
npm run dev
```

This will launch the Node.js backend (`port 3001`) and the React frontend (`port 3000`).

## ❓ Troubleshooting

### OpenSearch Dashboards not loading?
Dashboards can take a minute to initialize. If it fails or shows "Red" in the status table:
```bash
brew services restart opensearch-dashboards
```

### Weaviate not running?
Weaviate runs as a background process from the `./bin` folder. If it stops, check for existing processes:
```bash
pgrep -lf weaviate
```
Or kill and restart the setup script.

### "Address already in use"?
If you have Docker containers or other services running on ports 9200/5601/7474/8080, please stop them before running `local.setup.sh`.
