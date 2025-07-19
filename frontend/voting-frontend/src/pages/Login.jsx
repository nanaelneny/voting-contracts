import React from "react";
import { useNavigate } from "react-router-dom";
import { walletLogin } from "../utils/walletAuth";

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const { address } = await walletLogin();
      alert(`✅ Wallet ${address} logged in successfully!`);
      navigate("/"); // Redirect to dashboard
    } catch (err) {
      console.error(err);
      alert("❌ Failed to login with wallet");
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="bg-white p-8 rounded shadow-md text-center">
        <h1 className="text-2xl mb-4">🔐 Login</h1>
        <p className="mb-4">Connect your MetaMask wallet to continue.</p>
        <button
          onClick={handleLogin}
          className="bg-green-500 text-white px-4 py-2 rounded w-full hover:bg-green-600"
        >
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
