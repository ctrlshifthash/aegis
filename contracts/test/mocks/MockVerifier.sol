// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/IVerifier.sol";

// Mock verifier for testing. Always returns true.
// Production uses real Groth16 verifier generated from circuit.
contract MockVerifier is IVerifier {
    bool public shouldVerify = true;

    function setShouldVerify(bool _v) external {
        shouldVerify = _v;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[6] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}
