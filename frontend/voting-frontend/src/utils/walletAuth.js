import axios from "axios";
import { ethers } from "ethers";

const API_URL = "http://localhost:5000/api/auth"; // Change if needed

// Wallet Login
export async function walletLogin() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const address = await signer.getAddress();

  // Fetch nonce from backend
  const { data } = await axios.get(`${API_URL}/nonce?address=${address}`);
  const nonce = data.nonce;
  const message = `Login to Blockchain Voting System\nNonce: ${nonce}`;

  // Sign message
  const signature = await signer.signMessage(message);

  // Send signed message to backend
  const response = await axios.post(`${API_URL}/wallet-login`, {
    address,
    signature
  });

  const token = response.data.token;
  localStorage.setItem("token", token); // Save JWT token

  return { token, address };
}

// Wallet Registration
export async function walletRegister() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const address = await signer.getAddress();

  // Register user on backend
  const response = await axios.post(`${API_URL}/wallet-register`, {
    address
  });

  const token = response.data.token;
  localStorage.setItem("token", token); // Save JWT token

  return { token, address };
}
