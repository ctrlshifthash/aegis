// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/UsdcPrivacyPool.sol";

/// @notice Malicious recipient that attempts to re-enter `withdraw` from its ETH
///         refund callback. Used to prove `nonReentrant` blocks reentrancy.
contract ReentrantRecipient {
    UsdcPrivacyPool public immutable pool;

    // Stored args for the reentrant call.
    uint[2] internal pA;
    uint[2][2] internal pB;
    uint[2] internal pC;
    bytes32 internal root;
    bytes32 internal nullifierHash2;

    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(UsdcPrivacyPool _pool) {
        pool = _pool;
    }

    function arm(bytes32 _root, bytes32 _nullifierHash2) external {
        root = _root;
        nullifierHash2 = _nullifierHash2;
    }

    receive() external payable {
        if (!reentryAttempted) {
            reentryAttempted = true;
            // Try to re-enter with a *different* (valid) nullifier. Must be blocked
            // by ReentrancyGuard. We swallow the revert so the outer call can finish.
            try
                pool.withdraw(
                    pA, pB, pC,
                    root,
                    nullifierHash2,
                    payable(address(this)),
                    payable(address(0)),
                    0,
                    0
                )
            {
                reentrySucceeded = true;
            } catch {
                reentrySucceeded = false;
            }
        }
    }
}
