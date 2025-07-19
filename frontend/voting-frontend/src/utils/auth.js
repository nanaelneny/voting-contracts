import axios from "axios";
import { ethers } from "ethers";

export async function walletLogin() {
    if (!window.ethereum) throw new Error("MetaMask not installed");

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();

    const address = await signer.getAddress();

    // Get nonce from backend
    const { data } = await axios.get(`http://localhost:5000/api/auth/nonce?address=${address}`);
    const message = `Login to Blockchain Voting System. Nonce: ${data.nonce}`;

    // Sign message
    const signature = await signer.signMessage(message);

    // Send address + signature to backend
    const response = await axios.post(`http://localhost:5000/api/auth/wallet-login`, {
        address,
        signature
    });

    const token = response.data.token;
    localStorage.setItem("token", token); // Save JWT for API calls
    return token;
}
