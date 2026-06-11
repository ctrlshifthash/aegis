import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { CoinMark } from '../components/CoinMark';
import { ThemeToggle } from '../components/ThemeToggle';
import { getConnection, getUsdcBalance, buildUsdcTransfer, isValidSolanaAddress } from '../solana';
import type { Theme } from '../App';

function shortAddr(a?: string) {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
}

export default function SolanaTransfer({
  onHome,
  theme,
  onToggleTheme,
}: {
  onHome: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const wallet = wallets[0];

  const [balance, setBalance] = useState<number | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [tx, setTx] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    getUsdcBalance(getConnection(), wallet.address).then((b) => {
      if (!cancelled) setBalance(b);
    });
    return () => {
      cancelled = true;
    };
  }, [wallet?.address, tx]);

  async function handleSend() {
    if (!wallet) {
      login();
      return;
    }
    if (!isValidSolanaAddress(recipient)) {
      setStatus('Enter a valid Solana recipient address.');
      return;
    }
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      setStatus('Enter an amount greater than 0.');
      return;
    }
    setLoading(true);
    setTx('');
    try {
      setStatus('Building transaction…');
      const connection = getConnection();
      const transaction = await buildUsdcTransfer(connection, wallet.address, recipient, amt);
      setStatus('Confirm the transfer in your wallet…');
      const sig = await wallet.sendTransaction(transaction, connection);
      setStatus(`Sent (${sig.slice(0, 8)}…). Confirming…`);
      await connection.confirmTransaction(sig, 'confirmed');
      setTx(sig);
      setStatus('Transfer confirmed.');
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error(e);
      setStatus('Error: ' + (err.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  const connected = ready && authenticated && !!wallet;

  return (
    <div className="app-shell">
      <nav className="nav" style={{ position: 'static', padding: '0.2rem 0 1.1rem' }}>
        <div className="brand" onClick={onHome}>
          <CoinMark size={28} glow />
          <span className="wordmark">
            Aegis<span> Protocol</span>
          </span>
        </div>
        <div className="nav-right">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <span className="net net-ok">
            <i className="dot" /> Solana
          </span>
          {connected ? (
            <>
              <span className="addr">
                <span className="addr-pip" /> {shortAddr(wallet?.address)}
              </span>
              <button className="btn btn-ghost" style={{ padding: '0.5rem 0.8rem' }} onClick={logout}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn btn-primary shine" disabled={!ready} onClick={login}>
              {ready ? 'Connect' : 'Loading…'}
            </button>
          )}
        </div>
      </nav>

      <button className="back-link" onClick={onHome} style={{ marginBottom: '0.9rem' }}>
        ← Back to home
      </button>

      <div className="balance-card reveal in">
        <div className="bc-left">
          <span className="l">Your USDC balance · Solana</span>
          <span className="v">
            {!connected
              ? '—'
              : balance === null
                ? '…'
                : Number(balance).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            {connected && balance !== null && <span className="bc-unit"> USDC</span>}
          </span>
        </div>
        <div className="bc-coin">
          <CoinMark size={40} glow />
        </div>
      </div>

      <div className="card reveal in">
        <div className="card-body">
          {!connected && (
            <div className="inline-warn" style={{ marginTop: 0 }}>
              Connect a <b>Solana</b> wallet (e.g. Phantom) to send USDC.
            </div>
          )}

          <label className="field-label">Recipient (Solana address)</label>
          <input
            className="input"
            placeholder="e.g. 7xKp…"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            spellCheck={false}
          />

          <label className="field-label">Amount (USDC)</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            spellCheck={false}
          />

          {connected && balance !== null && (
            <div className="rows">
              <div className="row">
                <span className="k">Available</span>
                <span className="vv">{balance.toLocaleString('en-US')} USDC</span>
              </div>
            </div>
          )}

          <button
            className="btn btn-primary wide shine"
            disabled={loading}
            onClick={handleSend}
          >
            {loading && <span className="spinner" />}
            {!connected ? 'Connect to send' : loading ? 'Sending…' : 'Send USDC'}
          </button>

          {status && (
            <div className={`status ${loading ? 'busy' : ''} ${tx ? 'ok' : ''}`}>
              {loading && <span className="status-dot" />}
              {tx ? '✓ ' : ''}
              {status}
            </div>
          )}
          {tx && (
            <div className="status ok">
              <a href={`https://solscan.io/tx/${tx}`} target="_blank" rel="noreferrer">
                View on Solscan ↗
              </a>
            </div>
          )}
        </div>
      </div>

      <p className="footer-disclaimer" style={{ marginTop: '1.6rem', textAlign: 'center', marginInline: 'auto' }}>
        Non-custodial — your wallet signs every transfer.
      </p>
    </div>
  );
}
