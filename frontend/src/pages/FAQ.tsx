import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCoin } from "../hooks/useMiningMode";

interface FAQItemProps {
  question: string;
  answer: string;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={`faq-item ${open ? "faq-item-open" : ""}`}>
      <button className="faq-question" onClick={() => setOpen(!open)}>
        <span>{question}</span>
        <span className={`faq-chevron ${open ? "faq-chevron-open" : ""}`}>&#9660;</span>
      </button>
      <div className="faq-answer" style={{ maxHeight: open ? "500px" : "0" }}>
        <div className="faq-answer-inner" dangerouslySetInnerHTML={{ __html: answer }} />
      </div>
    </div>
  );
};

const FAQ: React.FC = () => {
  const { t } = useTranslation();
  const coin = useCoin();
  const isMonero = coin === 'monero';

  // Categories communes Ergo
  const ergoCategories = [
    {
      key: "rewards",
      title: t("faq.cat_rewards"),
      items: [
        { q: t("faq.rewards_q1"), a: t("faq.rewards_a1") },
        { q: t("faq.rewards_q2"), a: t("faq.rewards_a2") },
        { q: t("faq.rewards_q3"), a: t("faq.rewards_a3") },
        { q: t("faq.rewards_q4"), a: t("faq.rewards_a4") },
        { q: t("faq.rewards_q5"), a: t("faq.rewards_a5") },
        { q: t("faq.rewards_q6"), a: t("faq.rewards_a6") },
      ],
    },
    {
      key: "mining",
      title: t("faq.cat_mining"),
      items: [
        { q: t("faq.mining_q1"), a: t("faq.mining_a1") },
        { q: t("faq.mining_q2"), a: t("faq.mining_a2") },
        { q: t("faq.mining_q3"), a: t("faq.mining_a3") },
        { q: t("faq.mining_q4"), a: t("faq.mining_a4") },
        { q: t("faq.mining_q5"), a: t("faq.mining_a5") },
      ],
    },
    {
      key: "hashrate",
      title: t("faq.cat_hashrate"),
      items: [
        { q: t("faq.hashrate_q1"), a: t("faq.hashrate_a1") },
        { q: t("faq.hashrate_q2"), a: t("faq.hashrate_a2") },
        { q: t("faq.hashrate_q3"), a: t("faq.hashrate_a3") },
        { q: t("faq.hashrate_q4"), a: t("faq.hashrate_a4") },
      ],
    },
    {
      key: "luck",
      title: t("faq.cat_luck"),
      items: [
        { q: t("faq.luck_q1"), a: t("faq.luck_a1") },
        { q: t("faq.luck_q2"), a: t("faq.luck_a2") },
        { q: t("faq.luck_q3"), a: t("faq.luck_a3") },
      ],
    },
    {
      key: "wallet",
      title: t("faq.cat_wallet"),
      items: [
        { q: t("faq.wallet_q1"), a: t("faq.wallet_a1") },
        { q: t("faq.wallet_q2"), a: t("faq.wallet_a2") },
        { q: t("faq.wallet_q3"), a: t("faq.wallet_a3") },
        { q: t("faq.wallet_q4"), a: t("faq.wallet_a4") },
      ],
    },
  ];

  // Categories Monero
  const moneroCategories = [
    {
      key: "xmr_getting_started",
      title: t("faq.xmr_cat_getting_started"),
      items: [
        { q: t("faq.xmr_gs_q1"), a: t("faq.xmr_gs_a1") },
        { q: t("faq.xmr_gs_q2"), a: t("faq.xmr_gs_a2") },
        { q: t("faq.xmr_gs_q3"), a: t("faq.xmr_gs_a3") },
        { q: t("faq.xmr_gs_q4"), a: t("faq.xmr_gs_a4") },
      ],
    },
    {
      key: "xmr_rewards",
      title: t("faq.xmr_cat_rewards"),
      items: [
        { q: t("faq.xmr_rw_q1"), a: t("faq.xmr_rw_a1") },
        { q: t("faq.xmr_rw_q2"), a: t("faq.xmr_rw_a2") },
        { q: t("faq.xmr_rw_q3"), a: t("faq.xmr_rw_a3") },
        { q: t("faq.xmr_rw_q4"), a: t("faq.xmr_rw_a4") },
      ],
    },
    {
      key: "xmr_hashrate",
      title: t("faq.xmr_cat_hashrate"),
      items: [
        { q: t("faq.xmr_hr_q1"), a: t("faq.xmr_hr_a1") },
        { q: t("faq.xmr_hr_q2"), a: t("faq.xmr_hr_a2") },
        { q: t("faq.xmr_hr_q3"), a: t("faq.xmr_hr_a3") },
      ],
    },
    {
      key: "xmr_wallet",
      title: t("faq.xmr_cat_wallet"),
      items: [
        { q: t("faq.xmr_wl_q1"), a: t("faq.xmr_wl_a1") },
        { q: t("faq.xmr_wl_q2"), a: t("faq.xmr_wl_a2") },
      ],
    },
  ];

  const categories = isMonero ? moneroCategories : ergoCategories;
  const title = isMonero ? t("faq.xmr_title") : t("faq.title");
  const subtitle = isMonero ? t("faq.xmr_subtitle") : t("faq.subtitle");

  return (
    <div className="layout-modern">

      {/* Header */}
      <div className="modern-header">
        <h1>{title}</h1>
        <p className="modern-header-sub">{subtitle}</p>
      </div>

      {/* Categories */}
      {categories.map((cat) => (
        <div key={cat.key} className="faq-category">
          <h3 className="faq-category-title">{cat.title}</h3>
          {cat.items.map((item, i) => (
            <FAQItem key={i} question={item.q} answer={item.a} />
          ))}
        </div>
      ))}

    </div>
  );
};

export default FAQ;
