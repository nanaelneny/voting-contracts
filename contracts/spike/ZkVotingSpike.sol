// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

// Pull Semaphore's own contracts into the build so tests can deploy them locally.
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";

/**
 * @title ZkVotingSpike
 * @notice Throwaway proof-of-concept: anonymous voting with Semaphore.
 *
 * - Each election is a Semaphore group. Voters join with an "identity
 *   commitment" (a public value derived from a secret only they hold),
 *   not a wallet address.
 * - To vote, a voter makes a zero-knowledge proof in their browser:
 *   "I know the secret behind one of the commitments in this group",
 *   without revealing which one.
 * - scope = electionId, so each voter gets exactly one nullifier per
 *   election; Semaphore rejects a reused nullifier (no double voting).
 * - message = candidateId, and it is bound into the proof, so whoever
 *   submits the transaction (e.g. a gas-paying relayer) cannot change the vote.
 * - msg.sender is never used for voting, so the submitting account says
 *   nothing about who voted.
 */
contract ZkVotingSpike {
    ISemaphore public immutable semaphore;
    address public immutable admin;

    struct Election {
        uint256 groupId;
        uint256 candidateCount;
        bool open;
    }

    mapping(uint256 => Election) public elections;
    mapping(uint256 => mapping(uint256 => uint256)) public votes; // electionId => candidateId => count
    uint256 public electionCount;

    error NotAdmin();
    error NotOpen();
    error InvalidCandidate();
    error WrongScope();

    event AnonymousVote(uint256 indexed electionId, uint256 indexed candidateId, uint256 nullifier);

    constructor(ISemaphore _semaphore) {
        semaphore = _semaphore;
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    function createElection(uint256 candidateCount) external onlyAdmin returns (uint256 id) {
        id = ++electionCount;
        elections[id] = Election({groupId: semaphore.createGroup(), candidateCount: candidateCount, open: false});
    }

    function addVoters(uint256 electionId, uint256[] calldata identityCommitments) external onlyAdmin {
        semaphore.addMembers(elections[electionId].groupId, identityCommitments);
    }

    function open(uint256 electionId) external onlyAdmin {
        elections[electionId].open = true;
    }

    /// @notice Can be called by anyone (typically a relayer); the proof is what authorizes the vote.
    function vote(uint256 electionId, ISemaphore.SemaphoreProof calldata proof) external {
        Election storage e = elections[electionId];
        if (!e.open) revert NotOpen();
        if (proof.scope != electionId) revert WrongScope();
        if (proof.message >= e.candidateCount) revert InvalidCandidate();

        // Reverts on an invalid proof, a non-member, or a reused nullifier.
        semaphore.validateProof(e.groupId, proof);

        votes[electionId][proof.message] += 1;
        emit AnonymousVote(electionId, proof.message, proof.nullifier);
    }
}
