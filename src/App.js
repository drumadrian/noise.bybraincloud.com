import { Routes, Route, Link, useLocation } from "react-router-dom";
import Home from "./pages/Home";
import Remove from "./pages/Remove";
import "./App.css";

function FloatingRemoveNoiseLink() {
  const location = useLocation();
  const onRemovePage = location.pathname === "/remove";

  return (
    <Link
      to={onRemovePage ? "/" : "/remove"}
      className="removeNoiseLink"
      aria-label={onRemovePage ? "Back to home" : "Remove noise"}
      title={onRemovePage ? "Back to home" : "Remove noise"}
    >
      {onRemovePage ? "back home" : "remove noise"}
    </Link>
  );
}

export default function App() {
  return (
    <div className="page">
      <FloatingRemoveNoiseLink />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/remove" element={<Remove />} />
      </Routes>
    </div>
  );
}



