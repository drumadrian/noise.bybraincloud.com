import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const MAX_CHARS = 1000;

// Simple, stable localStorage keys
const LS = {
    query: "noise.query",
    semantic: "noise.results.semantic", // JSON array of strings
    vector: "noise.results.vector",
    graph: "noise.results.graph",
};

function safeParseArray(json) {
    try {
        const v = JSON.parse(json);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function CollapsibleResult({ title, collapsedByDefault = true, value }) {
    const [open, setOpen] = useState(!collapsedByDefault);

    return (
        <div className="card">
            <button className="collapseHeader" onClick={() => setOpen((s) => !s)}>
                <span className="collapseTitle">{title}</span>
                <span className="collapseState">{open ? "(expanded)" : "(collapsed)"}</span>
            </button>

            {open ? (
                <textarea className="resultTextarea" readOnly value={value} />
            ) : null}
        </div>
    );
}

export default function Home() {
    const [query, setQuery] = useState(() => localStorage.getItem(LS.query) || "");

    // Preload whatever the browser already has stored
    const semanticArr = useMemo(
        () => safeParseArray(localStorage.getItem(LS.semantic) || "[]"),
        []
    );
    const vectorArr = useMemo(
        () => safeParseArray(localStorage.getItem(LS.vector) || "[]"),
        []
    );
    const graphArr = useMemo(
        () => safeParseArray(localStorage.getItem(LS.graph) || "[]"),
        []
    );

    const semanticText = semanticArr.join("\n\n---\n\n");
    const vectorText = vectorArr.join("\n\n---\n\n");
    const graphText = graphArr.join("\n\n---\n\n");

    useEffect(() => {
        localStorage.setItem(LS.query, query);
    }, [query]);

    const charCount = query.length;
    const charLabel = `${charCount} of ${MAX_CHARS}`;

    function onChange(e) {
        const next = e.target.value.slice(0, MAX_CHARS);
        setQuery(next);
    }

    async function onSearch() {
        if (!query.trim()) return;
        localStorage.setItem(LS.query, query);

        try {
            // Parallel fetch for speed
            const [semRes, vecRes, graphRes] = await Promise.all([
                fetch(`/api/search/semantic?q=${encodeURIComponent(query)}`).then(r => r.json()),
                fetch(`/api/search/vector?q=${encodeURIComponent(query)}`).then(r => r.json()),
                fetch(`/api/search/graph?q=${encodeURIComponent(query)}`).then(r => r.json())
            ]);

            // Store in localStorage
            localStorage.setItem(LS.semantic, JSON.stringify(semRes));
            localStorage.setItem(LS.vector, JSON.stringify(vecRes));
            localStorage.setItem(LS.graph, JSON.stringify(graphRes));

            // Force a reload or update state to reflect results immediately (simple reload for now as per "simple" requirements)
            window.location.reload();

        } catch (error) {
            console.error("Search failed:", error);
            alert("Search failed. Ensure the backend server is running.");
        }
    }

    return (
        <main className="container">
            <header className="hero">
                <h1 className="title">noise.bybraincloud.com</h1>
                <h2 className="subtitle">investigating graph retrieval for low-noise RAG</h2>
                <p className="description">
                    investigates Graph Retrieval-Augmented Generation for Large Language Models
                </p>
            </header>

            {/* TOP SECTION */}
            <section className="section">
                <div className="sectionHeader">
                    <div className="sectionTitle">Foundations</div>
                </div>

                <div className="divider" />

                <div className="twoCol">
                    {/* Left column: three rows */}
                    <div className="stack">
                        <div className="definitionRow">
                            <div className="term">Semantic</div>
                            <div className="def">
                                Meaning-based matching that retrieves relevant text even when exact keywords differ.
                            </div>
                        </div>

                        <div className="definitionRow">
                            <div className="term">Vector</div>
                            <div className="def">
                                Embedding-based similarity search that ranks items by distance in a high-dimensional space.
                            </div>
                        </div>

                        <div className="definitionRow">
                            <div className="term">Graph</div>
                            <div className="def">
                                Entity-and-relationship retrieval that follows explicit edges to form a traceable reasoning path.
                                <div className="note">
                                    Note: this graph was generated using a Large Language Model (LLM).
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right column: intentionally minimal/blank area for your future visuals */}
                    <div className="card blueprintStub" aria-label="Reserved space for diagrams or system overview">
                        <div className="blueprintTitle">
                            <Link to="/diagram" className="link" style={{ color: 'inherit' }}>Cloud Diagram</Link>
                        </div>
                        <div className="blueprintContent">
                            <Link to="/diagram" title="View Full Diagram">
                                <img
                                    src="/awsdiagram.png"
                                    alt="System Architecture Diagram"
                                    className="blueprintImg"
                                />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            {/* MIDDLE SECTION */}
            <section className="section">
                <div className="dividerStrong" />

                <div className="sectionHeader">
                    <div className="sectionTitle">Find knowledge</div>
                </div>

                <div className="findWrap">
                    <textarea
                        className="queryBox"
                        value={query}
                        onChange={onChange}
                        placeholder="user's text input (or) text input from user"
                        rows={6}
                    />

                    <div className="findFooter">
                        <button className="primaryBtn" onClick={onSearch}>
                            search
                        </button>

                        <div className="charMeta">
                            <div className="charCount">{charLabel}</div>
                            <div className="charHint">up to 1000 characters</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* BOTTOM SECTION */}
            <section className="section">
                <div className="dividerStrong" />

                <div className="sectionHeader">
                    <div className="sectionTitle">
                        Results <span className="muted">(collapsed)</span>
                    </div>
                </div>

                <div className="resultsGrid">
                    <CollapsibleResult title="Semantic" collapsedByDefault={true} value={semanticText} />
                    <CollapsibleResult title="Vector" collapsedByDefault={true} value={vectorText} />
                    <CollapsibleResult title="Graph" collapsedByDefault={true} value={graphText} />
                </div>
            </section>
        </main>
    );
}
