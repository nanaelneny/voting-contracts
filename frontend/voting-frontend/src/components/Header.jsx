function Header({ currentAccount, connectWallet, isAdmin }) {
  return (
    <header className="text-center mb-6">
      <h1 className="text-3xl font-bold mb-2">Online Voting System</h1>
      {!currentAccount && ( // ✅ Show button ONLY if no account
        <button
          onClick={connectWallet}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Connect Wallet
        </button>
      )}
    </header>
  );
}

export default Header;
