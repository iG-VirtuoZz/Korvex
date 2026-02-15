import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface Language {
  code: string;
  name: string;
}

const languages: Language[] = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "ru", name: "Русский" },
  { code: "zh", name: "中文" },
  { code: "es", name: "Español" },
  { code: "de", name: "Deutsch" },
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

const FlagRU: React.FC = () => (
  <svg width="24" height="16" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="60" height="13.33" fill="#fff"/>
    <rect y="13.33" width="60" height="13.33" fill="#0039A6"/>
    <rect y="26.66" width="60" height="13.34" fill="#D52B1E"/>
  </svg>
);

const FlagZH: React.FC = () => (
  <svg width="24" height="16" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="60" height="40" fill="#DE2910"/>
    <g fill="#FFDE00" transform="translate(10,8)">
      <polygon points="0,-6 1.76,-1.85 6.47,-1.85 2.35,1.06 3.8,5.26 0,2.35 -3.8,5.26 -2.35,1.06 -6.47,-1.85 -1.76,-1.85"/>
    </g>
    <g fill="#FFDE00" transform="translate(20,3)">
      <polygon points="0,-2.5 0.73,-0.77 2.7,-0.77 0.98,0.44 1.58,2.19 0,0.98 -1.58,2.19 -0.98,0.44 -2.7,-0.77 -0.73,-0.77"/>
    </g>
    <g fill="#FFDE00" transform="translate(23,7)">
      <polygon points="0,-2.5 0.73,-0.77 2.7,-0.77 0.98,0.44 1.58,2.19 0,0.98 -1.58,2.19 -0.98,0.44 -2.7,-0.77 -0.73,-0.77"/>
    </g>
    <g fill="#FFDE00" transform="translate(23,13)">
      <polygon points="0,-2.5 0.73,-0.77 2.7,-0.77 0.98,0.44 1.58,2.19 0,0.98 -1.58,2.19 -0.98,0.44 -2.7,-0.77 -0.73,-0.77"/>
    </g>
    <g fill="#FFDE00" transform="translate(20,17)">
      <polygon points="0,-2.5 0.73,-0.77 2.7,-0.77 0.98,0.44 1.58,2.19 0,0.98 -1.58,2.19 -0.98,0.44 -2.7,-0.77 -0.73,-0.77"/>
    </g>
  </svg>
);

const FlagES: React.FC = () => (
  <svg width="24" height="16" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="60" height="10" fill="#AA151B"/>
    <rect y="10" width="60" height="20" fill="#F1BF00"/>
    <rect y="30" width="60" height="10" fill="#AA151B"/>
  </svg>
);

const FlagDE: React.FC = () => (
  <svg width="24" height="16" viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="60" height="13.33" fill="#000"/>
    <rect y="13.33" width="60" height="13.33" fill="#DD0000"/>
    <rect y="26.66" width="60" height="13.34" fill="#FFCC00"/>
  </svg>
);

const flags: Record<string, React.FC> = {
  en: FlagEN,
  fr: FlagFR,
  ru: FlagRU,
  zh: FlagZH,
  es: FlagES,
  de: FlagDE,
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
