// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";
import {IHasher} from "./IHasher.sol";
import {IVerifier} from "./IVerifier.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title  UsdcPrivacyPool
/// @notice Fixed-denomination ERC-20 (USDC) shielded pool. Users deposit an exact
///         amount of USDC against a Poseidon commitment, then later withdraw the
///         same amount to any address by proving (in zero knowledge) knowledge of
///         a note whose commitment is in the Merkle tree, without revealing which.
/// @dev    There is NO admin, owner, pause, upgrade, or fund-recovery function by
///         design. Once deposited, funds can ONLY leave via a valid withdraw proof.
///         The contract never has custody it can move unilaterally.
contract UsdcPrivacyPool is MerkleTreeWithHistory, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IVerifier public immutable verifier;
    /// @notice The ERC-20 token this pool accepts (USDC). Immutable.
    IERC20 public immutable token;
    /// @notice Fixed deposit/withdraw amount, in the token's base units (USDC = 6 decimals).
    uint256 public immutable denomination;

    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address indexed to, bytes32 nullifierHash, address indexed relayer, uint256 fee);

    /// @param _verifier      Groth16 verifier for the withdraw circuit.
    /// @param _hasher        Poseidon hasher used by the Merkle tree.
    /// @param _token         ERC-20 token accepted by this pool (USDC on mainnet).
    /// @param _denomination  Exact deposit amount in token base units (e.g. 100 USDC = 100_000_000).
    /// @param _merkleTreeHeight Tree height (must match the circuit: 20).
    constructor(
        IVerifier _verifier,
        IHasher _hasher,
        IERC20 _token,
        uint256 _denomination,
        uint32 _merkleTreeHeight
    ) MerkleTreeWithHistory(_merkleTreeHeight, _hasher) {
        require(_denomination > 0, "denomination should be greater than 0");
        require(address(_token) != address(0), "token is the zero address");
        verifier = _verifier;
        token = _token;
        denomination = _denomination;
    }

    /// @notice Deposit exactly `denomination` USDC against `_commitment`.
    /// @dev    Caller MUST have approved this contract for at least `denomination`
    ///         USDC beforehand (ERC-20 allowance). The exact amount is enforced by
    ///         transferring precisely `denomination`; there is no msg.value path.
    function deposit(bytes32 _commitment) external nonReentrant {
        require(!commitments[_commitment], "The commitment has been submitted");

        // Effects first (checks-effects-interactions): insert the leaf and record
        // the commitment before pulling tokens.
        uint32 insertedIndex = _insert(_commitment);
        commitments[_commitment] = true;

        // Pull exactly the denomination from the depositor. SafeERC20 reverts on
        // failure / non-standard return values. Note: a fee-on-transfer token would
        // break the fixed-denomination invariant; USDC is not fee-on-transfer.
        token.safeTransferFrom(msg.sender, address(this), denomination);

        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    /// @notice Withdraw `denomination` USDC (minus relayer `_fee`) to `_recipient`.
    /// @param _root          A Merkle root the proof was built against (must be in history).
    /// @param _nullifierHash Spend-once tag derived from the note's nullifier.
    /// @param _recipient     Destination of the USDC.
    /// @param _relayer       Optional relayer that receives `_fee` USDC for submitting the tx.
    /// @param _fee           Relayer fee in USDC base units (<= denomination).
    /// @param _refund        Optional ETH (wei) forwarded to a fresh recipient for gas;
    ///                       must equal msg.value and is supplied by the relayer.
    function withdraw(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        bytes32 _root,
        bytes32 _nullifierHash,
        address payable _recipient,
        address payable _relayer,
        uint256 _fee,
        uint256 _refund
    ) external payable nonReentrant {
        require(_fee <= denomination, "Fee exceeds transfer value");
        require(!nullifierHashes[_nullifierHash], "The note has been already spent");
        require(isKnownRoot(_root), "Cannot find your merkle root");
        require(msg.value == _refund, "Incorrect refund amount received by the contract");

        require(
            verifier.verifyProof(
                _pA,
                _pB,
                _pC,
                [
                    uint256(_root),
                    uint256(_nullifierHash),
                    uint256(uint160(address(_recipient))),
                    uint256(uint160(address(_relayer))),
                    _fee,
                    _refund
                ]
            ),
            "Invalid withdraw proof"
        );

        // Effects: mark spent before any external interaction.
        nullifierHashes[_nullifierHash] = true;

        // Interactions: pay out USDC.
        token.safeTransfer(_recipient, denomination - _fee);
        if (_fee > 0) {
            token.safeTransfer(_relayer, _fee);
        }

        // Optional ETH gas refund for a fresh recipient, funded by the relayer's msg.value.
        if (_refund > 0) {
            (bool success, ) = _recipient.call{value: _refund}("");
            if (!success) {
                // If the recipient cannot receive ETH, return the refund to the relayer
                // rather than locking it. The USDC payout above already succeeded.
                (bool relayerSuccess, ) = _relayer.call{value: _refund}("");
                require(relayerSuccess, "refund return to relayer failed");
            }
        }

        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    /// @notice Whether a note (by nullifier hash) has already been withdrawn.
    function isSpent(bytes32 _nullifierHash) external view returns (bool) {
        return nullifierHashes[_nullifierHash];
    }
}
