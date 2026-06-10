// End-to-end test of the FRONTEND's cryptographic flow against a live node.
// It replicates exactly what useDeposit.ts and useWithdraw.ts do — commitment
// generation (circomlibjs Poseidon), Merkle-path rebuild, snarkjs Groth16 proof
// — and runs a real deposit -> withdraw, asserting USDC reaches the recipient.
//
// Run: node scripts/e2e.mjs   (needs a local anvil + a fresh deploy; see runner)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, createPublicClient, http, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RPC = 'http://127.0.0.1:8545';
const KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // anvil #0
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // anvil #1 (fresh)
const DENOM = 100_000000n; // 100 USDC (6 decimals)
const LEVELS = 20;

const ERC20 = [
  parseAbiItem('function mint(address to, uint256 amount)'),
  parseAbiItem('function approve(address spender, uint256 amount) returns (bool)'),
  parseAbiItem('function balanceOf(address) view returns (uint256)'),
];
const POOL = [
  parseAbiItem('function deposit(bytes32 _commitment)'),
  parseAbiItem(
    'function withdraw(uint256[2] _pA, uint256[2][2] _pB, uint256[2] _pC, bytes32 _root, bytes32 _nullifierHash, address _recipient, address _relayer, uint256 _fee, uint256 _refund) payable',
  ),
  parseAbiItem('function getLastRoot() view returns (bytes32)'),
  parseAbiItem('function zeros(uint256) view returns (bytes32)'),
  parseAbiItem('function nullifierHashes(bytes32) view returns (bool)'),
  parseAbiItem('function token() view returns (address)'),
  parseAbiItem('event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)'),
];

