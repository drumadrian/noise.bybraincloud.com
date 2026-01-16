import { useEffect, useMemo, useState } from "react";

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

    function onSearch() {
        // This button is wired for your future fetch/search call.
        // For now, it simply persists query; results are expected to be stored in localStorage by your search logic.
        localStorage.setItem(LS.query, query);
        // Optional: window.alert("Search hooked up later. Query saved locally.");
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
                        <div className="blueprintTitle">System view</div>
                        <div className="blueprintHint">
                            Reserved for your diagram or retrieval pipeline visualization.
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
