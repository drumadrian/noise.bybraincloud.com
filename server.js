require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const { Client } = require('@opensearch-project/opensearch');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.API_PORT || 3001;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// Middleware
app.use(cors());
app.use(express.json());

// --- Ollama Proxy Endpoints (for LAN/mobile-safe access) ---

// GET /api/ollama/tags -> http://localhost:11434/api/tags
app.get('/api/ollama/tags', async (req, res) => {
    try {
        const controller = new AbortController();
        req.on('close', () => controller.abort());

        const upstream = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: controller.signal });

        const text = await upstream.text();

        if (!upstream.ok) {
            return res.status(upstream.status).send(text);
        }

        // Ollama returns JSON
        res.setHeader('Content-Type', 'application/json');
        return res.send(text);
    } catch (err) {
        console.error('Ollama /tags proxy error:', err);
        return res.status(502).json({ error: 'Failed to reach Ollama. Is it running?' });
    }
});

// POST /api/ollama/chat -> http://localhost:11434/api/chat (streaming passthrough)
app.post('/api/ollama/chat', async (req, res) => {
    try {

        const controller = new AbortController();
        req.on('close', () => controller.abort());

        const upstream = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body || {}),
            signal: controller.signal,

        });

        // Pass through status
        res.status(upstream.status);

        // Pass through content-type (Ollama streaming is usually NDJSON)
        const ct = upstream.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        // If Ollama returned an error body, forward it
        if (!upstream.ok) {
            const errText = await upstream.text();
            return res.send(errText);
        }

        // No body means nothing to stream
        if (!upstream.body) {
            return res.end();
        }

        // Streaming passthrough (ReadableStream -> Node stream)
        const nodeStream = Readable.fromWeb(upstream.body);
        nodeStream.on('error', (e) => {
            console.error('Ollama stream error:', e);
            try { res.end(); } catch { }
        });

        // If client disconnects, stop reading
        req.on('close', () => { try { nodeStream.destroy(); } catch { } });

        return nodeStream.pipe(res);
    } catch (err) {
        console.error('Ollama /chat proxy error:', err);
        return res.status(502).json({ error: 'Failed to reach Ollama. Is it running?' });
    }
});


// Serve React Static Files (Production)
// If we want Node to serve the app instead of Apache
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'build')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'build', 'index.html'));
    });
}

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        pgPool.end();
        neo4jDriver.close();
    });
});