function readDeploy() {
  const p = path.join(__dirname, '..', '..', 'contracts', 'broadcast', 'Deploy.s.sol', '31337', 'run-latest.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const txs = j.transactions;
  const usdc = txs.find((t) => t.contractName === 'MockUSDC')?.contractAddress;
  const pool = txs.find((t) => t.contractName === 'UsdcPrivacyPool')?.contractAddress; // first = 100 USDC
  if (!usdc || !pool) throw new Error('Could not find MockUSDC / UsdcPrivacyPool in broadcast');
  return { usdc, pool };
}

function randomFieldBytes(n) {
  const a = crypto.getRandomValues(new Uint8Array(n));
  return BigInt('0x' + [...a].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[36m• ${m}\x1b[0m`);

async function main() {
  const { usdc, pool } = readDeploy();
  console.log(`USDC: ${usdc}\nPool: ${pool}`);

  const account = privateKeyToAccount(KEY);
  const wallet = createWalletClient({ account, chain: foundry, transport: http(RPC) });
  const pub = createPublicClient({ chain: foundry, transport: http(RPC) });

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // sanity: the pool's token must be our mock USDC
  const onchainToken = await pub.readContract({ address: pool, abi: POOL, functionName: 'token' });
  if (onchainToken.toLowerCase() !== usdc.toLowerCase()) throw new Error('pool.token() mismatch');
  ok('pool.token() == MockUSDC');

  // ---- DEPOSIT (mirrors useDeposit.ts) ----
  step('Deposit: generate note + commitment, approve, deposit');
  await wallet.writeContract({ address: usdc, abi: ERC20, functionName: 'mint', args: [account.address, DENOM] });
  const nullifier = randomFieldBytes(31);
  const secret = randomFieldBytes(31);
  const commitmentBn = poseidon([F.e(nullifier.toString()), F.e(secret.toString())]);
  const commitment = ('0x' + F.toString(commitmentBn, 16).padStart(64, '0'));
  ok(`commitment = ${commitment.slice(0, 18)}…`);

  const aHash = await wallet.writeContract({ address: usdc, abi: ERC20, functionName: 'approve', args: [pool, DENOM] });
  await pub.waitForTransactionReceipt({ hash: aHash });
  ok('approved exact denomination');

  const dHash = await wallet.writeContract({ address: pool, abi: POOL, functionName: 'deposit', args: [commitment] });
  await pub.waitForTransactionReceipt({ hash: dHash });
  ok('deposited 100 USDC');

  const poolBal = await pub.readContract({ address: usdc, abi: ERC20, functionName: 'balanceOf', args: [pool] });
  if (poolBal !== DENOM) throw new Error(`pool balance ${poolBal} != ${DENOM}`);
  ok(`pool holds ${Number(poolBal) / 1e6} USDC`);

  // ---- WITHDRAW (mirrors useWithdraw.ts) ----
  step('Withdraw: rebuild Merkle path, prove, submit');
  const logs = await pub.getLogs({
    address: pool,
    event: parseAbiItem('event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)'),
    fromBlock: 0n,
    toBlock: 'latest',
  });
  const leaves = logs.map((l) => BigInt(l.args.commitment));
  const leafIndex = leaves.findIndex((l) => l === BigInt(commitment));
  if (leafIndex === -1) throw new Error('commitment not found in logs');
  ok(`found our leaf at index ${leafIndex} (${leaves.length} total)`);

  const zeros = [];
  for (let i = 0; i < LEVELS; i++) {
    const z = await pub.readContract({ address: pool, abi: POOL, functionName: 'zeros', args: [BigInt(i)] });
    zeros.push(BigInt(z));
  }

  const pathElements = [];
  const pathIndices = [];
  let currentIndex = leafIndex;
  let currentLevel = [...leaves];
  for (let i = 0; i < LEVELS; i++) {
    const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
    const sibling = siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : zeros[i];
    pathElements.push(F.toString(F.e(sibling.toString())));
    pathIndices.push(currentIndex % 2);
    const nextLevel = [];
    for (let j = 0; j < currentLevel.length; j += 2) {
      const left = currentLevel[j];
      const right = j + 1 < currentLevel.length ? currentLevel[j + 1] : zeros[i];
      const parent = poseidon([F.e(left.toString()), F.e(right.toString())]);
      nextLevel.push(BigInt(F.toString(parent)));
    }
    currentLevel = nextLevel.length ? nextLevel : [zeros[i + 1] ?? 0n];
    currentIndex = Math.floor(currentIndex / 2);
  }

  const root = await pub.readContract({ address: pool, abi: POOL, functionName: 'getLastRoot' });
  const computedRoot = '0x' + BigInt(currentLevel[0]).toString(16).padStart(64, '0');
  if (BigInt(root) !== BigInt(computedRoot)) {
    throw new Error(`JS-rebuilt root ${computedRoot} != on-chain root ${root}`);
  }
  ok(`JS-rebuilt Merkle root matches on-chain root`);

  const nullifierHashBn = poseidon([F.e(nullifier.toString())]);
  const nullifierHash = ('0x' + F.toString(nullifierHashBn, 16).padStart(64, '0'));

  const input = {
    root: BigInt(root).toString(),
    nullifierHash: F.toString(nullifierHashBn),
    recipient: BigInt(RECIPIENT).toString(),
    relayer: '0',
    fee: '0',
    refund: '0',
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    pathElements,
    pathIndices,
  };

  const wasm = path.join(__dirname, '..', 'public', 'circuits', 'withdraw.wasm');
  const zkey = path.join(__dirname, '..', 'public', 'circuits', 'withdraw_final.zkey');
  const t0 = Date.now();
  const { proof } = await snarkjs.groth16.fullProve(input, wasm, zkey);
  ok(`generated Groth16 proof in ${Date.now() - t0}ms`);

  const pA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const pB = [
    [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
    [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
  ];
  const pC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];

  const beforeBal = await pub.readContract({ address: usdc, abi: ERC20, functionName: 'balanceOf', args: [RECIPIENT] });

  const wHash = await wallet.writeContract({
    address: pool,
    abi: POOL,
    functionName: 'withdraw',
    args: [pA, pB, pC, root, nullifierHash, RECIPIENT, '0x0000000000000000000000000000000000000000', 0n, 0n],
    value: 0n,
  });
  await pub.waitForTransactionReceipt({ hash: wHash });
  ok('withdraw tx mined');

  const afterBal = await pub.readContract({ address: usdc, abi: ERC20, functionName: 'balanceOf', args: [RECIPIENT] });
  const spent = await pub.readContract({ address: pool, abi: POOL, functionName: 'nullifierHashes', args: [nullifierHash] });

  if (afterBal - beforeBal !== DENOM) throw new Error(`recipient got ${afterBal - beforeBal}, expected ${DENOM}`);
  if (!spent) throw new Error('nullifier not marked spent');

  step('RESULT');
  ok(`recipient received ${Number(afterBal - beforeBal) / 1e6} USDC at a fresh address`);
  ok('nullifier marked spent (double-spend now impossible)');
  console.log('\n\x1b[32m\x1b[1mFULL FRONTEND CRYPTO FLOW WORKS END-TO-END ✓\x1b[0m');
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error('\n\x1b[31mE2E FAILED:\x1b[0m', e);
    process.exit(1);
  },
);
