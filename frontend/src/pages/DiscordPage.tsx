import React, { useState } from "react";
import { useTranslation } from "react-i18next";

const DiscordPage: React.FC = () => {
  const { t } = useTranslation();
  const discordLink = "https://discord.gg/nVvTdwN7ya";
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(discordLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="page" style={{ textAlign: "center", paddingTop: "60px" }}>
      <h1 style={{ color: "#fff", marginBottom: "32px" }}>{t('discord.title')}</h1>

      <div style={{ background: "linear-gradient(135deg, #5865F2 0%, #4752C4 100%)", padding: "32px", borderRadius: "16px", maxWidth: "450px", margin: "0 auto" }}>

        <p style={{ color: "#fff", fontSize: "16px", marginBottom: "24px" }}>
          {t('discord.description')}
        </p>

        <div style={{ background: "rgba(0,0,0,0.3)", padding: "16px", borderRadius: "8px", marginBottom: "20px" }}>
          <code style={{ color: "#fff", wordBreak: "break-all", fontSize: "14px" }}>{discordLink}</code>
        </div>

        <button
          onClick={copyToClipboard}
          style={{
            padding: "16px 48px",
            background: copied ? "#22c55e" : "#fff",
            color: copied ? "#fff" : "#5865F2",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontSize: "18px",
            fontWeight: "bold",
            transition: "all 0.2s"
          }}
        >
          {copied ? t('discord.copied') : t('discord.copy')}
        </button>
      </div>
    </div>
  );
};

export default DiscordPage;
