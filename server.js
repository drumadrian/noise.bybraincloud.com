require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const { Client } = require('@opensearch-project/opensearch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connections (Mock/Placeholder for now, configured via env vars)
// Postgres
const pgPool = new Pool({
    user: process.env.PG_USER || 'wikijs',
    host: process.env.PG_HOST || 'localhost',
    database: process.env.PG_DATABASE || 'noise',
    password: process.env.PG_PASSWORD || 'wikijsrocks',
    port: process.env.PG_PORT || 5432,
});

// Neo4j
const neo4jDriver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password' // Change this!
    )
);

// OpenSearch
const osClient = new Client({
    node: process.env.OPENSEARCH_NODE || 'http://localhost:9200',
    ssl: {
        rejectUnauthorized: false
    }
});


// --- Search Endpoints ---

// 1. Semantic Search (OpenSearch or PGVector)
app.get('/api/search/semantic', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    console.log(`[Semantic] Searching for: ${query}`);

    try {
        // Placeholder: Replace with actual OpenSearch query
        // const result = await osClient.search({...});

        // Mock Response
        const mockResults = [
            `Semantic Result 1 for "${query}": Advanced Retrieval Augmented Generation (RAG) reduces hallucination.`,
            `Semantic Result 2 for "${query}": Vector databases store embeddings for similarity search.`,
            `Semantic Result 3 for "${query}": Noise in RAG systems can lead to irrelevant context being passed to the LLM.`
        ];

        res.json(mockResults);
    } catch (error) {
        console.error("Semantic search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. Vector Search (Weaviate or OpenSearch k-NN)
app.get('/api/search/vector', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    console.log(`[Vector] Searching for: ${query}`);

    try {
        // Placeholder for Vector DB query
        const mockResults = [
            `Vector Result A: High dimensional distance: 0.12`,
            `Vector Result B: High dimensional distance: 0.15`,
            `Vector Result C: High dimensional distance: 0.22`
        ];
        res.json(mockResults);
    } catch (error) {
        console.error("Vector search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 3. Graph Search (Neo4j)
app.get('/api/search/graph', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query parameter 'q'" });

    console.log(`[Graph] Searching for: ${query}`);

    try {
        // Placeholder for Neo4j Cypher query
        const mockResults = [
            `Graph Path: (Query)-[:RELATED_TO]->(Concept A)-[:IMPLIES]->(Result)`,
            `Graph Path: (Query)-[:SYNONYM_OF]->(Term B)-[:USED_IN]->(Context C)`
        ];
        res.json(mockResults);
    } catch (error) {
        console.error("Graph search error:", error);
        res.status(500).json({ error: "Internal Server Error" });
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
