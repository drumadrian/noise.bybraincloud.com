import { useEffect, useMemo, useState } from "react";

const LS = {
    semantic: "noise.results.semantic", // JSON array of strings
    noiseLabels: "noise.labels.noise",  // JSON object: { "<resultIndex>": [<tokenIndex>, ...] }
};

function safeParseArray(json) {
    try {
        const v = JSON.parse(json);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function safeParseObject(json) {
    try {
        const v = JSON.parse(json);
        return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
        return {};
    }
}

// Tokenize into selectable chunks; simple whitespace split preserves order.
function tokenize(text) {
    // Keep whitespace tokens so we don’t lose spacing in rendering.
    const parts = text.split(/(\s+)/);
    return parts.filter((p) => p.length > 0);
}

export default function Remove() {
    const semanticResults = useMemo(
        () => safeParseArray(localStorage.getItem(LS.semantic) || "[]"),
        []
    );

    const [labels, setLabels] = useState(() =>
        safeParseObject(localStorage.getItem(LS.noiseLabels) || "{}")
    );

    const [noisePercent, setNoisePercent] = useState(null);

    useEffect(() => {
        localStorage.setItem(LS.noiseLabels, JSON.stringify(labels));
    }, [labels]);

    const totalSemantic = semanticResults.length;

    const labelledNoiseCount = useMemo(() => {
        // Count how many *results* have at least one token labeled as noise.
        // (If you want token-level ratio later, we can change this.)
        let count = 0;
        for (let i = 0; i < totalSemantic; i++) {
            const tokenIndexes = labels[String(i)] || [];
            if (Array.isArray(tokenIndexes) && tokenIndexes.length > 0) count += 1;
        }
        return count;
    }, [labels, totalSemantic]);

    function toggleNoiseToken(resultIndex, tokenIndex) {
        setLabels((prev) => {
            const key = String(resultIndex);
            const existing = Array.isArray(prev[key]) ? prev[key] : [];
            const set = new Set(existing);

            if (set.has(tokenIndex)) set.delete(tokenIndex);
            else set.add(tokenIndex);

            return { ...prev, [key]: Array.from(set).sort((a, b) => a - b) };
        });
    }

    function calculateSignalToNoise() {
        // Semantic Noise Ratio: (Number of Labelled Noise Results / Number of Semantic Search Results) * 100
        const ratio = totalSemantic === 0 ? 0 : (labelledNoiseCount / totalSemantic) * 100;
        setNoisePercent(ratio);
    }

    function deleteData() {
        localStorage.removeItem(LS.semantic);
        localStorage.removeItem(LS.noiseLabels);
        setLabels({});
        setNoisePercent(null);
        // hard refresh is optional; keeping it simple:
        window.location.reload();
    }

    return (
        <main className="container">
            <header className="hero">
                <h1 className="title">remove noise</h1>
                <p className="description">
                    Label semantic highlights as noise, then compute a semantic noise ratio.
                </p>
            </header>

            <section className="section">
                <div className="sectionHeader">
                    <div className="sectionTitle">Semantic search results</div>
                    <div className="muted">
                        {totalSemantic} result{totalSemantic === 1 ? "" : "s"}
                    </div>
                </div>

                <div className="divider" />

                {totalSemantic === 0 ? (
                    <div className="card">
                        <div className="muted">
                            No semantic results found in browser storage yet. Run a search, store results, then return here.
                        </div>
                    </div>
                ) : (
                    <div className="stack">
                        {semanticResults.map((text, rIdx) => {
                            const tokens = tokenize(String(text || ""));
                            const labelledSet = new Set(labels[String(rIdx)] || []);

                            return (
                                <div className="card" key={rIdx}>
                                    <div className="resultMeta">
                                        <div className="resultTitle">Record {rIdx + 1}</div>
                                        <div className="muted">
                                            {labelledSet.size} labelled token{labelledSet.size === 1 ? "" : "s"}
                                        </div>
                                    </div>

                                    <div className="tokenWrap" role="list" aria-label={`Semantic record ${rIdx + 1}`}>
                                        {tokens.map((tok, tIdx) => {
                                            const isSpace = /^\s+$/.test(tok);
                                            if (isSpace) return <span key={tIdx}>{tok}</span>;

                                            const isNoise = labelledSet.has(tIdx);
                                            const cls = isNoise ? "token noise" : "token";

                                            return (
                                                <span
                                                    key={tIdx}
                                                    className={cls}
                                                    role="listitem"
                                                    title={isNoise ? "Noise (click to unlabel)" : "Click to label as noise"}
                                                    onClick={() => toggleNoiseToken(rIdx, tIdx)}
                                                >
                                                    {tok}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="actionsRow">
                    <button className="primaryBtn" onClick={calculateSignalToNoise}>
                        calculate signal to noise
                    </button>

                    <div className="card statCard" aria-label="Semantic noise ratio">
                        <div className="statLabel">Semantic Noise Ratio</div>
                        <div className="statValue">
                            {noisePercent === null ? "—" : `${noisePercent.toFixed(2)}%`}
                        </div>
                        <div className="statHint">
                            (Number of Labelled Noise Results / Number of Semantic Search Results) * 100
                        </div>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="dividerStrong" />

                <div className="sectionHeader">
                    <div className="sectionTitle">Links</div>
                </div>

                <div className="linkRow">
                    <a className="link" href="https://github.com/" target="_blank" rel="noreferrer">
                        GitHub repository
                    </a>

                    <a className="link" href="https://youtu.be/faSx8Qbn7VA" target="_blank" rel="noreferrer">
                        YouTube video
                    </a>
                </div>

                <div className="videoWrap">
                    <iframe
                        className="video"
                        src="https://www.youtube.com/embed/faSx8Qbn7VA"
                        title="noise.bybraincloud.com video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                    />
                </div>

                <div className="dividerStrong" />

                <div className="attribution">
                    <div className="muted">
                        Attribution and inspiration from:
                        {" "}
                        <a
                            className="link"
                            href="https://ieeexplore.ieee.org/abstract/document/10771030"
                            target="_blank"
                            rel="noreferrer"
                        >
                            IEEE paper (10771030)
                        </a>
                    </div>

                    <div className="thanks">
                        <div><strong>Special</strong> <em>Thank you</em> to</div>
                        <div className="person">
                            <code>Dr. Tyler Thomas Procko</code>
                            <div className="muted">
                                Department of Electrical Engineering and Computer Science, Embry-Riddle Aeronautical University,
                                Daytona Beach, United States of America
                            </div>
                        </div>

                        <div className="person">
                            <code>Dr. Omar Ochoa</code>
                            <div className="muted">
                                Department of Electrical Engineering and Computer Science, Embry-Riddle Aeronautical University,
                                Daytona Beach, United States of America
                            </div>
                        </div>

                        <div className="eagleRow">
                            <img src="/eagle.png" alt="Embry-Riddle Eagles logo" className="eagleImg" />
                            <a className="link" href="https://eraueagles.com/" target="_blank" rel="noreferrer">
                                go eagles
                            </a>
                        </div>
                    </div>
                </div>

                <div className="dividerStrong" />

                <div className="dashLinks">
                    <a className="link" href="https://noise.bybraincloud.com:5601" target="_blank" rel="noreferrer">
                        Opensearch Dashboard
                    </a>

                    <button
                        className="linkBtn"
                        type="button"
                        onClick={() => alert("Neo4j Dashboard URL not set yet.")}
                    >
                        Neo4j Dashboard
                    </button>

                    <button
                        className="linkBtn"
                        type="button"
                        onClick={() => alert("Weaviate Dashboard URL not set yet.")}
                    >
                        Weaviate Dashboard
                    </button>
                </div>

                <div className="actionsBottom">
                    <button className="dangerBtn" onClick={deleteData}>
                        delete data
                    </button>
                    <div className="muted small">
                        Clears stored results and labels from this browser for privacy.
                    </div>
                </div>
            </section>
        </main>
    );
}
