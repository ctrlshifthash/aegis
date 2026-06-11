import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CoinMark } from '../components/CoinMark';
import { HeroCoin } from '../components/HeroCoin';
import { HeroParticles } from '../components/HeroParticles';
import { ThemeToggle } from '../components/ThemeToggle';
import { SocialLinks } from '../components/SocialLinks';
import { useReveal, useCountUp } from '../hooks/useReveal';
import type { Theme } from '../App';

const NAV = [
  { id: 'how', label: 'How it works' },
  { id: 'protocol', label: 'Protocol' },
  { id: 'security', label: 'Security' },
  { id: 'faq', label: 'FAQ' },
];

export default function Landing({
  onLaunch,
  theme,
  onToggleTheme,
}: {
  onLaunch: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState('how');
  useReveal();

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setScrolled(window.scrollY > 12);
      setProgress(max > 0 ? (window.scrollY / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => e.isIntersecting && setActive(e.target.id));
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    NAV.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div className="scroll-prog" style={{ width: `${progress}%` }} />

      <nav className={`nav nav-light ${scrolled ? 'scrolled' : ''}`}>
        <div className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <CoinMark size={30} glow />
          <span className="wordmark">
            Aegis<span> Protocol</span>
          </span>
        </div>
        <div className="nav-links">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'active' : ''}>
              {n.label}
            </a>
          ))}
          <a href="https://github.com" target="_blank" rel="noreferrer">
            Source
          </a>
        </div>
        <div className="nav-right">
          <SocialLinks />
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="btn btn-primary shine magnetic" onClick={onLaunch}>
            Launch app
          </button>
        </div>
      </nav>

      {/* ---------------- hero ---------------- */}
      <header className="hero">
        <div className="hero-aurora" />
        <div className="hero-grid" />
        <HeroParticles />
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="live-dot" /> Zero-knowledge privacy · USDC
            </span>
            <h1>
              Send USDC that <span className="it">can&rsquo;t be traced</span> back to you.
            </h1>
            <p className="lead">
              Deposit a fixed amount, get a secret note, and withdraw to a fresh address. A
              zero-knowledge proof severs the on-chain link between sender and receiver — no
              custody, no intermediary, no record of who paid whom.
            </p>
            <div className="hero-cta">
              <button className="btn btn-primary shine magnetic" onClick={onLaunch}>
                Launch app <span className="arrow">→</span>
              </button>
              <a className="btn btn-ghost" href="#how">
                See how it works
              </a>
            </div>
            <div className="hero-trust">
              {['Non-custodial', 'No admin keys', 'Open source', 'Audit-first'].map((t) => (
                <span key={t}>
                  <span className="tick">✓</span> {t}
                </span>
              ))}
            </div>
          </div>

          <div className="hero-art">
            <HeroCoin />
          </div>
        </div>

        <div className="tech-strip wrap">
          <span>Built with</span>
          <b>Poseidon</b>
          <i>·</i>
          <b>Groth16</b>
          <i>·</i>
          <b>circom</b>
          <i>·</i>
          <b>Merkle tree</b>
        </div>
      </header>

      {/* ---------------- stat band ---------------- */}
      <section className="wrap" style={{ marginTop: '-1rem' }}>
        <div className="stat-band reveal">
          {[
            ['3', 'Fixed pools'],
            ['100–10k', 'USDC denominations'],
            ['0', 'Admin keys'],
            ['zk', 'Groth16 proofs'],
          ].map(([v, l]) => (
            <div className="stat" key={l}>
              <StatNum value={v} />
              <div className="l">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="section wrap" id="how">
        <div className="section-head reveal">
          <span className="eyebrow">How it works</span>
          <h2>
            Three steps to an <span className="it">unlinkable</span> transfer.
          </h2>
          <p>
            Privacy comes from the crowd: every deposit in a pool is identical, so withdrawals
            can&rsquo;t be matched to deposits. The bigger the pool, the stronger your anonymity.
          </p>
        </div>

        {/* animated zk pipeline */}
        <div className="flow reveal">
          <div className="flow-track">
            <span className="flow-pulse" />
          </div>
          {[
            ['01', 'Secret note', 'random nullifier + secret'],
            ['02', 'Commitment', 'Poseidon(nullifier, secret)'],
            ['03', 'Merkle tree', 'leaf added on-chain'],
            ['04', 'ZK proof', 'prove membership privately'],
            ['05', 'Fresh wallet', 'USDC released'],
          ].map(([n, t, s]) => (
            <div className="flow-node" key={n}>
              <span className="fn-dot">{n}</span>
              <strong>{t}</strong>
              <span className="fn-sub">{s}</span>
            </div>
          ))}
        </div>

        <div className="steps">
          <Step n="STEP 01" title="Deposit" delay={0}>
            Approve and deposit a fixed amount of USDC. Your wallet generates a secret note and
            commits only a <b>hash</b> of it on-chain — never the secret itself.
          </Step>
          <Step n="STEP 02" title="Hold the note" delay={0.08}>
            The note is the only key to your funds. Save it offline. There is no account, no login,
            and no way for anyone — including us — to recover it for you.
          </Step>
          <Step n="STEP 03" title="Withdraw" delay={0.16}>
            From any wallet, prove in zero knowledge that you own a deposit — without revealing
            which one — and the pool releases USDC to a fresh address you choose.
          </Step>
        </div>
      </section>

      {/* ---------------- under the hood ---------------- */}
      <section className="section wrap" id="under">
        <div className="under-grid">
          <div className="reveal">
            <span className="eyebrow">Under the hood</span>
            <h2 className="under-title">
              Your note is a <span className="it">key</span>, not an account.
            </h2>
            <p className="lead" style={{ fontSize: '1rem' }}>
              The note encodes two random secrets. On deposit, only their Poseidon hash (the
              <b> commitment</b>) is published. On withdrawal, a SNARK proves you know secrets behind
              <i> some</i> commitment in the tree — and reveals a one-time <b>nullifier</b> so the
              same note can never be spent twice.
            </p>
            <ul className="hood-list">
              <li>
                <span className="hk">Commitment</span> Poseidon(nullifier, secret) — published on
                deposit, hides the secret.
              </li>
              <li>
                <span className="hk">Nullifier</span> Poseidon(nullifier) — revealed on withdraw,
                blocks double-spends.
              </li>
              <li>
                <span className="hk">Merkle root</span> a rolling 30-root history, so proofs stay
                valid as the pool grows.
              </li>
              <li>
                <span className="hk">Proof</span> a Groth16 SNARK generated locally — secrets never
                leave your browser.
              </li>
            </ul>
          </div>

          <div className="reveal">
            <div className="note-anatomy">
              <div className="na-head">
                <span className="na-dot" /> <span className="na-dot" /> <span className="na-dot" />
                <span className="na-title">your-secret-note.txt</span>
              </div>
              <code className="na-code">
                <span className="na-seg s1">aegis</span>-<span className="na-seg s2">1</span>-
                <span className="na-seg s3">100</span>-
                <span className="na-seg s4">eyJudWxsaWZpZXIiOiI4Mn…0ifQ</span>
              </code>
              <div className="na-legend">
                <span>
                  <i className="d1" /> protocol
                </span>
                <span>
                  <i className="d2" /> chain
                </span>
                <span>
                  <i className="d3" /> amount
                </span>
                <span>
                  <i className="d4" /> encrypted secret
                </span>
              </div>
              <div className="na-foot">
                Anyone with this string controls the deposit. Treat it like cash.
              </div>
            </div>
          </div>
        </div>

        {/* anonymity set */}
        <div className="anon reveal">
          <div className="anon-copy">
            <h3>Hide in the crowd.</h3>
            <p>
              Because every deposit is the same size, your withdrawal could correspond to{' '}
              <b>any</b> deposit in the pool. Each new deposit grows everyone&rsquo;s anonymity set.
            </p>
          </div>
          <div className="anon-grid" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => (
              <span className={`anon-coin ${i === 10 ? 'you' : ''}`} key={i}>
                $
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- protocol / features ---------------- */}
      <section className="section wrap" id="protocol">
        <div className="section-head reveal">
          <span className="eyebrow">The protocol</span>
          <h2>
            Built on <span className="it">battle-tested</span> cryptography.
          </h2>
          <p>
            A fixed-denomination shielded pool per amount, modelled on the Tornado construction,
            adapted for the USDC ERC-20 token.
          </p>
        </div>
        <div className="features">
          <Feature icon="◈" title="Poseidon Merkle tree" delay={0}>
            Deposits are leaves in an on-chain Merkle tree with a rolling 30-root history, hashed
            with the ZK-friendly Poseidon function.
          </Feature>
          <Feature icon="⊡" title="Groth16 proofs" delay={0.05}>
            Withdrawals are verified by a succinct Groth16 SNARK generated locally in your browser —
            secrets never leave the page.
          </Feature>
          <Feature icon="◎" title="Fixed denominations" delay={0.1}>
            100 / 1,000 / 10,000 USDC pools. Uniform amounts are what make the anonymity set
            meaningful.
          </Feature>
          <Feature icon="⚿" title="No admin, no custody" delay={0}>
            No owner, pause, upgrade, or recovery function. Funds can only ever move via a valid
            withdrawal proof.
          </Feature>
          <Feature icon="⇄" title="Optional relayers" delay={0.05}>
            Withdraw to a brand-new address with no ETH by paying a relayer a USDC fee — the
            recipient stays bound inside the proof.
          </Feature>
          <Feature icon="❖" title="Nullifier spend-guard" delay={0.1}>
            Each note can be spent exactly once. A revealed nullifier hash marks it permanently
            spent on-chain.
          </Feature>
        </div>
      </section>

      {/* ---------------- security ---------------- */}
      <section className="section wrap" id="security">
        <div className="section-head reveal">
          <span className="eyebrow">Security &amp; compliance</span>
          <h2>
            Powerful — and <span className="it">your responsibility</span>.
          </h2>
          <p>
            This is unaudited, experimental privacy software. Understand the trust assumptions
            before you touch real funds.
          </p>
        </div>
        <div className="sec-panel">
          <div className="sec-card reveal">
            <ul className="sec-list">
              <li>
                <span className="dot" />
                <span>
                  <b>Trusted setup.</b> The Groth16 proving artifacts come from a ceremony you
                  didn&rsquo;t run. Re-run it before production.
                </span>
              </li>
              <li>
                <span className="dot" />
                <span>
                  <b>Lose your note, lose your funds.</b> Withdrawals are irreversible. There is no
                  reset and no support.
                </span>
              </li>
              <li>
                <span className="dot" />
                <span>
                  <b>Privacy isn&rsquo;t automatic.</b> Reusing addresses, or correlating timing and
                  amounts, can de-anonymize you.
                </span>
              </li>
              <li>
                <span className="dot" />
                <span>
                  <b>Get an audit.</b> Do not deploy to mainnet with real funds without an
                  independent professional review.
                </span>
              </li>
            </ul>
          </div>
          <div className="compliance reveal">
            <h4>Legal notice</h4>
            <p>
              Provided for research and educational purposes, “as is”, with no warranty. Privacy
              tools may be restricted or regulated where you live, and interacting with certain
              pools may carry sanctions exposure.
            </p>
            <p>
              <b>You</b> — not the authors — are responsible for complying with all applicable laws,
              including AML/KYC, sanctions (e.g. OFAC), securities, and tax obligations.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- FAQ ---------------- */}
      <section className="section wrap" id="faq">
        <div className="section-head reveal">
          <span className="eyebrow">FAQ</span>
          <h2>
            Questions, <span className="it">answered</span>.
          </h2>
        </div>
        <div className="faq reveal">
          {[
            [
              'Can anyone — including you — freeze or take my funds?',
              'No. The pool contract has no owner, admin, pause, upgrade, or recovery function. Funds can only leave through a valid zero-knowledge withdrawal proof that you generate.',
            ],
            [
              'What happens if I lose my note?',
              'The funds are unrecoverable. The note holds the only secrets that can produce a valid withdrawal proof. There is no backup, reset, or support channel — save it offline.',
            ],
            [
              'How is the link between deposit and withdrawal broken?',
              'On deposit you publish only a hash (commitment). On withdrawal you prove, in zero knowledge, that you know the secrets behind one of the many commitments in the pool — without revealing which — so observers can’t match the two.',
            ],
            [
              'Why fixed denominations?',
              'Uniform amounts make every deposit indistinguishable. If amounts varied, they could be matched by value, collapsing the anonymity set.',
            ],
            [
              'Is this safe to use on mainnet today?',
              'Treat it as experimental and unaudited. Test on a fork or testnet, and get an independent audit (and re-run the trusted setup) before using real funds.',
            ],
          ].map(([q, a]) => (
            <details className="faq-item" key={q}>
              <summary>
                {q}
                <span className="chev">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="section wrap">
        <div className="cta-band reveal">
          <div className="hero-aurora" style={{ height: '100%', inset: 0, opacity: 0.5 }} />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <h2>
              Ready to move USDC <span className="it">privately?</span>
            </h2>
            <p>Connect a wallet, deposit, and keep your transaction history to yourself.</p>
            <button className="btn btn-primary shine" onClick={onLaunch}>
              Launch app <span className="arrow">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="footer wrap">
        <div className="footer-top">
          <div className="brand">
            <CoinMark size={26} />
            <span className="wordmark">
              Aegis<span> Protocol</span>
            </span>
          </div>
          <div className="footer-links">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`}>
                {n.label}
              </a>
            ))}
            <a href="https://github.com" target="_blank" rel="noreferrer">
              Source
            </a>
          </div>
        </div>
        <p className="footer-disclaimer">
          Aegis Protocol is non-custodial, permissionless, experimental software. There is no admin,
          owner, or fund-recovery function; funds move only via valid zero-knowledge proofs.
        </p>
      </footer>
    </>
  );
}

function StatNum({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const isNum = /^\d+$/.test(value);
  const n = useCountUp(isNum ? Number(value) : 0, shown && isNum, 1100);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="v" ref={ref}>
      {isNum ? Math.round(n).toLocaleString('en-US') : value}
    </div>
  );
}

function Step({ n, title, delay, children }: { n: string; title: string; delay: number; children: ReactNode }) {
  return (
    <div className="step reveal" style={{ transitionDelay: `${delay}s` }}>
      <div className="num">{n}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  delay,
  children,
}: {
  icon: string;
  title: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <div className="feature reveal" style={{ transitionDelay: `${delay}s` }}>
      <div className="ic">{icon}</div>
      <h4>{title}</h4>
      <p>{children}</p>
    </div>
  );
}
