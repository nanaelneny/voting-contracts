// src/components/ElectionsList.js
import React, { useEffect, useState } from "react";
import { fetchElections } from "../api/elections";

const ElectionsList = () => {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadElections = async () => {
      try {
        const data = await fetchElections();
        setElections(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadElections();
  }, []);

  if (loading) return <p>Loading elections...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Elections</h1>
      <ul className="space-y-3">
        {elections.map((election) => (
          <li
            key={election.id}
            className="p-4 border rounded shadow-sm bg-gray-800 text-white"
            >
            <h2 className="text-xl font-semibold text-white">{election.name}</h2>
            <p className="text-gray-200">{election.description}</p>
            <p className="text-gray-300">
                🗓 {election.start_date} → {election.end_date}
            </p>
          </li>

        ))}
      </ul>
    </div>
  );
};

export default ElectionsList;
