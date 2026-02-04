import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import MinersPage from "./pages/MinersPage";
import MinerPage from "./pages/MinerPage";
import Status from "./pages/Status";
import Legal from "./pages/Legal";
import HowToStart from "./pages/HowToStart";
import DiscordPage from "./pages/DiscordPage";
import "./App.css";

const Footer: React.FC = () => (
  <footer className="footer-minimal">
    <div className="footer-inner">
      <div className="footer-line1">
        <span className="footer-brand-text">KORVEX</span>
        <span className="footer-sep">&middot;</span>
        ERGO Mining Pool
        <span className="footer-sep">&middot;</span>
        PPLNS
        <span className="footer-sep">&middot;</span>
        1% Fee
        <span className="footer-sep">&middot;</span>
        Autolykos2
      </div>
      <div className="footer-links">
        <Link to="/">Dashboard</Link>
        <Link to="/miners">Miners</Link>
        <Link to="/how-to-start">How to Start</Link>
        <Link to="/legal">Terms</Link>
        <Link to="/legal">Privacy</Link>
      </div>
      <div className="footer-copy">&copy; 2026 KORVEX Pool</div>
    </div>
  </footer>
);

const App: React.FC = () => (
  <BrowserRouter>
    <Header />
    <main className="container">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/miners" element={<MinersPage />} />
        <Route path="/miner/:address" element={<MinerPage />} />
        <Route path="/status" element={<Status />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/how-to-start" element={<HowToStart />} />
        <Route path="/discord" element={<DiscordPage />} />
      </Routes>
    </main>
    <Footer />
  </BrowserRouter>
);

export default App;
