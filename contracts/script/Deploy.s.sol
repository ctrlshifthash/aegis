// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/UsdcPrivacyPool.sol";
import "../src/Verifier.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../test/mocks/MockUSDC.sol";

/// @notice Deploys the full stack: Poseidon hasher, Groth16 verifier, and one
///         UsdcPrivacyPool per denomination (100 / 1,000 / 10,000 USDC).
///
/// Token selection (three modes via the USDC_ADDRESS env var):
///   - Mainnet / mainnet-fork: set USDC_ADDRESS=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
///     (the canonical mainnet USDC, which also exists on a forked node).
///   - Testnet / local without real USDC: leave USDC_ADDRESS unset (or 0x0) and a
///     6-decimal MockUSDC is deployed and used instead.
///
/// The merkle tree height (20) and the proving artifacts are fixed by the circuit
/// and must NOT be changed without regenerating the trusted setup.
contract DeployScript is Script {
    uint32 internal constant MERKLE_TREE_HEIGHT = 20; // must match withdraw.circom

    // USDC has 6 decimals. Denominations in base units:
    uint256 internal constant USDC = 1e6;
    uint256 internal constant DENOM_100 = 100 * USDC; //   100,000,000
    uint256 internal constant DENOM_1K = 1_000 * USDC; // 1,000,000,000
    uint256 internal constant DENOM_10K = 10_000 * USDC; // 10,000,000,000

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);
        console.log("ETH balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Resolve the USDC token (real address, or a freshly deployed mock).
        address tokenAddr = vm.envOr("USDC_ADDRESS", address(0));
        if (tokenAddr == address(0)) {
            MockUSDC mock = new MockUSDC();
            tokenAddr = address(mock);
            console.log("USDC_ADDRESS unset -> deployed MockUSDC at:", tokenAddr);
        } else {
            console.log("Using existing USDC token at:", tokenAddr);
        }
        IERC20 token = IERC20(tokenAddr);

        // 2. Deploy the Poseidon hasher from its precompiled artifact.
        string memory poseidonJson = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(poseidonJson, ".bytecode");
        address poseidonAddr;
        assembly {
            poseidonAddr := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(poseidonAddr) { revert(0, 0) }
        }
        console.log("Poseidon deployed at:", poseidonAddr);

        // 3. Deploy the Groth16 verifier (same artifact as the original protocol;
        //    the circuit is token/denomination-agnostic so it is reused unchanged).
        Groth16Verifier verifier = new Groth16Verifier();
        console.log("Verifier deployed at:", address(verifier));

        // 4. Deploy one pool per denomination.
        UsdcPrivacyPool pool100 = _deployPool(verifier, IHasher(poseidonAddr), token, DENOM_100);
        UsdcPrivacyPool pool1k = _deployPool(verifier, IHasher(poseidonAddr), token, DENOM_1K);
        UsdcPrivacyPool pool10k = _deployPool(verifier, IHasher(poseidonAddr), token, DENOM_10K);

        vm.stopBroadcast();

        console.log("\n=== Deployment Summary ===");
        console.log("USDC token:", tokenAddr);
        console.log("Poseidon:  ", poseidonAddr);
        console.log("Verifier:  ", address(verifier));
        console.log("Pool 100 USDC:   ", address(pool100));
        console.log("Pool 1,000 USDC: ", address(pool1k));
        console.log("Pool 10,000 USDC:", address(pool10k));
        console.log("\nCopy these addresses into app/src/config.ts (and the token address).");
    }

    function _deployPool(
        Groth16Verifier verifier,
        IHasher hasher,
        IERC20 token,
        uint256 denomination
    ) internal returns (UsdcPrivacyPool pool) {
        pool = new UsdcPrivacyPool(
            IVerifier(address(verifier)),
            hasher,
            token,
            denomination,
            MERKLE_TREE_HEIGHT
        );
    }
}
