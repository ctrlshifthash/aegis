// SPDX-License-Identifier: MIT
//
// Derived from the Tornado-Cash-style MerkleTreeWithHistory pattern.
// See NOTICE for upstream attribution. The numeric ZERO_VALUE and zeros(i)
// constants below are cryptographic Poseidon zero-hashes and are kept as-is so
// that empty subtrees remain internally consistent with the proving artifacts.
pragma solidity ^0.8.20;

import {IHasher} from "./IHasher.sol";

contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // ZERO_VALUE is a fixed domain separator used as the empty-leaf value.
    // It is < FIELD_SIZE and has no preimage that a user could know as a commitment.
    uint256 public constant ZERO_VALUE = 21663839004416932945382355908790599225266501822907911457504978515578255421292;

    IHasher public immutable hasher;
    uint32 public immutable levels;

    // filledSubtrees and roots could be bytes32[size], but using mappings makes it cheaper
    mapping(uint256 => bytes32) public filledSubtrees;
    mapping(uint256 => bytes32) public roots;
    uint32 public constant ROOT_HISTORY_SIZE = 30;
    uint32 public currentRootIndex = 0;
    uint32 public nextIndex = 0;

    constructor(uint32 _levels, IHasher _hasher) {
        require(_levels > 0, "_levels should be greater than zero");
        require(_levels < 32, "_levels should be less than 32");
        levels = _levels;
        hasher = _hasher;

        for (uint32 i = 0; i < _levels; i++) {
            filledSubtrees[i] = zeros(i);
        }
        roots[0] = zeros(_levels - 1);
    }

    function hashLeftRight(bytes32 _left, bytes32 _right) public view returns (bytes32) {
        require(uint256(_left) < FIELD_SIZE, "_left should be inside the field");
        require(uint256(_right) < FIELD_SIZE, "_right should be inside the field");
        bytes32[2] memory input;
        input[0] = _left;
        input[1] = _right;
        return hasher.poseidon(input);
    }

    function _insert(bytes32 _leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        require(_nextIndex != uint32(2)**levels, "Merkle tree is full");
        uint32 currentIndex = _nextIndex;
        bytes32 currentLevelHash = _leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros(i);
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    function isKnownRoot(bytes32 _root) public view returns (bool) {
        if (_root == 0) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != _currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }

    // Pre-computed Poseidon zero hashes for the Merkle tree.
    // zeros(0) = ZERO_VALUE; zeros(i) = Poseidon(zeros(i-1), zeros(i-1)).
    function zeros(uint256 i) public pure returns (bytes32) {
        if (i == 0) return bytes32(uint256(21663839004416932945382355908790599225266501822907911457504978515578255421292)); // ZERO_VALUE
        if (i == 1) return bytes32(uint256(8995896153219992062710898675021891003404871425075198597897889079729967997688));
        if (i == 2) return bytes32(uint256(15126246733515326086631621937388047923581111613947275249184377560170833782629));
        if (i == 3) return bytes32(uint256(6404200169958188928270149728908101781856690902670925316782889389790091378414));
        if (i == 4) return bytes32(uint256(17903822129909817717122288064678017104411031693253675943446999432073303897479));
        if (i == 5) return bytes32(uint256(11423673436710698439362231088473903829893023095386581732682931796661338615804));
        if (i == 6) return bytes32(uint256(10494842461667482273766668782207799332467432901404302674544629280016211342367));
        if (i == 7) return bytes32(uint256(17400501067905286947724900644309270241576392716005448085614420258732805558809));
        if (i == 8) return bytes32(uint256(7924095784194248701091699324325620647610183513781643345297447650838438175245));
        if (i == 9) return bytes32(uint256(3170907381568164996048434627595073437765146540390351066869729445199396390350));
        if (i == 10) return bytes32(uint256(21224698076141654110749227566074000819685780865045032659353546489395159395031));
        if (i == 11) return bytes32(uint256(18113275293366123216771546175954550524914431153457717566389477633419482708807));
        if (i == 12) return bytes32(uint256(1952712013602708178570747052202251655221844679392349715649271315658568301659));
        if (i == 13) return bytes32(uint256(18071586466641072671725723167170872238457150900980957071031663421538421560166));
        if (i == 14) return bytes32(uint256(9993139859464142980356243228522899168680191731482953959604385644693217291503));
        if (i == 15) return bytes32(uint256(14825089209834329031146290681677780462512538924857394026404638992248153156554));
        if (i == 16) return bytes32(uint256(4227387664466178643628175945231814400524887119677268757709033164980107894508));
        if (i == 17) return bytes32(uint256(177945332589823419436506514313470826662740485666603469953512016396504401819));
        if (i == 18) return bytes32(uint256(4236715569920417171293504597566056255435509785944924295068274306682611080863));
        if (i == 19) return bytes32(uint256(8055374341341620501424923482910636721817757020788836089492629714380498049891));
        revert("Index out of bounds");
    }
}
