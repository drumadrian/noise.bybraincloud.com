import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Remove from "./pages/Remove";
import Chat from "./pages/Chat";
import Diagram from "./pages/Diagram";
import "./App.css";


export default function App() {
  return (
    <div className="page">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/remove" element={<Remove />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/diagram" element={<Diagram />} />
      </Routes>
    </div>
  );
}
