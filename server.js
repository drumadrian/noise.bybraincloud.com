require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Readable } = require("stream");

// Optional deps (kept from your old file; safe even if you don't use them yet)
const { Pool } = require("pg");
const neo4j = require("neo4j-driver");
const { Client } = require("@opensearch-project/opensearch");

const app = express();
const PORT = process.env.API_PORT || 3001;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Middleware
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------------------------------------------------------------
// (Optional) DB client placeholders — same as old server.js
// ---------------------------------------------------------------------
const pgPool = new Pool({
    user: process.env.PG_USER || "wikijs",
    host: process.env.PG_HOST || "localhost",
    database: process.env.PG_DATABASE || "noise",
    password: process.env.PG_PASSWORD || "wikijsrocks",
    port: process.env.PG_PORT || 5432,
});

const neo4jDriver = neo4j.driver(
    process.env.NEO4J_URI || "bolt://localhost:7687",
    neo4j.auth.basic(
        process.env.NEO4J_USER || "neo4j",
        process.env.NEO4J_PASSWORD || "password" // Change this!
    )
);

const osClient = new Client({
    node: process.env.OPENSEARCH_NODE || "http://localhost:9200",
    ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------
// Search Endpoints (RESTORED) — these are what Chat.js + Home.js call
// ---------------------------------------------------------------------

app.get("/api/search/semantic", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    console.log(`[Semantic] Searching for: ${query}`);

    try {
        // Placeholder/mock response (same as your old file)
        const mockResults = [
            `Semantic Result 1 for "${query}": Advanced Retrieval Augmented Generation (RAG) reduces hallucination.`,
            `Semantic Result 2 for "${query}": Vector databases store embeddings for similarity search.`,
            `Semantic Result 3 for "${query}": Noise in RAG systems can lead to irrelevant context being passed to the LLM.`,
        ];
        res.json(mockResults);
    } catch (error) {
        console.error("Semantic search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/search/vector", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    console.log(`[Vector] Searching for: ${query}`);

    try {
        const mockResults = [
            `Vector Result A: High dimensional distance: 0.12`,
            `Vector Result B: High dimensional distance: 0.15`,
            `Vector Result C: High dimensional distance: 0.22`,
        ];
        res.json(mockResults);
    } catch (error) {
        console.error("Vector search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/search/graph", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    console.log(`[Graph] Searching for: ${query}`);

    try {
        const mockResults = [
            `Graph Path: (Query)-[:RELATED_TO]->(Concept A)-[:IMPLIES]->(Result)`,
            `Graph Path: (Query)-[:SYNONYM_OF]->(Term B)-[:USED_IN]->(Context C)`,
        ];
        res.json(mockResults);
    } catch (error) {
        console.error("Graph search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ---------------------------------------------------------------------
// Ollama Proxy Endpoints (FIXED) — LAN/mobile safe
// ---------------------------------------------------------------------

// GET /api/ollama/tags -> ${OLLAMA_BASE_URL}/api/tags
app.get("/api/ollama/tags", async (req, res) => {
    try {
        const upstream = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
        const text = await upstream.text();

        res.status(upstream.status);
        res.setHeader("Content-Type", "application/json");
        return res.send(text);
    } catch (err) {
        console.error("Ollama /tags proxy error:", err);
        return res.status(502).json({ error: "Failed to reach Ollama. Is it running?" });
    }
});

// POST /api/ollama/chat -> ${OLLAMA_BASE_URL}/api/chat (streaming passthrough)
app.post("/api/ollama/chat", async (req, res) => {
    // IMPORTANT:
    // Don't abort upstream on req 'close' — it can fire during normal lifecycle.
    // Only abort if the client truly disconnects: req 'aborted' or res 'close' before end.
    const controller = new AbortController();

    const abortUpstream = () => {
        try { controller.abort(); } catch { }
    };

    req.on("aborted", abortUpstream);
    res.on("close", () => {
        if (!res.writableEnded) abortUpstream();
    });

    try {
        const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body || {}),
            signal: controller.signal,
        });

        // Pass through status + headers
        res.status(upstream.status);

        const ct = upstream.headers.get("content-type");
        if (ct) res.setHeader("Content-Type", ct);

        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // If upstream error, forward text body
        if (!upstream.ok) {
            const errText = await upstream.text();
            return res.send(errText);
        }

        if (!upstream.body) {
            return res.end();
        }

        // Streaming passthrough (WHATWG ReadableStream -> Node stream)
        const nodeStream = Readable.fromWeb(upstream.body);

        nodeStream.on("error", (e) => {
            // If client already gone, this can happen—just end quietly
            console.error("Ollama stream error:", e);
            try { res.end(); } catch { }
        });

        return nodeStream.pipe(res);
    } catch (err) {
        // If we aborted because the client disconnected, don't log as "real error"
        if (err?.name === "AbortError") {
            console.warn("Ollama /chat proxy aborted (client disconnected).");
            try { return res.end(); } catch { }
        }

        console.error("Ollama /chat proxy error:", err);
        return res.status(502).json({ error: "Failed to reach Ollama. Is it running?" });
    }
});

// ---------------------------------------------------------------------
// Production static
// ---------------------------------------------------------------------
if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "build")));
    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "build", "index.html"));
    });
}

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    server.close(() => {
        console.log("HTTP server closed");
        try { pgPool.end(); } catch { }
        try { neo4jDriver.close(); } catch { }
    });
});
