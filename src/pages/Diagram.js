import { Link } from "react-router-dom";

export default function Diagram() {
    return (
        <main className="container">
            <header className="hero">
                <h1 className="title">System Architecture</h1>
                <Link to="/" className="linkBtn" style={{ fontSize: '1.2rem' }}>&larr; Back Home</Link>
            </header>

            <section className="section" style={{ textAlign: "center" }}>
                <div className="card" style={{ display: "inline-block", padding: "20px", background: "#fff" }}>
                    <img
                        src="/awsdiagram.png"
                        alt="Full System Architecture Diagram"
                        style={{ maxWidth: "100%", height: "auto", display: "block" }}
                    />
                </div>

                <div style={{ marginTop: "30px" }}>
                    <a
                        href="https://github.com/drumadrian/noise.bybraincloud.com"
                        target="_blank"
                        rel="noreferrer"
                        className="primaryBtn"
                        style={{ textDecoration: "none", fontSize: "1.1rem", padding: "12px 24px" }}
                    >
                        View Code on GitHub
                    </a>
                </div>
            </section>
        </main>
    );
}
