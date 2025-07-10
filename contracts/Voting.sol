// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    address public admin;

    struct Candidate {
        uint id;
        string name;
        uint voteCount;
    }

    Candidate[] public candidates;
    mapping(address => uint) public hasVotedRound;
    uint public electionRound = 1;
    address[] public voters; // 🆕 Track voters for resetting

    bool public votingStarted;
    bool public votingEnded;
    string public winner;

    // 🆕 Events
    event CandidateAdded(uint candidateId, string name);
    event VotingStarted(uint round);
    event VotingEnded(uint round, string winner);
    event VoteCast(address voter, uint candidateId, uint round);
    event ElectionReset(uint newRound);
    event CandidateDebug(string name, uint votes);
    event WinnerSelected(string winner, uint votes);


    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    // Add a new candidate (only before voting starts)
    function addCandidate(string memory _name) public onlyAdmin {
        require(!votingStarted, "Cannot add candidates after voting starts");
        candidates.push(Candidate(candidates.length, _name, 0));
        emit CandidateAdded(candidates.length - 1, _name); // 🆕 Emit event
    }

    // Start the voting process
    function startVoting() public onlyAdmin {
        require(!votingStarted, "Voting has already started");
        require(candidates.length > 0, "Add at least one candidate first");
        votingStarted = true;
        votingEnded = false;
        emit VotingStarted(electionRound); // 🆕 Emit event
    }

    // End the voting process and calculate the winner
    function endVoting() public onlyAdmin {
        require(votingStarted, "Voting has not started");
        require(!votingEnded, "Voting already ended");
        votingEnded = true;
        calculateWinner();
        emit VotingEnded(electionRound, winner); // 🆕 Emit event
    }

    // Cast a vote for a candidate
    function vote(uint _candidateId) public {
        require(votingStarted, "Voting has not started");
        require(!votingEnded, "Voting has ended");
        require(hasVotedRound[msg.sender] != electionRound, "You have already voted");
        require(_candidateId < candidates.length, "Invalid candidate");

        candidates[_candidateId].voteCount += 1;
        hasVotedRound[msg.sender] = electionRound;
        voters.push(msg.sender); // 🆕 Track voter for later reset

        emit VoteCast(msg.sender, _candidateId, electionRound); // 🆕 Emit event
    }

    // Internal function to calculate the winner
    function calculateWinner() internal {
    uint highestVotes = 0;
    string memory winningName;

    for (uint i = 0; i < candidates.length; i++) {
        emit CandidateDebug(candidates[i].name, candidates[i].voteCount); // 🆕
        if (candidates[i].voteCount > highestVotes) {
            highestVotes = candidates[i].voteCount;
            winningName = candidates[i].name;
        }
    }

    winner = winningName;
    emit WinnerSelected(winner, highestVotes); // 🆕
    }


    // Get all candidates and their vote counts
    function getResults() public view returns (Candidate[] memory) {
        return candidates;
    }

    // Get the winner after voting ends
    function getWinner() public view returns (string memory) {
        require(votingEnded, "Voting is not yet ended");
        return winner;
    }

    // 🆕 Fully reset the election for a fresh start
    function resetElection() public onlyAdmin {
    require(votingEnded, "Cannot reset while voting is active");

    // Clear all candidates
    delete candidates;

    // Reset voting state
    votingStarted = false;
    votingEnded = false;
    winner = "";

    // Increment election round
    electionRound += 1;

    // Clear voter statuses
    delete voters; // Clear voters array

    emit ElectionReset(electionRound); // 🆕 Emit event
    }

}
