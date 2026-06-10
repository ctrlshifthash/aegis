// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../src/IHasher.sol";

// Mock hasher for testing. Returns keccak256 mod FIELD_SIZE instead of Poseidon.
// Production uses real Poseidon contract.
contract MockHasher is IHasher {
    uint256 constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function poseidon(bytes32[2] calldata inputs) external pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encodePacked(inputs[0], inputs[1]))) % FIELD_SIZE);
    }
}
