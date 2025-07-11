import axios from "axios";

const API = axios.create({
  baseURL: "/api", // Backend API URL
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

