import { useState } from 'react';
import { useAuth } from '../auth';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { CoinMark } from '../components/CoinMark';
import { ThemeToggle } from '../components/ThemeToggle';
import type { Theme } from '../App';
import { useZK } from '../hooks/useZK';
import { useDeposit } from '../hooks/useDeposit';
import { useWithdraw } from '../hooks/useWithdraw';
import { useUsdcBalance } from '../hooks/useUsdc';
import { useAllPoolStats, type PoolStats } from '../hooks/usePoolStats';
import { useReveal, useCountUp } from '../hooks/useReveal';
import {
  NETWORK,
  SUPPORTED_CHAIN_ID,
  DENOMINATIONS,
  denomLabel,
  isPoolConfigured,
  type Denomination,
} from '../config';

function shortAddr(a?: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function Stepper({ steps, stage }: { steps: string[]; stage: number }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} className={`stp ${i < stage ? 'done' : ''} ${i === stage ? 'active' : ''}`}>
          <span className="stp-dot">{i < stage ? '✓' : i + 1}</span>
          <span className="stp-l">{s}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dapp({
  onHome,
  theme,
  onToggleTheme,
}: {
  onHome: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { ready, authenticated, preview, login, logout } = useAuth();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const zk = useZK();
  const balance = useUsdcBalance();
  const [refreshKey, setRefreshKey] = useState(0);
  const stats = useAllPoolStats(refreshKey);
  useReveal();

  const wrongNetwork = isConnected && chainId !== SUPPORTED_CHAIN_ID;
  const connected = ready && authenticated && isConnected;
  const bal = useCountUp(Number(balance.formatted || 0), connected && !balance.isLoading);

  const onChanged = () => {
    balance.refetch();
    setRefreshKey((k) => k + 1);
  };

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
          <span className={`net ${wrongNetwork ? 'net-bad' : 'net-ok'}`}>
            <i className="dot" /> {NETWORK.name}
          </span>
          {ready && authenticated ? (
            <>
              <span className="addr">
                <span className="addr-pip" /> {shortAddr(address)}
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

      <div className="banner banner-legal">
        Privacy software. You are solely responsible for legal &amp; tax compliance in your
        jurisdiction. Withdrawals are irreversible — lose your note, lose your funds.
      </div>

      {preview && (
        <div className="banner banner-warn">
          <span>
            Preview mode — wallet login disabled. Set <code>VITE_PRIVY_APP_ID</code> in{' '}
            <code>app/.env</code> and restart.
          </span>
        </div>
      )}

      {wrongNetwork && (
        <div className="banner banner-warn">
          <span>
            Wrong network — this app runs on <b>{NETWORK.name}</b>.
          </span>
          <button
            className="btn-small"
            disabled={switching}
            onClick={() => switchChain({ chainId: SUPPORTED_CHAIN_ID })}
          >
            {switching ? 'Switching…' : `Switch to ${NETWORK.name}`}
          </button>
        </div>
      )}

      <div className="balance-card reveal">
        <div className="bc-left">
          <span className="l">Your USDC balance</span>
          <span className="v">
            {!connected ? '—' : balance.isLoading ? '…' : Number(bal).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            {connected && !balance.isLoading && <span className="bc-unit"> USDC</span>}
          </span>
        </div>
        <div className="bc-coin">
          <CoinMark size={40} glow />
        </div>
      </div>

      <PoolStrip stats={stats} />

      <Panel
        authenticated={ready && authenticated}
        wrongNetwork={!!wrongNetwork}
        zkReady={zk.ready}
        login={login}
        stats={stats}
        onChanged={onChanged}
      />

      <p className="footer-disclaimer" style={{ marginTop: '1.6rem', textAlign: 'center', marginInline: 'auto' }}>
        Non-custodial &amp; permissionless — no admin, owner, or fund-recovery function. Funds move
        only via a valid zero-knowledge proof. Unaudited; test on a fork/testnet first.
      </p>
    </div>
  );
}

function anonPct(n: number | null): string {
  if (!n) return '0%';
  return `${Math.min(100, Math.max(8, Math.log2(n + 1) * 15))}%`;
}

function PoolStrip({ stats }: { stats: PoolStats }) {
  return (
    <div className="pool-strip reveal">
      {DENOMINATIONS.map((d) => {
        const n = stats[d];
        const configured = isPoolConfigured(d);
        return (
          <div className="pool-cell" key={d}>
            <div className="pc-top">
              <span className="pc-amt">{Number(d).toLocaleString('en-US')}</span>
              <span className="pc-cur">USDC</span>
            </div>
            <div className="pc-meter">
              <span style={{ width: configured ? anonPct(n) : '0%' }} />
            </div>
            <div className="pc-sub">
              {!configured ? 'not deployed' : n === null ? 'loading…' : `${n} in pool`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Panel(props: {
  authenticated: boolean;
  wrongNetwork: boolean;
  zkReady: boolean;
  login: () => void;
  stats: PoolStats;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  return (
    <div className="card reveal">
      <div className="tabs">
        <button className={`tab ${tab === 'deposit' ? 'active' : ''}`} onClick={() => setTab('deposit')}>
          Deposit
        </button>
        <button className={`tab ${tab === 'withdraw' ? 'active' : ''}`} onClick={() => setTab('withdraw')}>
          Withdraw
        </button>
      </div>
      <div className="card-body">
        {tab === 'deposit' ? <DepositTab {...props} /> : <WithdrawTab {...props} />}
      </div>
    </div>
  );
}

function DepositTab({
  authenticated,
  wrongNetwork,
  zkReady,
  login,
  stats,
  onChanged,
}: {
  authenticated: boolean;
  wrongNetwork: boolean;
  zkReady: boolean;
  login: () => void;
  stats: PoolStats;
  onChanged: () => void;
}) {
  const [denom, setDenom] = useState<Denomination>('100');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const { deposit, status, loading } = useDeposit();
  const configured = isPoolConfigured(denom);

  async function handleDeposit() {
    if (!authenticated) return login();
    setNote('');
    setCopied(false);
    const result = await deposit(denom);
    if (result) {
      setNote(result.note);
      onChanged();
    }
  }

  function downloadNote() {
    const blob = new Blob([note], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis-note-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const stage = note ? 3 : loading ? (/approv/i.test(status) ? 0 : 1) : -1;

  return (
    <div>
      <label className="field-label">Denomination</label>
      <div className="presets">
        {DENOMINATIONS.map((d) => (
          <button key={d} className={`preset ${denom === d ? 'active' : ''}`} onClick={() => setDenom(d)}>
            {Number(d).toLocaleString('en-US')}
            <span className="sub">USDC</span>
          </button>
        ))}
      </div>

      <div className="rows">
        <div className="row">
          <span className="k">You deposit</span>
          <span className="vv">{denomLabel(denom)}</span>
        </div>
      </div>

      <div className="anon-meter">
        <div className="am-top">
          <span className="k">Anonymity set</span>
          <span className="vv">
            {stats[denom] === null ? '—' : `${stats[denom]} deposit${stats[denom] === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="am-bar">
          <span style={{ width: anonPct(stats[denom]) }} />
        </div>
        <div className="am-hint">Your withdrawal is indistinguishable from any deposit in this pool.</div>
      </div>

      {(loading || note) && <Stepper steps={['Approve', 'Deposit', 'Save note']} stage={stage} />}

      {!configured && (
        <div className="inline-warn">
          No pool deployed for {denomLabel(denom)} on this network yet. Deploy the contracts and set
          the address in <code>.env</code>.
        </div>
      )}

      <button
        className="btn btn-primary wide shine"
        disabled={loading || !zkReady || wrongNetwork || (authenticated && !configured)}
        onClick={handleDeposit}
      >
        {loading && <Spinner />}
        {!authenticated
          ? 'Connect to deposit'
          : loading
            ? 'Processing…'
            : !zkReady
              ? 'Loading privacy library…'
              : `Approve & Deposit ${denomLabel(denom)}`}
      </button>

      {status && (
        <div className={`status ${loading ? 'busy' : ''}`}>
          {loading && <span className="status-dot" />}
          {status}
        </div>
      )}

      {note && (
        <div className="note-box">
          <div className="note-head">⚠ Save this secret note — it is the ONLY way to withdraw.</div>
          <textarea className="note-text" readOnly value={note} rows={3} />
          <div className="note-actions">
            <button
              className="btn btn-ghost"
              style={{ padding: '0.5rem 0.8rem' }}
              onClick={() => {
                navigator.clipboard.writeText(note);
                setCopied(true);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button className="btn btn-ghost" style={{ padding: '0.5rem 0.8rem' }} onClick={downloadNote}>
              Download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WithdrawTab({
  authenticated,
  wrongNetwork,
  zkReady,
  login,
  onChanged,
}: {
  authenticated: boolean;
  wrongNetwork: boolean;
  zkReady: boolean;
  login: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState('');
  const [tx, setTx] = useState('');
  const { withdraw, status, loading } = useWithdraw();

  async function handleWithdraw() {
    if (!authenticated) return login();
    setTx('');
    const hash = await withdraw(note, recipient);
    if (hash) {
      setTx(hash);
      onChanged();
    }
  }

  const stage = tx
    ? 3
    : loading
      ? /proof/i.test(status)
        ? 1
        : /confirm|withdraw|sent|waiting/i.test(status)
          ? 2
          : 0
      : -1;

  return (
    <div>
      <label className="field-label">Secret note</label>
      <input
        className="input"
        placeholder="aegis-…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        spellCheck={false}
      />

      <label className="field-label">Recipient address</label>
      <input
        className="input"
        placeholder="0x… (any address — it does not need funds)"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        spellCheck={false}
      />

      {(loading || tx) && <Stepper steps={['Locate', 'Prove', 'Withdraw']} stage={stage} />}

      <button
        className="btn btn-primary wide shine"
        disabled={loading || !zkReady || wrongNetwork || !note || !recipient}
        onClick={handleWithdraw}
      >
        {loading && <Spinner />}
        {!authenticated
          ? 'Connect to withdraw'
          : loading
            ? 'Generating proof…'
            : !zkReady
              ? 'Loading privacy library…'
              : 'Generate proof & withdraw'}
      </button>

      {status && (
        <div className={`status ${loading ? 'busy' : ''}`}>
          {loading && <span className="status-dot" />}
          {status}
        </div>
      )}
      {tx &&
        (NETWORK.explorerUrl ? (
          <div className="status ok">
            ✓ Sent ·{' '}
            <a href={`${NETWORK.explorerUrl}/tx/${tx}`} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          </div>
        ) : (
          <div className="status ok">✓ Withdrawal tx: {tx}</div>
        ))}
    </div>
  );
}
