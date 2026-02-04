import React, { useState, useRef, useEffect } from "react";
import { poolLayouts, PoolLayout, applyLayout } from "../themes/styles";

interface LayoutSelectorProps {
  currentLayout: PoolLayout;
  onLayoutChange: (layout: PoolLayout) => void;
}

// Icones pour representer visuellement chaque layout
const LayoutIcon: React.FC<{ layoutId: string; size?: number }> = ({ layoutId, size = 20 }) => {
  const icons: Record<string, React.ReactNode> = {
    "clean-cards": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Cards separees */}
        <rect x="2" y="2" width="9" height="6" rx="1" />
        <rect x="13" y="2" width="9" height="6" rx="1" />
        <rect x="2" y="10" width="20" height="6" rx="1" />
        <rect x="2" y="18" width="20" height="4" rx="1" />
      </svg>
    ),
    "dashboard-pro": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* 2 grandes sections */}
        <rect x="2" y="2" width="10" height="12" rx="1" />
        <rect x="14" y="2" width="8" height="12" rx="1" />
        <rect x="2" y="16" width="20" height="6" rx="1" />
      </svg>
    ),
    "modern-grid": (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {/* Grille equilibree */}
        <rect x="2" y="2" width="6" height="5" rx="1" />
        <rect x="9" y="2" width="6" height="5" rx="1" />
        <rect x="16" y="2" width="6" height="5" rx="1" />
        <rect x="2" y="9" width="20" height="7" rx="1" />
        <rect x="2" y="18" width="10" height="4" rx="1" />
        <rect x="14" y="18" width="8" height="4" rx="1" />
      </svg>
    ),
  };
  return (
    <span className="layout-icon" style={{ width: size, height: size }}>
      {icons[layoutId] || icons["clean-cards"]}
    </span>
  );
};

const LayoutSelector: React.FC<LayoutSelectorProps> = ({ currentLayout, onLayoutChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (layout: PoolLayout) => {
    applyLayout(layout);
    onLayoutChange(layout);
    setIsOpen(false);
  };

  return (
    <div className="style-selector" ref={dropdownRef}>
      <button
        className="style-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Changer le layout"
      >
        <LayoutIcon layoutId={currentLayout.id} />
      </button>

      {isOpen && (
        <div className="style-dropdown">
          <div className="style-dropdown-header">Layout</div>
          {poolLayouts.map((layout) => (
            <button
              key={layout.id}
              className={"style-option" + (layout.id === currentLayout.id ? " active" : "")}
              onClick={() => handleSelect(layout)}
            >
              <LayoutIcon layoutId={layout.id} size={24} />
              <div className="style-option-info">
                <span className="style-option-name">{layout.name}</span>
                <span className="style-option-desc">{layout.description}</span>
              </div>
              {layout.id === currentLayout.id && <span className="style-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LayoutSelector;
