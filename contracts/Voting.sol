// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {
    address public admin;

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    struct Election {
        uint id;
        string name;
        string description;
        uint startTime;
        uint endTime;
        bool votingStarted;
        bool votingEnded;
        Candidate[] candidates;
        mapping(address => bool) hasVoted;
    }

    uint public electionCount;
    mapping(uint => Election) private elections;

    event ElectionCreated(uint electionId, string name, uint startTime, uint endTime);
    event CandidateAdded(uint electionId, uint candidateId, string name);
    event Voted(uint electionId, uint candidateId, address voter);
    event VotingStarted(uint electionId);
    event VotingEnded(uint electionId);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier electionExists(uint electionId) {
        require(electionId < electionCount, "Election does not exist");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // 🗳️ Create a new election
    function createElection(
        string memory _name,
        string memory _description,
        uint _startTime,
        uint _endTime
    ) public onlyAdmin {
        require(_startTime < _endTime, "Start time must be before end time");

        Election storage e = elections[electionCount];
        e.id = electionCount;
        e.name = _name;
        e.description = _description;
        e.startTime = _startTime;
        e.endTime = _endTime;

        emit ElectionCreated(electionCount, _name, _startTime, _endTime);
        electionCount++;
    }

    // ➕ Add a candidate to a specific election
    function addCandidate(uint electionId, string memory _name) public onlyAdmin electionExists(electionId) {
        Election storage e = elections[electionId];
        require(!e.votingStarted, "Cannot add candidates after voting starts");
        uint candidateId = e.candidates.length;
        e.candidates.push(Candidate(candidateId, _name, 0));
        emit CandidateAdded(electionId, candidateId, _name);
    }

    // ✅ Start voting for an election
    function startVoting(uint electionId) public onlyAdmin electionExists(electionId) {
        Election storage e = elections[electionId];
        require(!e.votingStarted, "Voting already started");
        e.votingStarted = true;
        emit VotingStarted(electionId);
    }

    // 🛑 End voting for an election
    function endVoting(uint electionId) public onlyAdmin electionExists(electionId) {
        Election storage e = elections[electionId];
        require(e.votingStarted, "Voting not started yet");
        e.votingEnded = true;
        emit VotingEnded(electionId);
    }

    // 🗳 Cast a vote
    function vote(uint electionId, uint candidateId) public electionExists(electionId) {
        Election storage e = elections[electionId];
        require(e.votingStarted, "Voting has not started");
        require(!e.votingEnded, "Voting has ended");
        require(!e.hasVoted[msg.sender], "You have already voted");
        require(candidateId < e.candidates.length, "Invalid candidate ID");

        e.candidates[candidateId].voteCount++;
        e.hasVoted[msg.sender] = true;

        emit Voted(electionId, candidateId, msg.sender);
    }

    // 📊 Get all candidates in an election
    function getCandidates(uint electionId) public view electionExists(electionId) returns (Candidate[] memory) {
        return elections[electionId].candidates;
    }

    // 📋 Get all elections (basic details)
    function getAllElections() public view returns (
        uint[] memory, string[] memory, string[] memory, uint[] memory, uint[] memory, bool[] memory, bool[] memory
    ) {
        uint[] memory ids = new uint[](electionCount);
        string[] memory names = new string[](electionCount);
        string[] memory descriptions = new string[](electionCount);
        uint[] memory startTimes = new uint[](electionCount);
        uint[] memory endTimes = new uint[](electionCount);
        bool[] memory votingStartedArr = new bool[](electionCount);
        bool[] memory votingEndedArr = new bool[](electionCount);

        for (uint i = 0; i < electionCount; i++) {
            Election storage e = elections[i];
            ids[i] = e.id;
            names[i] = e.name;
            descriptions[i] = e.description;
            startTimes[i] = e.startTime;
            endTimes[i] = e.endTime;
            votingStartedArr[i] = e.votingStarted;
            votingEndedArr[i] = e.votingEnded;
        }
        return (ids, names, descriptions, startTimes, endTimes, votingStartedArr, votingEndedArr);
    }

    // 🏆 Get winner of an election
    function getWinner(uint electionId) public view electionExists(electionId) returns (string memory) {
        Election storage e = elections[electionId];
        require(e.votingEnded, "Voting has not ended yet");
        uint winningVoteCount = 0;
        uint winnerId;

        for (uint i = 0; i < e.candidates.length; i++) {
            if (e.candidates[i].voteCount > winningVoteCount) {
                winningVoteCount = e.candidates[i].voteCount;
                winnerId = i;
            }
        }
        return e.candidates[winnerId].name;
    }
}
