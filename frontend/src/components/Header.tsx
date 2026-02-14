import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import LanguageSelector from "./LanguageSelector";
import StyleSelector from "./StyleSelector";
import { applyBgTheme, loadSavedBgTheme } from "../themes/styles";
import { useCoinBasePath } from "../hooks/useMiningMode";

const STORAGE_KEY = "korvex_miner_address";

const BoltIcon: React.FC = () => (
  <svg className="logo-bolt" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="var(--gradient-start)" />
        <stop offset="50%" stopColor="var(--accent)" />
        <stop offset="100%" stopColor="var(--gradient-end)" />
      </linearGradient>
      <filter id="boltGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect x="0" y="0" width="64" height="64" rx="14" fill="var(--bg)" />
    <circle cx="32" cy="32" r="26" fill="none" stroke="var(--accent)" strokeWidth="1" opacity="0.2" />
    <g filter="url(#boltGlow)">
      <path d="M36,4 L18,34 L28,34 L24,60 L46,28 L34,28 L40,4 Z" fill="url(#boltGrad)" />
    </g>
    <path d="M34,10 L24,30 L30,30 L27,48 L40,30 L34,30 L37,10 Z" fill="#ffffff" opacity="0.15" />
  </svg>
);

const DiscordIcon: React.FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const Header: React.FC = () => {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = useCoinBasePath();

  const isLanding = location.pathname === "/";
  const isSoloSection = location.pathname.includes("ergo-solo");
  const howToStartLink = isSoloSection ? "/how-to-start-solo" : "/how-to-start";

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSearchValue(saved);
    }
    applyBgTheme(loadSavedBgTheme());
  }, []);

  const handleSearch = () => {
    const addr = searchValue.trim();
    if (addr) {
      localStorage.setItem(STORAGE_KEY, addr);
      navigate(basePath + "/miner/" + addr);
    }
  };

  return (
    <header className="header">
      <div className="header-top">
        <NavLink to="/" className="logo-link">
          <BoltIcon />
          <span className="logo-text">KORVEX</span>
        </NavLink>

        <div className="header-search">
          <span className="header-search-icon">&#128269;</span>
          <input
            type="text"
            placeholder={t('header.search_placeholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          {searchValue && (
            <button
              className="header-search-clear"
              onClick={() => { setSearchValue(""); localStorage.removeItem(STORAGE_KEY); }}
              title={t('header.clear')}
            >
              &times;
            </button>
          )}
        </div>

        <div className="header-actions">
          <StyleSelector />
          <LanguageSelector />
          <a href="https://discord.gg/nVvTdwN7ya" target="_blank" rel="noopener noreferrer" className="header-discord" title={t('header.join_discord')}>
            <DiscordIcon />
          </a>
          <NavLink to={howToStartLink} className="header-cta">
            {t('header.start_mining')} &rarr;
          </NavLink>
        </div>
      </div>

      {!isLanding && (
        <nav className="header-nav">
          <div className="header-nav-inner">
            <NavLink to={basePath} end>{t('header.dashboard')}</NavLink>
            <NavLink to={basePath + "/miners"}>{t('header.miners')}</NavLink>
            <NavLink to={howToStartLink}>{t('header.how_to_start')}</NavLink>
            <NavLink to="/faq">FAQ</NavLink>
          </div>
        </nav>
      )}
    </header>
  );
};

export default Header;
