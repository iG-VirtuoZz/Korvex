import React, { useState, useRef, useEffect } from "react";
import { poolStyles, PoolStyle, applyStyle } from "../themes/styles";

interface StyleSelectorProps {
  currentStyle: PoolStyle;
  onStyleChange: (style: PoolStyle) => void;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ currentStyle, onStyleChange }) => {
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

  const handleSelect = (style: PoolStyle) => {
    applyStyle(style);
    onStyleChange(style);
    setIsOpen(false);
  };

  return (
    <div className="style-selector" ref={dropdownRef}>
      <button
        className="style-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="Changer le style"
      >
        <span
          className="style-color-preview"
          style={{
            background: `linear-gradient(135deg, ${currentStyle.colors.accent}, ${currentStyle.colors.gradientEnd})`,
          }}
        />
        <span className="style-selector-icon">◐</span>
      </button>

      {isOpen && (
        <div className="style-dropdown">
          <div className="style-dropdown-header">Interface Style</div>
          {poolStyles.map((style) => (
            <button
              key={style.id}
              className={"style-option" + (style.id === currentStyle.id ? " active" : "")}
              onClick={() => handleSelect(style)}
            >
              <span
                className="style-color-preview"
                style={{
                  background: `linear-gradient(135deg, ${style.colors.gradientStart}, ${style.colors.accent}, ${style.colors.gradientEnd})`,
                }}
              />
              <div className="style-option-info">
                <span className="style-option-name">{style.name}</span>
                <span className="style-option-desc">{style.description}</span>
              </div>
              {style.id === currentStyle.id && <span className="style-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default StyleSelector;
