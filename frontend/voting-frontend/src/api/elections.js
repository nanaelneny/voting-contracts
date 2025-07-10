// src/api/elections.js

const API_URL = "http://localhost:5000/api/elections";

export const fetchElections = async () => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error("Failed to fetch elections");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching elections:", error);
    throw error;
  }
};
