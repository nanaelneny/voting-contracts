/* eslint-disable no-unused-vars */
import { useState } from "react";

function AdminPanel({
  votingContract,
  votingStatus,
  fetchContractData,
  setLoading,
  loading,
  setWinner
}) {
  const [candidateName, setCandidateName] = useState("");

  // ✅ Add Candidate
  const addCandidate = async () => {
    if (!candidateName.trim()) {
      alert("⚠️ Please enter a candidate name.");
      return;
    }
    try {
      setLoading(true);
      const tx = await votingContract.addCandidate(candidateName);
      await tx.wait();
      alert(`✅ Candidate "${candidateName}" added successfully!`);
      setCandidateName("");
      await fetchContractData();
    } catch (error) {
      console.error("Error adding candidate:", error);
      alert("⚠️ Failed to add candidate.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Start Voting
  const startVoting = async () => {
    if (!window.confirm("⚠️ Are you sure you want to start voting?")) return;
    try {
      setLoading(true);
      const tx = await votingContract.startVoting();
      await tx.wait();
      alert("✅ Voting started successfully!");
      await fetchContractData();
    } catch (error) {
      console.error("Error starting voting:", error);
      alert("⚠️ Failed to start voting.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ End Voting
  const endVoting = async () => {
    if (!window.confirm("⚠️ Are you sure you want to end voting?")) return;
    try {
      setLoading(true);
      const tx = await votingContract.endVoting();
      await tx.wait();
      alert("✅ Voting ended successfully!");
      const winnerName = await votingContract.getWinner();
      console.log("🎯 Winner from contract:", winnerName);
      setWinner(winnerName);
      await fetchContractData();
    } catch (error) {
      console.error("Error ending voting:", error);
      alert("⚠️ Failed to end voting.");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Reset Election
  const resetElection = async () => {
    if (!window.confirm("⚠️ Are you sure you want to reset the election?")) return;
    try {
      setLoading(true);
      const tx = await votingContract.resetElection();
      await tx.wait();
      setWinner(null);
      alert("✅ Election reset successfully!");
      await fetchContractData();
    } catch (error) {
      console.error("Error resetting election:", error);
      alert("⚠️ Failed to reset election.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 p-4 bg-white/10 rounded-xl shadow-md">
      <h2 className="text-lg font-bold mb-2 text-white">🔧 Admin Panel</h2>

      {/* Add Candidate */}
      <div className="flex space-x-2 mb-3">
        <input
          type="text"
          placeholder="Candidate Name"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          className="w-full p-2 rounded bg-white/80 text-black"
          disabled={loading || votingStatus.started}
        />
        <button
          onClick={addCandidate}
          disabled={loading || votingStatus.started}
          className={`px-4 py-2 rounded text-white ${
            votingStatus.started
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {loading ? "Processing..." : "Add Candidate"}
        </button>
      </div>

      {/* Voting Controls */}
      <div className="flex flex-col gap-2">
        <button
          onClick={startVoting}
          disabled={loading || votingStatus.started}
          className={`w-full px-4 py-2 rounded text-white ${
            votingStatus.started
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading && !votingStatus.started ? "Starting..." : "Start Voting"}
        </button>
        <button
          onClick={endVoting}
          disabled={loading || !votingStatus.started || votingStatus.ended}
          className={`w-full px-4 py-2 rounded text-white ${
            !votingStatus.started || votingStatus.ended
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {loading && votingStatus.started && !votingStatus.ended ? "Ending..." : "End Voting"}
        </button>
        <button
          onClick={resetElection}
          disabled={loading || !votingStatus.ended}
          className={`w-full px-4 py-2 rounded text-white ${
            !votingStatus.ended
              ? "bg-gray-500 cursor-not-allowed"
              : "bg-yellow-600 hover:bg-yellow-700"
          }`}
        >
          {loading && votingStatus.ended ? "Resetting..." : "Reset Election"}
        </button>
      </div>
    </div>
  );
}

export default AdminPanel;
