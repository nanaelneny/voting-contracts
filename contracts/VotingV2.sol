// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/**
 * @title VotingV2
 * @notice Multi-election, anonymous voting contract using Semaphore zero-knowledge proofs.
 *
 * Changes from the diploma version (Voting.sol):
 *  - Many elections live in one contract, each keyed by an id, instead of a
 *    single election that gets reset and overwritten.
 *  - Only registered voters can vote, and nobody can tell which voter cast
 *    which ballot. Each election is a Semaphore group of "identity
 *    commitments" (public values derived from a secret each voter keeps in
 *    their browser). To vote, a voter proves in zero knowledge that they own
 *    one of the commitments, without revealing which.
 *  - The contract never looks at msg.sender when counting a vote, so the
 *    transaction can be submitted by a relayer that pays the gas. The voter
 *    needs no wallet or ETH, and the submitting account reveals nothing.
 *  - Voting opens and closes on fixed timestamps set when the election is
 *    created. Once voting opens, the admin cannot add candidates, change the
 *    voter list, end voting early, or reset/delete the election.
 *  - Ties are reported as ties instead of silently picking the first candidate.
 *
 * How a ballot is protected:
 *  - scope = scopeOf(electionId). Each voter gets exactly one nullifier per
 *    election, so a second vote is rejected. Because the scope includes the
 *    chain id and this contract's address, nullifiers can't be linked across
 *    elections or deployments.
 *  - message = candidateId, which is bound into the proof, so whoever submits
 *    the transaction cannot change the voter's choice.
 *
 * Known limitation: proofs are receipts. A voter could show someone their
 * proof to demonstrate how they voted, so this does not stop vote-buying or
 * coercion (it is not "receipt-free").
 */
