// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/UsdcPrivacyPool.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";
import "../src/Verifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./mocks/MockUSDC.sol";

/// @notice End-to-end test against the REAL Poseidon hasher and REAL Groth16
///         verifier using a pre-generated proof fixture. This proves the existing
///         (unmodified) circuit + verifier artifacts are token-agnostic and work
///         unchanged for the ERC-20 USDC pool: the same proof that was generated
///         for the original ETH protocol verifies here and pays out USDC.
contract UsdcPrivacyPoolIntegrationTest is Test {
    UsdcPrivacyPool public pool;
    IHasher public poseidon;
    Groth16Verifier public verifier;
    MockUSDC public usdc;

    uint256 public constant DENOMINATION = 100_000_000; // 100 USDC (6 decimals)
    uint32 public constant LEVELS = 20;

    address alice = makeAddr("alice");
    // The proof fixture hardcodes recipient = 0xdEaD (57005), relayer = 0x01, fee = 0, refund = 0.
    address constant RECIPIENT = 0x000000000000000000000000000000000000dEaD;
    address constant RELAYER = 0x0000000000000000000000000000000000000001;

    function setUp() public {
        // Deploy real Poseidon from the precompiled artifact.
        string memory poseidonJson = vm.readFile("poseidon-artifact/PoseidonT3.json");
        bytes memory bytecode = vm.parseJsonBytes(poseidonJson, ".bytecode");
        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
            if iszero(deployed) { revert(0, 0) }
        }
        poseidon = IHasher(deployed);

        verifier = new Groth16Verifier();
        usdc = new MockUSDC();

        pool = new UsdcPrivacyPool(
            IVerifier(address(verifier)),
            poseidon,
            IERC20(address(usdc)),
            DENOMINATION,
            LEVELS
        );

        usdc.mint(alice, 10 * DENOMINATION);
    }

    function test_FullFlowWithRealProof_PaysUsdc() public {
        string memory json = vm.readFile("circuits/build/test-proof.json");

        uint256 nullifier = vm.parseJsonUint(json, ".input.nullifier");
        uint256 secret = vm.parseJsonUint(json, ".input.secret");

        // Recompute the commitment on-chain with the real Poseidon hasher.
        bytes32[2] memory hashInput;
        hashInput[0] = bytes32(nullifier);
        hashInput[1] = bytes32(secret);
        bytes32 commitment = poseidon.poseidon(hashInput);

        // Deposit USDC against the commitment (approve + deposit).
        vm.startPrank(alice);
        usdc.approve(address(pool), DENOMINATION);
        pool.deposit(commitment);
        vm.stopPrank();

        // The on-chain root must equal the root the proof was built against.
        uint256 expectedRoot = vm.parseJsonUint(json, ".publicSignals[0]");
        assertEq(uint256(pool.getLastRoot()), expectedRoot, "on-chain root must match proof root");

        // Load the real proof.
        uint256[2] memory pA;
        pA[0] = vm.parseJsonUint(json, ".proof.pi_a[0]");
        pA[1] = vm.parseJsonUint(json, ".proof.pi_a[1]");

        uint256[2][2] memory pB;
        pB[0][0] = vm.parseJsonUint(json, ".proof.pi_b[0][1]");
        pB[0][1] = vm.parseJsonUint(json, ".proof.pi_b[0][0]");
        pB[1][0] = vm.parseJsonUint(json, ".proof.pi_b[1][1]");
        pB[1][1] = vm.parseJsonUint(json, ".proof.pi_b[1][0]");

        uint256[2] memory pC;
        pC[0] = vm.parseJsonUint(json, ".proof.pi_c[0]");
        pC[1] = vm.parseJsonUint(json, ".proof.pi_c[1]");

        uint256 nullifierHash = vm.parseJsonUint(json, ".publicSignals[1]");

        uint256 recipientBefore = usdc.balanceOf(RECIPIENT);

        pool.withdraw(
            pA, pB, pC,
            bytes32(expectedRoot),
            bytes32(nullifierHash),
            payable(RECIPIENT),
            payable(RELAYER),
            0, // fee
            0  // refund
        );

        assertEq(usdc.balanceOf(RECIPIENT), recipientBefore + DENOMINATION, "recipient should receive full USDC denomination");
        assertEq(usdc.balanceOf(address(pool)), 0, "pool should be empty after withdraw");
        assertTrue(pool.isSpent(bytes32(nullifierHash)), "nullifier should be spent");
    }
}
