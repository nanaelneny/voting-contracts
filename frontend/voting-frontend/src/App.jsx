/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { BrowserProvider, Contract, getAddress } from "ethers";
import VotingContract from "./contracts/Voting.json";
import contractAddress from "./contracts/contractAddress.json";
import Header from "./components/Header";
import AdminPanel from "./components/AdminPanel";
import VoterPanel from "./components/VoterPanel";
import ElectionsList from "./components/ElectionsList";

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
  const fetchContractData = async (contract) => {
    try {
      const results = await contract.getResults();
      const started = await contract.votingStarted();
      const ended = await contract.votingEnded();
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

      // Check if user has voted
      if (currentAccount) {
        const voted = await contract.hasVoted(currentAccount);
        setHasVoted(voted);
      }

      // 🏆 Get winner if voting ended
      if (ended) {
        try {
          
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
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-900 p-6 text-white">
      <Header
        currentAccount={currentAccount}
        connectWallet={connectWallet}
        isAdmin={isAdmin}
      />

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

            <VoterPanel
              votingStatus={votingStatus}
              candidates={candidates}
              voteForCandidate={async (candidateId) => {
                try {
                  setTxPending(true);
                  const tx = await votingContract.vote(candidateId);
                  await tx.wait();
                  alert("✅ Vote cast successfully!");
                  await fetchContractData(votingContract); // 🔄 Refresh
                } catch (error) {
                  console.error("Voting error:", error);
                  alert("⚠️ Transaction failed.");
                } finally {
                  setTxPending(false);
                }
              }}
              hasVoted={hasVoted}
              winner={winner}
              fetchContractData={() => fetchContractData(votingContract)}
            />

            {isAdmin() && (
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

      <div className="mt-10">
        <ElectionsList />
      </div>
    </div>
  );
}

export default App;
