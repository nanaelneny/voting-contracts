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
    address[] public voters;

    bool public votingStarted;
    bool public votingEnded;
    string public winner;

    // Events
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

    function addCandidate(string memory _name) public onlyAdmin {
        require(!votingStarted, "Cannot add candidates after voting starts");
        candidates.push(Candidate(candidates.length, _name, 0));
        emit CandidateAdded(candidates.length - 1, _name);
    }

    function startVoting() public onlyAdmin {
        require(!votingStarted, "Voting has already started");
        require(candidates.length > 0, "Add at least one candidate first");
        votingStarted = true;
        votingEnded = false;
        emit VotingStarted(electionRound);
    }

    function endVoting() public onlyAdmin {
        require(votingStarted, "Voting has not started");
        require(!votingEnded, "Voting already ended");
        votingEnded = true;
        calculateWinner();
        emit VotingEnded(electionRound, winner);
    }

    function vote(uint _candidateId) public {
        require(votingStarted, "Voting has not started");
        require(!votingEnded, "Voting has ended");
        require(hasVotedRound[msg.sender] != electionRound, "You have already voted");
        require(_candidateId < candidates.length, "Invalid candidate");

        candidates[_candidateId].voteCount += 1;
        hasVotedRound[msg.sender] = electionRound;
        voters.push(msg.sender);
        emit VoteCast(msg.sender, _candidateId, electionRound);
    }

    function calculateWinner() internal {
        uint highestVotes = 0;
        string memory winningName;

        for (uint i = 0; i < candidates.length; i++) {
            emit CandidateDebug(candidates[i].name, candidates[i].voteCount);
            if (candidates[i].voteCount > highestVotes) {
                highestVotes = candidates[i].voteCount;
                winningName = candidates[i].name;
            }
        }

        winner = winningName;
        emit WinnerSelected(winner, highestVotes);
    }

    function getResults() public view returns (Candidate[] memory) {
        return candidates;
    }

    function getWinner() public view returns (string memory) {
        require(votingEnded, "Voting is not yet ended");
        return winner;
    }

    function resetElection() public onlyAdmin {
        require(votingEnded, "Cannot reset while voting is active");
        delete candidates;
        votingStarted = false;
        votingEnded = false;
        winner = "";
        electionRound += 1;
        delete voters;
        emit ElectionReset(electionRound);
    }

    // 🆕 Indexed fetch functions
    function getCandidateCount() public view returns (uint) {
        return candidates.length;
    }

    function getCandidateByIndex(uint index)
        public
        view
        returns (uint id, string memory name, uint voteCount)
    {
        require(index < candidates.length, "Invalid index");
        Candidate storage candidate = candidates[index];
        return (candidate.id, candidate.name, candidate.voteCount);
    }
}
