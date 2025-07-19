/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { BrowserProvider, Contract, getAddress } from "ethers";
import VotingContract from "./contracts/Voting.json";
import contractAddress from "./contracts/contractAddress.json";
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AdminPanel from "./components/AdminPanel";


import Header from "./components/Header";
import Register from "./pages/Register";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";

function App() {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [winner, setWinner] = useState(null);
  const [votingContract, setVotingContract] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [votingStatus, setVotingStatus] = useState({ started: false, ended: false });
  const [adminAddress, setAdminAddress] = useState(null);
  const [totalVotes, setTotalVotes] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [activeElectionId, setActiveElectionId] = useState(0); // Default to election 0
  // eslint-disable-next-line no-unused-vars
  const [provider, setProvider] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [signer, setSigner] = useState(null);

  // ✅ Check if current user is admin
  const isAdmin = () => {
    try {
      if (!currentAccount || !adminAddress) return false;
      return getAddress(currentAccount) === getAddress(adminAddress);
    } catch {
      return false;
    }
  };

  // 🔌 Connect wallet
  const connectWallet = async () => {
    if (currentAccount) return; // Already connected
    if (!window.ethereum) {
      if (window.confirm("MetaMask not found. Install MetaMask?")) {
        window.location.href = "https://metamask.io/download.html";
      }
      return;
    }

    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      await browserProvider.send("eth_requestAccounts", []);
      const signerInstance = await browserProvider.getSigner();
      const account = await signerInstance.getAddress();
      setCurrentAccount(account.toLowerCase());
      setProvider(browserProvider);
      setSigner(signerInstance);

      const contract = new Contract(
        contractAddress.address,
        VotingContract.abi,
        signerInstance
      );
      setVotingContract(contract);
      window.contract = contract; // Debugging aid
      await fetchContractData(contract);

      // 🔁 Watch for account changes
      window.ethereum.on("accountsChanged", (accounts) => {
        if (!accounts || accounts.length === 0) {
          window.location.reload();
        } else {
          const newAccount = accounts[0].toLowerCase();
          if (newAccount !== currentAccount) {
            setCurrentAccount(newAccount);
            fetchContractData(contract);
          }
        }
      });
    } catch (error) {
      console.error("Error connecting wallet:", error);
    }
  };

  // 📦 Fetch contract data
  const fetchContractData = async (contract, electionId = activeElectionId) => {
  try {
    const results = await contract.getResults(electionId);
    const started = await contract.votingStarted(electionId);
    const ended = await contract.votingEnded(electionId);
    const admin = await contract.admin();

    setCandidates(results);
    setVotingStatus({ started, ended });
    setAdminAddress(admin.toLowerCase());

    // Total votes
    const totalVotesCount = results.reduce(
      (sum, candidate) => sum + Number(candidate.voteCount),
      0
    );
    setTotalVotes(totalVotesCount);

    if (currentAccount) {
      const voted = await contract.hasVoted(electionId, currentAccount);
      setHasVoted(voted);
    }

    if (ended) {
      try {
        const winnerName = await contract.getWinner(electionId);
        setWinner(winnerName);
      } catch (err) {
        console.error("Error fetching winner:", err);
        setWinner("⚠️ Could not fetch winner");
      }
    } else {
      setWinner(null);
    }

  } catch (error) {
    console.error("Error fetching contract data:", error);
  }
};

  // 🔁 Connect wallet on mount
  useEffect(() => {
    connectWallet();
  }, []);

  return (
    <Router>
      <Header
        currentAccount={currentAccount}
        connectWallet={connectWallet}
        isAdmin={isAdmin}
      />
      <Routes>
        {/* Auth routes */}
        <Route path="/register" element={<Register connectWallet={connectWallet} />} />
        <Route path="/login" element={<Login connectWallet={connectWallet} />} />

        {/* Voting Dashboard */}
        <Route
          path="/"
          element={
            <Dashboard
              currentAccount={currentAccount}
              connectWallet={connectWallet}
              votingContract={votingContract}
              candidates={candidates}
              winner={winner}
              votingStatus={votingStatus}
              totalVotes={totalVotes}
              isAdmin={isAdmin}
              txPending={txPending}
              setTxPending={setTxPending}
              hasVoted={hasVoted}
              fetchContractData={() => fetchContractData(votingContract)}
              setLoading={setLoading}
              loading={loading}
              setWinner={setWinner}
            />
          }
        />

        <Route
            path="/admin"
            element={
              isAdmin() ? (
                <>
                  {/* ✅ Election Selector */}
                  <div className="p-4">
                    <label htmlFor="election" className="text-white">🗳 Select Election: </label>
                    <select
                      id="election"
                      className="ml-2 p-1 rounded bg-white/80 text-black"
                      value={activeElectionId}
                      onChange={(e) => setActiveElectionId(Number(e.target.value))}
                    >
                      <option value={0}>Election 0</option>
                      <option value={1}>Election 1</option>
                      <option value={2}>Election 2</option>
                    </select>
                  </div>

                  {/* ✅ Admin Panel */}
                  <AdminPanel
                    votingContract={votingContract}
                    fetchContractData={() => fetchContractData(votingContract, activeElectionId)} // Pass electionId
                    setLoading={setLoading}
                    loading={loading}
                    setWinner={setWinner}
                    votingStatus={votingStatus}
                    selectedElectionId={activeElectionId} // ✅ Pass active electionId here
                  />
                </>
              ) : (
                <div>🚫 Access Denied: Admins only</div>
              )
            }
          />



      </Routes>
    </Router>
  );
}

export default App;
