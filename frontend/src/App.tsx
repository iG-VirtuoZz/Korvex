import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import MinersPage from "./pages/MinersPage";
import MinerPage from "./pages/MinerPage";
import Status from "./pages/Status";
import Legal from "./pages/Legal";
import HowToStart from "./pages/HowToStart";
import DiscordPage from "./pages/DiscordPage";
import AdminDashboard from "./pages/AdminDashboard";
import "./App.css";

const Footer: React.FC = () => {
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isSolo = location.pathname.includes("ergo-solo");

  return (
    <footer className="footer-minimal">
      <div className="footer-inner">
        <div className="footer-line1">
          <span className="footer-brand-text">KORVEX</span>
          <span className="footer-sep">&middot;</span>
          {isLanding ? "Multi-Coin Mining Pool" : (
            <>
              ERGO Mining Pool
              <span className="footer-sep">&middot;</span>
              {isSolo ? "SOLO" : "PPLNS"}
              <span className="footer-sep">&middot;</span>
              {isSolo ? "1.5% Fee" : "1% Fee"}
              <span className="footer-sep">&middot;</span>
              Autolykos2
            </>
          )}
        </div>
        <div className="footer-links">
          <Link to="/">Home</Link>
          <Link to="/coin/ergo">Ergo Dashboard</Link>
          <Link to="/coin/ergo/miners">Miners</Link>
          <Link to="/how-to-start">How to Start</Link>
          <Link to="/legal">Terms</Link>
        </div>
        <div className="footer-copy">&copy; 2026 KORVEX Pool</div>
      </div>
    </footer>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <Header />
    <main className="container">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/coin/ergo" element={<Home />} />
        <Route path="/coin/ergo/miners" element={<MinersPage />} />
        <Route path="/coin/ergo/miner/:address" element={<MinerPage />} />
        <Route path="/coin/ergo-solo" element={<Home />} />
        <Route path="/coin/ergo-solo/miners" element={<MinersPage />} />
        <Route path="/coin/ergo-solo/miner/:address" element={<MinerPage />} />
        {/* Redirections anciennes URLs */}
        <Route path="/miners" element={<Navigate to="/coin/ergo/miners" replace />} />
        <Route path="/miner/:address" element={<RedirectMiner />} />
        <Route path="/status" element={<Status />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/how-to-start" element={<HowToStart />} />
        <Route path="/discord" element={<DiscordPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </main>
    <Footer />
  </BrowserRouter>
);

/* Composant pour rediriger /miner/:address vers /coin/ergo/miner/:address */
function RedirectMiner() {
  const path = window.location.pathname;
  const address = path.replace("/miner/", "");
  return <Navigate to={"/coin/ergo/miner/" + address} replace />;
}

export default App;
