import axios from "axios";

const API = axios.create({
  baseURL:
    process.env.NODE_ENV === "production"
      ? process.env.REACT_APP_API_URL || "https://voting-contracts.onrender.com/api" // 👈 your Render backend
      : "http://localhost:5000/api", // 👈 your backend URL for local dev
});

// Add token to headers if exists
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default API;
