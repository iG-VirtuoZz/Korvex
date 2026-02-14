import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Header from "./components/Header";
import Home from "./pages/Home";
import LandingPage from "./pages/LandingPage";
import MinersPage from "./pages/MinersPage";
import MinerPage from "./pages/MinerPage";
import Status from "./pages/Status";
import Legal from "./pages/Legal";
import HowToStart from "./pages/HowToStart";
import FAQ from "./pages/FAQ";
import DiscordPage from "./pages/DiscordPage";
import AdminDashboard from "./pages/AdminDashboard";
import "./App.css";

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isSolo = location.pathname.includes("ergo-solo");

  return (
    <footer className="footer-minimal">
      <div className="footer-inner">
        <div className="footer-line1">
          <span className="footer-brand-text">KORVEX</span>
          <span className="footer-sep">&middot;</span>
          {isLanding ? t('footer.multi_coin') : (
            <>
              {t('footer.ergo_pool')}
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
          <Link to="/">{t('footer.home')}</Link>
          <Link to="/coin/ergo">{t('footer.dashboard')}</Link>
          <Link to="/coin/ergo/miners">{t('footer.miners')}</Link>
          <Link to="/how-to-start">{t('footer.how_to_start')}</Link>
          <Link to="/faq">{t('footer.faq')}</Link>
          <Link to="/legal">{t('footer.terms')}</Link>
        </div>
        <div className="footer-copy">&copy; 2026 KORVEX Pool</div>
      </div>
    </footer>
  );
};

const NotFound: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1 style={{ fontSize: "3rem", color: "var(--accent)", marginBottom: "16px" }}>404</h1>
      <h2 style={{ color: "var(--text)", marginBottom: "12px" }}>{t('notfound.title')}</h2>
      <p style={{ color: "var(--text-dim)", marginBottom: "24px" }}>{t('notfound.desc')}</p>
      <Link to="/" style={{ color: "var(--accent)", textDecoration: "underline" }}>{t('notfound.back')}</Link>
    </div>
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
        <Route path="/how-to-start-solo" element={<HowToStart />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/discord" element={<DiscordPage />} />
        <Route path="/admin" element={<Navigate to="/coin/ergo/admin" replace />} />
        <Route path="/coin/ergo/admin" element={<AdminDashboard />} />
        <Route path="*" element={<NotFound />} />
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
