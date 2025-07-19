import React from "react";
import { useNavigate } from "react-router-dom";
import { walletRegister } from "../utils/walletAuth";

export default function Register() {
  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      const { address } = await walletRegister();
      alert(`✅ Wallet ${address} registered successfully!`);
      navigate("/"); // Redirect to dashboard
    } catch (err) {
      console.error(err);
      alert("❌ Failed to register with wallet");
    }
  };

  return (
    <div className="flex justify-center items-center h-screen">
      <div className="bg-white p-8 rounded shadow-md text-center">
        <h1 className="text-2xl mb-4">📝 Register</h1>
        <p className="mb-4">Connect your MetaMask wallet to get started.</p>
        <button
          onClick={handleRegister}
          className="bg-blue-500 text-white px-4 py-2 rounded w-full hover:bg-blue-600"
        >
          Connect Wallet
        </button>
      </div>
    </div>
  );
}
