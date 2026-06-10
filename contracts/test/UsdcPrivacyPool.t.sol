// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/UsdcPrivacyPool.sol";
import "../src/IHasher.sol";
import "../src/IVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./mocks/MockHasher.sol";
import "./mocks/MockVerifier.sol";
import "./mocks/MockUSDC.sol";
import "./mocks/ReentrantRecipient.sol";

contract UsdcPrivacyPoolTest is Test {
    UsdcPrivacyPool public pool;
    MockHasher public hasher;
    MockVerifier public verifier;
    MockUSDC public usdc;

    // 100 USDC, 6 decimals.
    uint256 public constant DENOMINATION = 100_000_000;
    uint32 public constant LEVELS = 20;
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address relayer = makeAddr("relayer");

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address indexed to, bytes32 nullifierHash, address indexed relayer, uint256 fee);

    function _field(bytes memory data) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(data)) % FIELD_SIZE);
    }

    function setUp() public {
        hasher = new MockHasher();
        verifier = new MockVerifier();
        usdc = new MockUSDC();
        pool = new UsdcPrivacyPool(
            IVerifier(address(verifier)),
            IHasher(address(hasher)),
            IERC20(address(usdc)),
            DENOMINATION,
            LEVELS
        );

        // Fund depositors with USDC.
        usdc.mint(alice, 10 * DENOMINATION);
        usdc.mint(bob, 10 * DENOMINATION);
        // Give the relayer ETH for refund tests.
        vm.deal(relayer, 10 ether);
    }

    // ---------------------------------------------------------------- deployment

    function test_DeploymentState() public view {
        assertEq(pool.denomination(), DENOMINATION);
        assertEq(pool.levels(), LEVELS);
        assertEq(pool.nextIndex(), 0);
        assertEq(address(pool.verifier()), address(verifier));
        assertEq(address(pool.hasher()), address(hasher));
        assertEq(address(pool.token()), address(usdc));
    }

    function test_Constructor_RejectsZeroToken() public {
        vm.expectRevert("token is the zero address");
        new UsdcPrivacyPool(
            IVerifier(address(verifier)),
            IHasher(address(hasher)),
            IERC20(address(0)),
            DENOMINATION,
            LEVELS
        );
    }

    function test_Constructor_RejectsZeroDenomination() public {
        vm.expectRevert("denomination should be greater than 0");
        new UsdcPrivacyPool(
            IVerifier(address(verifier)),
            IHasher(address(hasher)),
            IERC20(address(usdc)),
            0,
            LEVELS
        );
    }

    // ------------------------------------------------------------------ deposits

    function test_Deposit_RequiresAllowance() public {
        bytes32 commitment = _field("commitment-1");
        // No approve() call -> transferFrom must revert (insufficient allowance).
        vm.prank(alice);
        vm.expectRevert();
        pool.deposit(commitment);

        // State unchanged.
        assertEq(pool.nextIndex(), 0);
        assertEq(usdc.balanceOf(address(pool)), 0);
    }

    function test_Deposit_Success_PullsExactDenomination() public {
        bytes32 commitment = _field("commitment-1");

        vm.startPrank(alice);
        usdc.approve(address(pool), DENOMINATION);

        vm.expectEmit(true, false, false, false);
        emit Deposit(commitment, 0, block.timestamp);
        pool.deposit(commitment);
        vm.stopPrank();

        assertEq(pool.nextIndex(), 1);
        assertEq(pool.commitments(commitment), true);
        assertEq(usdc.balanceOf(address(pool)), DENOMINATION);
        assertEq(usdc.balanceOf(alice), 10 * DENOMINATION - DENOMINATION);
    }

    function test_Deposit_PullsExactlyDenomination_EvenWithLargerApproval() public {
        bytes32 commitment = _field("commitment-1");
        vm.startPrank(alice);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(commitment);
        vm.stopPrank();

        // Only the denomination was pulled, not the full approval.
        assertEq(usdc.balanceOf(address(pool)), DENOMINATION);
    }

    function test_Deposit_Fails_DuplicateCommitment() public {
        bytes32 commitment = _field("commitment-1");

        vm.startPrank(alice);
        usdc.approve(address(pool), DENOMINATION);
        pool.deposit(commitment);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(pool), DENOMINATION);
        vm.expectRevert("The commitment has been submitted");
        pool.deposit(commitment);
        vm.stopPrank();
    }

    function test_MultipleDeposits() public {
        vm.startPrank(alice);
        usdc.approve(address(pool), 5 * DENOMINATION);
        for (uint256 i = 0; i < 5; i++) {
            bytes32 commitment = _field(abi.encodePacked("commitment-", i));
            pool.deposit(commitment);
        }
        vm.stopPrank();

        assertEq(pool.nextIndex(), 5);
        assertEq(usdc.balanceOf(address(pool)), 5 * DENOMINATION);
    }

    // --------------------------------------------------------------- withdrawals

    function _depositAs(address who, bytes32 commitment) internal {
        vm.startPrank(who);
        usdc.approve(address(pool), DENOMINATION);
        pool.deposit(commitment);
        vm.stopPrank();
    }

    function test_Withdraw_TransfersUsdcToRecipient() public {
        _depositAs(alice, _field("commitment-1"));

        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");
        uint256 fee = 1_000_000; // 1 USDC relayer fee

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 relayerBefore = usdc.balanceOf(relayer);

        vm.expectEmit(true, true, false, true);
        emit Withdrawal(bob, nullifierHash, relayer, fee);
        pool.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), fee, 0);

        assertEq(usdc.balanceOf(bob), bobBefore + DENOMINATION - fee);
        assertEq(usdc.balanceOf(relayer), relayerBefore + fee);
        assertEq(usdc.balanceOf(address(pool)), 0);
        assertTrue(pool.nullifierHashes(nullifierHash));
        assertTrue(pool.isSpent(nullifierHash));
    }

    function test_Withdraw_NoFee_PaysFullDenomination() public {
        _depositAs(alice, _field("commitment-1"));
        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        uint256 bobBefore = usdc.balanceOf(bob);
        pool.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);

        assertEq(usdc.balanceOf(bob), bobBefore + DENOMINATION);
        assertEq(usdc.balanceOf(relayer), 0);
    }

    function test_Withdraw_Fails_DoubleSpend() public {
        _depositAs(alice, _field("commitment-1"));
        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        pool.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);

        vm.expectRevert("The note has been already spent");
        pool.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);
    }

    function test_Withdraw_Fails_InvalidRoot() public {
        bytes32 fakeRoot = _field("fake-root");
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.expectRevert("Cannot find your merkle root");
        pool.withdraw(pA, pB, pC, fakeRoot, nullifierHash, payable(bob), payable(relayer), 0, 0);
    }

    function test_Withdraw_Fails_InvalidProof() public {
        _depositAs(alice, _field("commitment-1"));
        verifier.setShouldVerify(false);

        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.expectRevert("Invalid withdraw proof");
        pool.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0);
    }

    function test_Withdraw_Fails_FeeExceedsDenomination() public {
        _depositAs(alice, _field("commitment-1"));
        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.expectRevert("Fee exceeds transfer value");
        pool.withdraw(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), DENOMINATION + 1, 0);
    }

    // ------------------------------------------------------------ ETH gas refund

    function test_Withdraw_Refund_ForwardsEthToRecipient() public {
        _depositAs(alice, _field("commitment-1"));
        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");
        uint256 refund = 0.01 ether;

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        uint256 bobEthBefore = bob.balance;
        uint256 bobUsdcBefore = usdc.balanceOf(bob);

        // Relayer submits and funds the ETH refund via msg.value.
        vm.prank(relayer);
        pool.withdraw{value: refund}(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, refund);

        assertEq(bob.balance, bobEthBefore + refund);
        assertEq(usdc.balanceOf(bob), bobUsdcBefore + DENOMINATION);
    }

    function test_Withdraw_Fails_RefundMsgValueMismatch() public {
        _depositAs(alice, _field("commitment-1"));
        bytes32 root = pool.getLastRoot();
        bytes32 nullifierHash = _field("nullifier-1");

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        vm.prank(relayer);
        vm.expectRevert("Incorrect refund amount received by the contract");
        // Declares refund of 0.01 ether but sends nothing.
        pool.withdraw{value: 0}(pA, pB, pC, root, nullifierHash, payable(bob), payable(relayer), 0, 0.01 ether);
    }

    // -------------------------------------------------------------- reentrancy

    function test_Withdraw_ReentrancyIsBlocked() public {
        // Two deposits so the pool holds enough for two payouts if reentrancy worked.
        _depositAs(alice, _field("commitment-1"));
        _depositAs(bob, _field("commitment-2"));

        bytes32 root = pool.getLastRoot();
        bytes32 nullifier1 = _field("nullifier-1");
        bytes32 nullifier2 = _field("nullifier-2");

        ReentrantRecipient attacker = new ReentrantRecipient(pool);
        attacker.arm(root, nullifier2);

        uint[2] memory pA;
        uint[2][2] memory pB;
        uint[2] memory pC;

        uint256 refund = 0.01 ether;

        // Outer withdraw sends an ETH refund -> triggers attacker.receive() -> reentry.
        vm.prank(relayer);
        pool.withdraw{value: refund}(
            pA, pB, pC, root, nullifier1, payable(address(attacker)), payable(relayer), 0, refund
        );

        // The attacker tried to re-enter but ReentrancyGuard blocked it.
        assertTrue(attacker.reentryAttempted());
        assertFalse(attacker.reentrySucceeded());

        // Only ONE denomination was paid out; the second note is untouched.
        assertEq(usdc.balanceOf(address(attacker)), DENOMINATION);
        assertEq(usdc.balanceOf(address(pool)), DENOMINATION); // one deposit remains
        assertTrue(pool.isSpent(nullifier1));
        assertFalse(pool.isSpent(nullifier2));
    }
}
