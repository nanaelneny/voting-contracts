/* eslint-disable no-unused-vars */
import { useState, useEffect } from "react";
import LiveResultsChart from "./LiveResultsChart";

function VoterPanel({
  votingStatus,
  candidates,
  voteForCandidate,
  hasVoted,
  winner,
  fetchContractData,
}) {
  const [txPending, setTxPending] = useState(false); // Track vote transaction state

  // ✅ Fetch winner if voting ended and winner not yet loaded
  useEffect(() => {
    if (votingStatus.ended && !winner) {
      fetchContractData();
    }
  }, [votingStatus.ended, winner, fetchContractData]);

  const handleVote = async (candidateId) => {
    if (!votingStatus.started || votingStatus.ended) {
      alert("⚠️ Voting is not active.");
      return;
    }
    if (hasVoted) {
      alert("⚠️ You have already voted.");
      return;
    }
    try {
      setTxPending(true); // 🔄 Start loading
      await voteForCandidate(candidateId);
      alert("✅ Your vote has been recorded!");
      await fetchContractData(); // 🔄 Refresh data
    } catch (error) {
      console.error("Vote error:", error);
      alert("⚠️ Failed to cast vote.");
    } finally {
      setTxPending(false); // ✅ End loading
    }
  };

  return (
    <div className="mt-6">
      {/* ✅ Winner display */}
      {votingStatus.ended && (
        <div className="p-4 rounded bg-green-700 text-white text-center font-bold">
          🏆 Winner: {winner || "Fetching..."}
        </div>
      )}

      {!votingStatus.ended && (
        <>
          <h3 className="text-lg font-bold mb-2">🗳️ Candidates</h3>
          <ul className="space-y-2">
            {candidates.map((candidate, index) => (
              <li
                key={index}
                className="p-3 bg-white/20 rounded flex justify-between items-center"
              >
                <div className="flex flex-col">
                  <span className="font-semibold">{candidate.name}</span>
                  <span className="font-mono text-sm text-yellow-200">
                    {candidate.voteCount} votes
                  </span>
                </div>
                {!hasVoted && votingStatus.started && !votingStatus.ended && (
                  <button
                    onClick={() => handleVote(index)}
                    className="ml-4 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                    disabled={txPending} // Disable during tx
                  >
                    {txPending ? "Voting..." : "Vote"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* ✅ Chart appears below the list */}
          {candidates.length > 0 && !votingStatus.ended && (
            <div className="mt-6">
              <LiveResultsChart candidates={candidates} />
            </div>
          )}

          {hasVoted && (
            <p className="mt-3 text-green-300 font-semibold">
              ✅ You have already voted in this election.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default VoterPanel;
