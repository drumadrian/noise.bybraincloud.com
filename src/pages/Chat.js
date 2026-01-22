import { useEffect, useRef, useState } from "react";

// Display-only label so we can see where Ollama lives.
// Actual calls go through /api/ollama/* (server proxy).
const OLLAMA_DISPLAY =
    process.env.REACT_APP_OLLAMA_BASE_URL || "via server proxy";

const LS = {
    chat: "noise.chat.history",
};

function safeParseArray(json) {
    try {
        const v = JSON.parse(json);
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

function nowId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clampText(s, max = 8000) {
    const str = String(s || "");
    if (str.length <= max) return str;
    return str.slice(0, max) + "\n\n[...truncated...]";
}

export default function Chat() {


    // ---- State ----
    const [includeRag, setIncludeRag] = useState(true);
    const [models, setModels] = useState([]);
    const [model, setModel] = useState("");
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const [attachments, setAttachments] = useState([]); // [{name, text}]
    const [messages, setMessages] = useState(() =>
        safeParseArray(localStorage.getItem(LS.chat) || "[]")
    );

    const bottomRef = useRef(null);

    useEffect(() => {
        localStorage.setItem(LS.chat, JSON.stringify(messages));
        // auto-scroll
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ---- Load models from Ollama ----
    async function loadModels() {
        setError("");
        try {
            const res = await fetch(`/api/ollama/tags`);
            if (!res.ok) throw new Error(`Ollama /api/tags failed (${res.status})`);
            const data = await res.json();
            const names = (data?.models || [])
                .map((m) => m?.name)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b));

            setModels(names);
            // Choose a default if none selected
            if (!model && names.length > 0) setModel(names[0]);
        } catch (e) {
            setModels([]);
            setError(
                `Could not load Ollama models (${OLLAMA_DISPLAY}). ` +
                `Make sure Ollama is running and reachable. (${e.message})`
            );
        }
    }

    useEffect(() => {
        loadModels();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- RAG fetch using same 3 endpoints as Home.js ----
    async function getRagContext(query) {
        try {
            const q = encodeURIComponent(query);

            // Match Home.js behavior: three GET endpoints
            const [semRes, vecRes, graphRes] = await Promise.all([
                fetch(`/api/search/semantic?q=${q}`),
                fetch(`/api/search/vector?q=${q}`),
                fetch(`/api/search/graph?q=${q}`),
            ]);

            // If any endpoint fails, we still try to use what we got
            const semantic = semRes.ok ? await semRes.json() : [];
            const vector = vecRes.ok ? await vecRes.json() : [];
            const graph = graphRes.ok ? await graphRes.json() : [];

            const parts = [];
            const sources = [];

            function addBlock(title, arr) {
                const items = Array.isArray(arr) ? arr : [];
                if (items.length === 0) return;

                const block = items
                    .slice(0, 5)
                    .map((x) => `- ${String(x).trim()}`)
                    .join("\n");

                parts.push(`### ${title}\n${block}`);
                sources.push({ title, count: items.length });
            }

            addBlock("Semantic", semantic);
            addBlock("Vector", vector);
            addBlock("Graph", graph);

            const contextText = parts.join("\n\n");
            return { contextText: clampText(contextText, 6000), sources };
        } catch {
            return { contextText: "", sources: [] };
        }
    }


    // ---- File upload ----
    async function onAddFiles(fileList) {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;

        const read = async (f) => {
            // Best effort as text. PDFs will be gibberish unless you add a parser later.
            const text = await f.text();
            return { name: f.name, text: clampText(text, 8000) };
        };

        const items = [];
        for (const f of files) {
            try {
                items.push(await read(f));
            } catch {
                // ignore
            }
        }

        setAttachments((prev) => [...prev, ...items]);
    }

    function clearChat() {
        setMessages([]);
        setAttachments([]);
        setError("");
    }


    // ---- Send to Ollama (streaming) ----
    async function send() {
        setError("");

        const prompt = input.trim();
        if (!prompt) return;

        if (!model) {
            setError("Please select a model first.");
            return;
        }

        setBusy(true);
        setInput("");

        const userMsg = { id: nowId(), role: "user", content: prompt, ts: Date.now() };

        setMessages((prev) => [...prev, userMsg]);

        // Build context if toggle on
        let rag = { contextText: "", sources: [] };
        if (includeRag) {
            rag = await getRagContext(prompt);
        }

        const attachmentBlock =
            attachments.length === 0
                ? ""
                : `\n\nATTACHMENTS:\n${attachments
                    .map((a) => `--- ${a.name} ---\n${a.text}`)
                    .join("\n\n")}`;

        const contextBlock = rag.contextText
            ? `\n\nCONTEXT (from knowledge base):\n${rag.contextText}`
            : "";

        const system =
            "You are a helpful assistant. Use CONTEXT when it is relevant. " +
            "If CONTEXT is irrelevant, ignore it. Keep responses concise unless asked for detail.";

        const history = messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));

        const outgoing = [
            { role: "system", content: system },
            ...history,
            { role: "user", content: prompt + contextBlock + attachmentBlock },
        ];


        const assistantId = nowId();
        setMessages((prev) => [
            ...prev,
            {
                id: assistantId,
                role: "assistant",
                content: "",
                ts: Date.now(),
                meta: includeRag
                    ? { ragEnabled: true, ragSources: rag.sources }
                    : { ragEnabled: false },
            },
        ]);

        try {
            // Prefer streaming
            const res = await fetch(`/api/ollama/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    stream: true,
                    messages: outgoing,
                }),
            });

            if (!res.ok || !res.body) {
                // Fallback: non-stream
                const res2 = await fetch(`/api/ollama/chat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model,
                        stream: false,
                        messages: outgoing,
                    }),
                });
                if (!res2.ok) throw new Error(`Ollama chat failed (${res2.status})`);
                const data2 = await res2.json();
                const text2 = data2?.message?.content || "";
                setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, content: text2 } : m))
                );
                setBusy(false);
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buf = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });

                // Ollama streams JSON lines
                const lines = buf.split("\n");
                buf = lines.pop() || "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const obj = JSON.parse(trimmed);
                        const delta = obj?.message?.content || "";
                        if (delta) {
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === assistantId ? { ...m, content: m.content + delta } : m
                                )
                            );
                        }
                    } catch {
                        // ignore parse noise
                    }
                }
            }

            setBusy(false);
        } catch (e) {
            setBusy(false);
            setError(e.message || "Chat failed.");
        }
    }


    const ragCaption = "Include RAG from knowledge base";

    return (
        <main className="container">
            <header className="hero">
                <h1 className="title">chat</h1>
                <p className="description">
                    Chat with your local model. Optionally include retrieval context to reduce noise.
                </p>
            </header>

            <section className="section">
                <div className="card">
                    <div className="sectionHeader" style={{ alignItems: "center" }}>
                        <div className="sectionTitle">Settings</div>
                        <div className="muted">Ollama: {OLLAMA_DISPLAY}</div>
                    </div>

                    <div className="divider" />

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ minWidth: 260 }}>
                            <div className="muted small" style={{ marginBottom: 6 }}>Model</div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <select
                                    className="input"
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    style={{ width: "100%" }}
                                >
                                    {models.length === 0 ? (
                                        <option value="">No models found</option>
                                    ) : (
                                        models.map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <button className="secondaryBtn" type="button" onClick={loadModels}>
                                    refresh
                                </button>
                            </div>
                            {models.length === 0 && (
                                <div className="muted small" style={{ marginTop: 6 }}>
                                    If this is blank, pull a model locally (e.g. <code>ollama pull llama3</code>).
                                </div>
                            )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                                <input
                                    type="checkbox"
                                    checked={includeRag}
                                    onChange={(e) => setIncludeRag(e.target.checked)}
                                />
                                <span>{ragCaption}</span>
                            </label>
                        </div>

                        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                            <button className="dangerBtn" type="button" onClick={clearChat}>
                                clear
                            </button>
                        </div>
                    </div>

                    {error && (
                        <>
                            <div className="divider" />
                            <div className="muted" style={{ color: "salmon" }}>
                                {error}
                            </div>
                        </>
                    )}
                </div>
            </section>

            <section className="section">
                <div className="sectionHeader">
                    <div className="sectionTitle">Conversation</div>
                    <div className="muted">{messages.length} message{messages.length === 1 ? "" : "s"}</div>
                </div>

                <div className="divider" />

                <div className="stack">
                    {messages.length === 0 ? (
                        <div className="card">
                            <div className="muted">
                                Ask a question to begin. Turn on RAG to ground responses with your knowledge base.
                            </div>
                        </div>
                    ) : (
                        messages.map((m) => (
                            <div className="card" key={m.id}>
                                <div className="resultMeta">
                                    <div className="resultTitle" style={{ textTransform: "capitalize" }}>{m.role}</div>
                                    <div className="muted small">
                                        {m.meta?.ragEnabled ? "RAG: on" : m.role === "assistant" ? "RAG: off" : ""}
                                    </div>
                                </div>

                                {m.meta?.ragEnabled && Array.isArray(m.meta?.ragSources) && m.meta.ragSources.length > 0 && (
                                    <div className="muted small" style={{ marginBottom: 10 }}>
                                        Context sources:{" "}
                                        {m.meta.ragSources.map((s) => `${s.title} (${s.count})`).join(", ")}
                                    </div>
                                )}

                                <pre className="codeBlock" style={{ whiteSpace: "pre-wrap" }}>
                                    {m.content}
                                </pre>
                            </div>
                        ))
                    )}
                    <div ref={bottomRef} />
                </div>
            </section>

            <section className="section">
                <div className="sectionHeader">
                    <div className="sectionTitle">Send</div>
                    <div className="muted">{busy ? "thinking…" : "ready"}</div>
                </div>

                <div className="divider" />

                <div className="card">
                    <div style={{ display: "grid", gap: 10 }}>
                        <textarea
                            className="input"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Type a message…"
                            rows={4}
                            disabled={busy}
                        />

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <label className="secondaryBtn" style={{ cursor: "pointer" }}>
                                upload files
                                <input
                                    type="file"
                                    multiple
                                    style={{ display: "none" }}
                                    onChange={(e) => onAddFiles(e.target.files)}
                                />
                            </label>

                            <button className="primaryBtn" onClick={send} disabled={busy || !input.trim()}>
                                send
                            </button>

                            <div className="muted small" style={{ marginLeft: "auto" }}>
                                Attachments: {attachments.length}
                            </div>
                        </div>

                        {attachments.length > 0 && (
                            <div className="muted small">
                                {attachments.map((a, idx) => (
                                    <div key={idx}>
                                        <code>{a.name}</code>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Bottom-right nav (match Remove page style) */}
            <div
                style={{
                    position: "fixed",
                    right: 22,
                    bottom: 22,
                    display: "flex",
                    gap: 10,
                    zIndex: 9999,
                }}
            >
                <a className="secondaryBtn" href="/">
                    back home
                </a>
                <a className="secondaryBtn" href="/remove">
                    remove noise
                </a>
            </div>

        </main>
    );
}