contract VotingV2 is Ownable {
    // ───────────────────────────── Types ─────────────────────────────

    struct Election {
        string title;
        uint256 offchainId;   // matches Elections.id in the SQL database
        uint64 startTime;     // voting opens (inclusive)
        uint64 endTime;       // voting closes (exclusive)
        uint256 groupId;      // Semaphore group holding the voters' identity commitments
        uint32 candidateCount;
        uint32 voterCount;    // number of registered voters (for turnout)
        uint256 totalVotes;
        bool finalized;
        bool cancelled;
    }

    struct Candidate {
        string name;
        uint256 voteCount;
    }

    enum Phase { Setup, Voting, Ended, Finalized, Cancelled }

    // ──────────────────────────── Storage ────────────────────────────

    ISemaphore public immutable semaphore;

    uint256 public electionCount;
    mapping(uint256 => Election) private _elections;
    mapping(uint256 => mapping(uint256 => Candidate)) private _candidates;
    mapping(uint256 => uint256[]) private _winners;

    /// @notice electionId => nullifier => used. Lets a voter check "have I voted?"
    ///         by computing their own nullifier, without revealing who they are.
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    uint32 public constant MAX_CANDIDATES = 50;

    // ──────────────────────────── Events ─────────────────────────────

    event ElectionCreated(uint256 indexed electionId, uint256 indexed offchainId, string title, uint64 startTime, uint64 endTime, uint256 groupId);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VotersAdded(uint256 indexed electionId, uint256 added, uint32 voterCount);
    event ElectionCancelled(uint256 indexed electionId);
    event VoteCast(uint256 indexed electionId, uint256 indexed candidateId, uint256 nullifier);
    event ElectionFinalized(uint256 indexed electionId, uint256[] winners, uint256 winningVotes, uint256 totalVotes);

    // ──────────────────────────── Errors ─────────────────────────────

    error ElectionNotFound(uint256 electionId);
    error WrongPhase(uint256 electionId, Phase current);
    error InvalidTimes();
    error InvalidCandidate(uint256 candidateId);
    error EmptyName();
    error TooManyCandidates();
    error NoCandidates();
    error NoVoterList();
    error AlreadyVoted();
    error WrongScope();

    constructor(address initialAdmin, ISemaphore _semaphore) Ownable(initialAdmin) {
        semaphore = _semaphore;
    }

    // ─────────────────────────── Modifiers ───────────────────────────

    modifier exists(uint256 electionId) {
        if (electionId == 0 || electionId > electionCount) revert ElectionNotFound(electionId);
        _;
    }

    modifier inPhase(uint256 electionId, Phase required) {
        Phase p = phase(electionId);
        if (p != required) revert WrongPhase(electionId, p);
        _;
    }

    // ───────────────────────── Admin: setup ──────────────────────────

    /// @notice Create an election and its Semaphore voter group. Ids start at 1.
    function createElection(
        string calldata title,
        uint256 offchainId,
        uint64 startTime,
        uint64 endTime
    ) external onlyOwner returns (uint256 electionId) {
        if (bytes(title).length == 0) revert EmptyName();
        if (startTime <= block.timestamp || endTime <= startTime) revert InvalidTimes();

        electionId = ++electionCount;
        Election storage e = _elections[electionId];
        e.title = title;
        e.offchainId = offchainId;
        e.startTime = startTime;
        e.endTime = endTime;
        e.groupId = semaphore.createGroup(); // this contract is the group admin

        emit ElectionCreated(electionId, offchainId, title, startTime, endTime, e.groupId);
    }

    function addCandidate(uint256 electionId, string calldata name)
        public
        onlyOwner
        exists(electionId)
        inPhase(electionId, Phase.Setup)
    {
        if (bytes(name).length == 0) revert EmptyName();
        Election storage e = _elections[electionId];
        if (e.candidateCount >= MAX_CANDIDATES) revert TooManyCandidates();

        uint256 candidateId = e.candidateCount++;
        _candidates[electionId][candidateId].name = name;
        emit CandidateAdded(electionId, candidateId, name);
    }

    function addCandidates(uint256 electionId, string[] calldata names) external {
        for (uint256 i = 0; i < names.length; i++) {
            addCandidate(electionId, names[i]);
        }
    }

    /// @notice Register voters by their identity commitments. Only before voting opens;
    ///         the voter list is frozen from then on. Duplicate commitments revert.
    function addVoters(uint256 electionId, uint256[] calldata identityCommitments)
        external
        onlyOwner
        exists(electionId)
        inPhase(electionId, Phase.Setup)
    {
        if (identityCommitments.length == 0) revert NoVoterList();
        Election storage e = _elections[electionId];
        semaphore.addMembers(e.groupId, identityCommitments);
        e.voterCount += uint32(identityCommitments.length);
        emit VotersAdded(electionId, identityCommitments.length, e.voterCount);
    }

    /// @notice Cancel an election that has not opened yet. Cannot be used once voting starts.
    function cancelElection(uint256 electionId)
        external
        onlyOwner
        exists(electionId)
        inPhase(electionId, Phase.Setup)
    {
        _elections[electionId].cancelled = true;
        emit ElectionCancelled(electionId);
    }

    // ─────────────────────────── Voting ──────────────────────────────

    /// @notice Cast an anonymous vote. Anyone may submit the proof (normally the relayer);
    ///         the proof itself is what authorizes the vote. proof.message is the candidate id.
    function vote(uint256 electionId, ISemaphore.SemaphoreProof calldata proof)
        external
        exists(electionId)
        inPhase(electionId, Phase.Voting)
    {
        Election storage e = _elections[electionId];
        if (e.candidateCount == 0) revert NoCandidates();
        if (e.voterCount == 0) revert NoVoterList();
        if (proof.scope != scopeOf(electionId)) revert WrongScope();
        if (proof.message >= e.candidateCount) revert InvalidCandidate(proof.message);
        if (nullifierUsed[electionId][proof.nullifier]) revert AlreadyVoted();

        // Reverts if the proof is invalid, the root isn't this group's, or the nullifier was used.
        semaphore.validateProof(e.groupId, proof);

        nullifierUsed[electionId][proof.nullifier] = true;
        _candidates[electionId][proof.message].voteCount += 1;
        e.totalVotes += 1;

        emit VoteCast(electionId, proof.message, proof.nullifier);
    }

    /// @notice Record the result once voting has closed. Anyone can call this,
    ///         so results do not depend on the admin acting.
    function finalize(uint256 electionId) external exists(electionId) inPhase(electionId, Phase.Ended) {
        Election storage e = _elections[electionId];
        uint256 best = 0;
        uint256[] storage winners = _winners[electionId];

        for (uint256 i = 0; i < e.candidateCount; i++) {
            uint256 votes = _candidates[electionId][i].voteCount;
            if (votes > best) {
                best = votes;
                delete _winners[electionId];
                winners.push(i);
            } else if (votes == best && votes > 0) {
                winners.push(i);
            }
        }

        e.finalized = true;
        emit ElectionFinalized(electionId, winners, best, e.totalVotes);
    }

    // ──────────────────────────── Views ──────────────────────────────

    /// @notice The Semaphore scope voters must prove against for this election.
    function scopeOf(uint256 electionId) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), electionId)));
    }

    function phase(uint256 electionId) public view exists(electionId) returns (Phase) {
        Election storage e = _elections[electionId];
        if (e.cancelled) return Phase.Cancelled;
        if (e.finalized) return Phase.Finalized;
        if (block.timestamp < e.startTime) return Phase.Setup;
        if (block.timestamp < e.endTime) return Phase.Voting;
        return Phase.Ended;
    }

    function getElection(uint256 electionId) external view exists(electionId) returns (Election memory) {
        return _elections[electionId];
    }

    function getCandidates(uint256 electionId) external view exists(electionId) returns (Candidate[] memory list) {
        uint256 n = _elections[electionId].candidateCount;
        list = new Candidate[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = _candidates[electionId][i];
        }
    }

    /// @notice Winning candidate ids. More than one id means a tie; empty means no votes.
    function getWinners(uint256 electionId)
        external
        view
        exists(electionId)
        inPhase(electionId, Phase.Finalized)
        returns (uint256[] memory)
    {
        return _winners[electionId];
    }
}
