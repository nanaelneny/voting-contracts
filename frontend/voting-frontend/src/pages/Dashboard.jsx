import React from "react";
import VoterPanel from "../components/VoterPanel";
import AdminPanel from "../components/AdminPanel";
import ElectionsList from "../components/ElectionsList";

function Dashboard({
  currentAccount,
  connectWallet,
  votingContract,
  candidates,
  winner,
  votingStatus,
  totalVotes,
  isAdmin,
  txPending,
  setTxPending,
  hasVoted,
  fetchContractData,
  setLoading,
  loading,
  setWinner,
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-900 p-6 text-white">
      <div className="max-w-md mx-auto p-6 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 shadow-lg hover:shadow-2xl transition duration-300">
        {currentAccount ? (
          <>
            <p className="mb-2 text-green-300">
              ✅ Connected: {currentAccount} {isAdmin() && "(Admin)"}
            </p>
            {txPending && (
              <p className="text-yellow-300 font-semibold mt-2">
                ⏳ Waiting for transaction confirmation...
              </p>
            )}
            <p className="mt-2">🗳️ Total Votes Cast: {totalVotes}</p>

            {winner && (
              <p className="mt-4 text-xl font-bold text-yellow-300">
                🏆 Winner: {winner}
              </p>
            )}

            {/* Voter Panel */}
            <VoterPanel
              votingStatus={votingStatus}
              candidates={candidates}
              voteForCandidate={async (candidateId) => {
                try {
                  setTxPending(true);
                  const tx = await votingContract.vote(candidateId);
                  await tx.wait();
                  alert("✅ Vote cast successfully!");
                  await fetchContractData(); // 🔄 Refresh
                } catch (error) {
                  console.error("Voting error:", error);
                  alert("⚠️ Transaction failed.");
                } finally {
                  setTxPending(false);
                }
              }}
              hasVoted={hasVoted}
              winner={winner}
              fetchContractData={fetchContractData}
            />

            {/* Admin Panel */}
            {isAdmin() && (
              <AdminPanel
                votingContract={votingContract}
                votingStatus={votingStatus}
                fetchContractData={fetchContractData}
                setLoading={setLoading}
                loading={loading}
                setWinner={setWinner}
              />
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="mb-4 text-red-200">❌ Wallet not connected</p>
            <button
              onClick={connectWallet}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Connect Wallet
            </button>
          </div>
        )}
      </div>

      {/* Elections List */}
      <div className="mt-10">
        <ElectionsList />
      </div>
    </div>
  );
}

export default Dashboard;
