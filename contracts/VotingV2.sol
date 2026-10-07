// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title VotingV2
 * @notice Multi-election voting contract with on-chain voter eligibility.
 *
 * Changes from the diploma version (Voting.sol):
 *  - Many elections live in one contract, each keyed by an id, instead of a
 *    single election that gets reset and overwritten.
 *  - Only approved voters can vote. The admin publishes a Merkle root of the
 *    approved wallet addresses per election; each voter submits a proof that
 *    their address is in that list. Creating extra wallets no longer gives
 *    extra votes.
 *  - Voting opens and closes on fixed timestamps set when the election is
 *    created. Once voting opens, the admin cannot add candidates, change the
 *    voter list, end voting early, or reset/delete the election.
 *  - Ties are reported as ties instead of silently picking the first candidate.
 *
 * Privacy note: like the original, a vote is linked to the voter's wallet
 * address (pseudonymous, not anonymous). Removing that link is the planned
 * zero-knowledge extension.
 */
contract VotingV2 is Ownable {
    // ───────────────────────────── Types ─────────────────────────────

    struct Election {
        string title;
        uint256 offchainId;   // matches Elections.id in the SQL database
        uint64 startTime;     // voting opens (inclusive)
        uint64 endTime;       // voting closes (exclusive)
        bytes32 voterRoot;    // Merkle root of approved voter addresses
        uint32 candidateCount;
        uint32 voterCount;    // size of the approved voter list (for turnout)
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

    uint256 public electionCount;
    mapping(uint256 => Election) private _elections;
    mapping(uint256 => mapping(uint256 => Candidate)) private _candidates;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => uint256[]) private _winners;

    uint32 public constant MAX_CANDIDATES = 50;

    // ──────────────────────────── Events ─────────────────────────────

    event ElectionCreated(uint256 indexed electionId, uint256 indexed offchainId, string title, uint64 startTime, uint64 endTime);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VoterRootSet(uint256 indexed electionId, bytes32 root, uint32 voterCount);
    event ElectionCancelled(uint256 indexed electionId);
    event VoteCast(uint256 indexed electionId, address indexed voter, uint256 indexed candidateId);
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
    error NotEligible();

    constructor(address initialAdmin) Ownable(initialAdmin) {}

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

    /// @notice Create an election. Ids start at 1.
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

        emit ElectionCreated(electionId, offchainId, title, startTime, endTime);
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

    /// @notice Publish (or replace, before voting opens) the approved voter list.
    /// @param root Merkle root built with @openzeppelin/merkle-tree over ["address"] leaves.
    /// @param voterCount Number of addresses in the list (used for turnout figures).
    function setVoterRoot(uint256 electionId, bytes32 root, uint32 voterCount)
        external
        onlyOwner
        exists(electionId)
        inPhase(electionId, Phase.Setup)
    {
        if (root == bytes32(0) || voterCount == 0) revert NoVoterList();
        _elections[electionId].voterRoot = root;
        _elections[electionId].voterCount = voterCount;
        emit VoterRootSet(electionId, root, voterCount);
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

    /// @notice Cast a vote. `proof` shows msg.sender is on the approved voter list.
    function vote(uint256 electionId, uint256 candidateId, bytes32[] calldata proof)
        external
        exists(electionId)
        inPhase(electionId, Phase.Voting)
    {
        Election storage e = _elections[electionId];
        if (e.candidateCount == 0) revert NoCandidates();
        if (e.voterRoot == bytes32(0)) revert NoVoterList();
        if (hasVoted[electionId][msg.sender]) revert AlreadyVoted();
        if (candidateId >= e.candidateCount) revert InvalidCandidate(candidateId);
        if (!isEligible(electionId, msg.sender, proof)) revert NotEligible();

        hasVoted[electionId][msg.sender] = true;
        _candidates[electionId][candidateId].voteCount += 1;
        e.totalVotes += 1;

        emit VoteCast(electionId, msg.sender, candidateId);
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

    function phase(uint256 electionId) public view exists(electionId) returns (Phase) {
        Election storage e = _elections[electionId];
        if (e.cancelled) return Phase.Cancelled;
        if (e.finalized) return Phase.Finalized;
        if (block.timestamp < e.startTime) return Phase.Setup;
        if (block.timestamp < e.endTime) return Phase.Voting;
        return Phase.Ended;
    }

    function isEligible(uint256 electionId, address voter, bytes32[] calldata proof)
        public
        view
        exists(electionId)
        returns (bool)
    {
        bytes32 root = _elections[electionId].voterRoot;
        if (root == bytes32(0)) return false;
        // Leaf format used by @openzeppelin/merkle-tree StandardMerkleTree (double hashed).
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(voter))));
        return MerkleProof.verifyCalldata(proof, root, leaf);
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
