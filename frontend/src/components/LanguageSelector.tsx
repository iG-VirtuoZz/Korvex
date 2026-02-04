import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface Language {
  code: string;
  name: string;
}

const languages: Language[] = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
];

const FlagEN: React.FC = () => (
  <svg width="24" height="16" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="60" height="40" fill="#012169"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" strokeWidth="6"/>
    <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" strokeWidth="4" clipPath="url(#clip)"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#fff" strokeWidth="10"/>
    <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" strokeWidth="6"/>
  </svg>
);

const FlagFR: React.FC = () => (
  <svg width="24" height="16" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="40" fill="#002395"/>
    <rect x="20" width="20" height="40" fill="#fff"/>
    <rect x="40" width="20" height="40" fill="#ED2939"/>
  </svg>
);

const flags: Record<string, React.FC> = {
  en: FlagEN,
  fr: FlagFR,
};

const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = languages.find(l => l.code === i18n.language) || languages[0];
  const CurrentFlag = flags[currentLang.code] || FlagEN;

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("korvex_lang", code);
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="lang-selector" ref={dropdownRef}>
      <button className="lang-selector-btn" onClick={() => setIsOpen(!isOpen)}>
        <CurrentFlag />
      </button>
      {isOpen && (
        <div className="lang-dropdown">
          {languages.map((lang) => {
            const Flag = flags[lang.code] || FlagEN;
            return (
              <button
                key={lang.code}
                className={"lang-option" + (lang.code === i18n.language ? " active" : "")}
                onClick={() => changeLanguage(lang.code)}
              >
                <Flag />
                <span className="lang-name">{lang.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
