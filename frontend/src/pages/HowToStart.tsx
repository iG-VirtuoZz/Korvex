import React from "react";

const HowToStart: React.FC = () => (
  <div className="how-to-start-page">

    {/* ===================== 1. INTRODUCTION ===================== */}
    <h2>How to Start Mining on KORVEX Pool</h2>
    <p>
      KORVEX is an independent mining pool for <strong>ERGO</strong> (ERG), a proof-of-work blockchain
      based on the <strong>Autolykos2</strong> algorithm. The pool is open to everyone, GPU-mineable,
      and designed for reliability and transparency.
    </p>
    <p>
      This guide will help you set up your miner and start earning ERG in a few minutes.
    </p>

    <hr />

    {/* ===================== 2. SERVER ===================== */}
    <h3>1. Choose a Server</h3>
    <p>
      Connect to the server closest to your location for the best latency and fewer stale shares.
    </p>
    <table>
      <thead>
        <tr><th>Region</th><th>Server</th><th>Port</th></tr>
      </thead>
      <tbody>
        <tr><td>Europe (France)</td><td>korvexpool.com</td><td>3416</td></tr>
      </tbody>
    </table>
    <p className="text-muted">
      Additional regions (US, Asia) may be added in the future based on demand.
    </p>

    <hr />

    {/* ===================== 3. WALLET ===================== */}
    <h3>2. Get a Wallet</h3>
    <p>
      You need an ERGO wallet address to receive your mining rewards.
      Your wallet address is also your mining username — no account registration is needed.
    </p>
    <p><strong>Recommended wallets:</strong></p>
    <ul>
      <li><strong>Nautilus Wallet</strong> — browser extension, easy to use (recommended)</li>
      <li><strong>Ergo Wallet</strong> — official mobile wallet (Android / iOS)</li>
    </ul>
    <p className="text-muted">
      You can also use an exchange deposit address, but this is not recommended.
      Exchanges may change your deposit address without notice, which could cause lost payments.
      Always prefer a personal wallet you control.
    </p>

    <hr />

    {/* ===================== 4. MINING SOFTWARE ===================== */}
    <h3>3. Mining Software</h3>
    <p>
      Autolykos2 is GPU-mineable. Below are the most popular miners with ready-to-use commands.
      Replace <code>YOUR_WALLET</code> with your ERG address and <code>RIG_NAME</code> with a name for your machine.
    </p>

    <div className="miner-recommendation">
      <h4>✅ Recommended Miners</h4>
      <p className="text-muted">These miners have 100% compatibility with KORVEX pool stratum implementation.</p>
    </div>

    <h4>lolMiner <span className="badge-recommended">Recommended</span></h4>
    <p className="text-muted">NVIDIA &amp; AMD — Best overall compatibility</p>
    <pre><code>lolMiner --algo AUTOLYKOS2 --pool korvexpool.com:3416 --user YOUR_WALLET.RIG_NAME</code></pre>

    <h4>TeamRedMiner <span className="badge-recommended">Recommended</span></h4>
    <p className="text-muted">AMD — Excellent performance and stability</p>
    <pre><code>teamredminer -a autolykos2 -o stratum+tcp://korvexpool.com:3416 -u YOUR_WALLET.RIG_NAME -p x</code></pre>

    <h4>Rigel <span className="badge-recommended">Recommended</span></h4>
    <p className="text-muted">NVIDIA — Modern and efficient</p>
    <pre><code>rigel -a autolykos2 -o stratum+tcp://korvexpool.com:3416 -u YOUR_WALLET.RIG_NAME</code></pre>

    <div className="miner-recommendation miner-supported">
      <h4>⚠️ Also Supported</h4>
      <p className="text-muted">These miners work but may have minor compatibility variations.</p>
    </div>

    <h4>SRBMiner-MULTI</h4>
    <p className="text-muted">AMD &amp; NVIDIA — Some users may experience sporadic client-side share rejections due to stratum protocol interpretation differences. Consider using lolMiner or TeamRedMiner for optimal results.</p>
    <pre><code>SRBMiner-MULTI --disable-cpu --algorithm autolykos2 --pool korvexpool.com:3416 --wallet YOUR_WALLET.RIG_NAME</code></pre>

    <p className="text-muted">
      <strong>Note:</strong> GPUs with less than 8 GB of VRAM cannot mine Autolykos2 anymore (the dataset no longer fits in memory).
    </p>

    <hr />

    {/* ===================== 5. POOL PARAMETERS ===================== */}
    <h3>4. Pool Parameters</h3>
    <table>
      <tbody>
        <tr><td><strong>Coin</strong></td><td>ERGO (ERG)</td></tr>
        <tr><td><strong>Algorithm</strong></td><td>Autolykos2</td></tr>
        <tr><td><strong>Pool fee</strong></td><td>1%</td></tr>
        <tr><td><strong>Reward method</strong></td><td>PPLNS</td></tr>
        <tr><td><strong>Minimum payout</strong></td><td>1 ERG</td></tr>
        <tr><td><strong>Confirmations</strong></td><td>720 blocks (~24 hours)</td></tr>
        <tr><td><strong>Payouts</strong></td><td>Automatic</td></tr>
        <tr><td><strong>Stratum port</strong></td><td>3416</td></tr>
      </tbody>
    </table>

    <hr />

    {/* ===================== 6. PPLNS ===================== */}
    <h3>5. How PPLNS Works</h3>
    <p>
      KORVEX uses the <strong>PPLNS</strong> (Pay Per Last N Shares) reward method.
      When the pool finds a block, the reward is distributed among miners who contributed
      shares during a recent window of work.
    </p>
    <p>
      The window is proportional to the network difficulty: the more you mine consistently,
      the bigger your share of each block. Miners who connect only briefly and disconnect
      will earn less, because their shares may fall outside the window.
    </p>
    <p><strong>Key points:</strong></p>
    <ul>
      <li>Rewards are based on the difficulty of your submitted shares, not just their count</li>
      <li>Mining regularly gives you the best results</li>
      <li>The 1% pool fee is deducted before distribution</li>
      <li>There are no hidden penalties or charges</li>
    </ul>

    <hr />

    {/* ===================== 7. PAYMENTS ===================== */}
    <h3>6. Payments</h3>
    <p>
      Payments are <strong>fully automatic</strong>. Once your confirmed balance reaches 1 ERG,
      the pool sends your earnings to your wallet address.
    </p>
    <ul>
      <li>After a block is found, the pool waits for <strong>720 confirmations</strong> (~24 hours) before crediting your balance. This ensures the block is permanently on the blockchain.</li>
      <li>If a block becomes <strong>orphaned</strong> (removed from the chain), no rewards are credited. This is standard behavior for all mining pools.</li>
      <li>Network transaction fees (0.001 ERG per payment) are covered by the pool, not deducted from your balance.</li>
    </ul>

    <hr />

    {/* ===================== 8. STATS ===================== */}
    <h3>7. Monitor Your Stats</h3>
    <p>
      Go to the <strong>Miner</strong> page and enter your wallet address. You will see:
    </p>
    <ul>
      <li><strong>Hashrate</strong> — real-time, 15 min, and 1 hour averages</li>
      <li><strong>Workers</strong> — list of connected rigs</li>
      <li><strong>Balance</strong> — confirmed (ready for payout) and pending (waiting for confirmations)</li>
      <li><strong>Payments</strong> — history of all sent payments with transaction hashes</li>
    </ul>
    <p className="text-muted">
      Stats are updated every minute. It may take a few minutes after your miner connects
      for the first data to appear.
    </p>

    <hr />

    {/* ===================== 9. SUPPORT ===================== */}
    <h3>8. Support</h3>
    <p>
      If you have questions or need help, you can reach us through the following channels:
    </p>
    <ul>
      <li><strong>Discord</strong> — coming soon</li>
      <li><strong>Telegram</strong> — coming soon</li>
      <li><strong>Email</strong> — guillaumesastre34@gmail.com</li>
    </ul>
    <p className="text-muted">
      Please also check the <a href="/legal">Legal &amp; Terms</a> page for our terms of service and privacy policy.
    </p>

  </div>
);

export default HowToStart;
