/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { BrowserProvider, Contract} from "ethers";
import VotingABI from "./contracts/Voting.json";
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
  const [hasVoted, setHasVoted] = useState(false);
  const [txPending, setTxPending] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [provider, setProvider] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [signer, setSigner] = useState(null);
  const [isAdminUser, setIsAdminUser] = useState(false);


useEffect(() => {
  if (currentAccount && adminAddress) {
    try {
      const result = currentAccount.toLowerCase() === adminAddress.toLowerCase();
      setIsAdminUser(result);
      console.log("👤 Account:", currentAccount);
      console.log("👑 Admin:", adminAddress);
      console.log("🛡 Admin Check:", result);
    } catch {
      setIsAdminUser(false);
    }
  }
}, [currentAccount, adminAddress]);
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
        VotingABI.abi,
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
          const newAccount = accounts[0];
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
      const fetchContractData = async (contract) => {
  if (!contract) return;

  try {
    console.log("🟡 Skipping candidate count check...");
    setCandidates([]); // Start with an empty candidate list

    console.log("🟡 Fetching votingStarted...");
    const started = await contract.votingStarted();
    console.log("✅ votingStarted:", started);

    console.log("🟡 Fetching votingEnded...");
    const ended = await contract.votingEnded();
    console.log("✅ votingEnded:", ended);

    console.log("🟡 Fetching admin...");
    const admin = await contract.admin();
    console.log("✅ Admin:", admin);

    setVotingStatus({ started, ended });
    setAdminAddress(admin.toLowerCase());

    if (currentAccount) {
      console.log("🟡 Checking if user has voted...");
      const voted = await contract.hasVoted(currentAccount);
      console.log("✅ hasVoted:", voted);
      setHasVoted(voted);
    }

    if (ended) {
      try {
        console.log("🟡 Fetching winner...");
        const winnerName = await contract.getWinner();
        console.log("✅ Winner:", winnerName);
        setWinner(winnerName);
      } catch (err) {
        console.error("❌ Error fetching winner:", err);
        setWinner("⚠️ Could not fetch winner");
      }
    } else {
      setWinner(null);
    }

    console.log("✅ Admin panel data fetched (no candidate count).");
  } catch (error) {
    console.error("❌ Error fetching contract data:", error);
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
        isAdmin={isAdminUser}
      />
      <Routes>
        {/* Auth routes */}
        <Route path="/register" element={<Register connectWallet={connectWallet} />} />
        <Route path="/login" element={<Login connectWallet={connectWallet} />} />

        {/* Voting Dashboard */}
        <Route
          path="/"
          element={
            <>
            <Dashboard
              currentAccount={currentAccount}
              connectWallet={connectWallet}
              votingContract={votingContract}
              candidates={candidates}
              winner={winner}
              votingStatus={votingStatus}
              isAdmin={isAdminUser}
              txPending={txPending}
              setTxPending={setTxPending}
              hasVoted={hasVoted}
              fetchContractData={() => fetchContractData(votingContract)}
              setLoading={setLoading}
              loading={loading}
              setWinner={setWinner}
            />

            {isAdminUser && (
              <AdminPanel
                votingContract={votingContract}
                votingStatus={votingStatus}
                fetchContractData={() => fetchContractData(votingContract)}
                setLoading={setLoading}
                loading={loading}
                setWinner={setWinner}
              />
            )}
          </>

          }
        />
      </Routes>
    </Router>
  );
}

export default App;
