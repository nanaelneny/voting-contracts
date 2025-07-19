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

// ✅ Add candidate to an election
export const addCandidateToElection = async (electionId, candidateData) => {
  try {
    const response = await fetch(`${API_URL}/${electionId}/candidates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(candidateData), // e.g. { name: "Candidate A" }
    });

    if (!response.ok) {
      throw new Error("Failed to add candidate");
    }

    return await response.json();
  } catch (error) {
    console.error("Error adding candidate:", error);
    throw error;
  }
};

