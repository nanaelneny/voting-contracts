import React, { useState } from "react";

const ElectionsList = ({ contract, isAdmin }) => {
  const [elections, setElections] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newElection, setNewElection] = useState({
    title: "",
    description: "",
    startDate: "",
    endDate: "",
  });

  // ✅ Fetch elections
  const loadElections = React.useCallback(async () => {
  try {
    console.log("📥 Fetching elections from contract...");
    const [
      ids,
      names,
      descriptions,
      startTimes,
      endTimes,
      votingStartedArr,
      votingEndedArr,
    ] = await contract.getAllElections();

    const formattedElections = ids.map((id, index) => ({
      id: id.toNumber(),
      name: names[index],
      description: descriptions[index],
      startTime: startTimes[index].toNumber() * 1000, // convert to ms
      endTime: endTimes[index].toNumber() * 1000,     // convert to ms
      votingStarted: votingStartedArr[index],
      votingEnded: votingEndedArr[index],
    }));

    console.log("✅ Elections loaded:", formattedElections);
    setElections(formattedElections);
  } catch (err) {
    console.error("❌ Failed to load elections:", err);
  }
}, [contract]);


  // ✅ Add new election
  const handleAddElection = async (e) => {
  e.preventDefault();
  try {
    console.log("📝 Creating election...");
    const tx = await contract.createElection(
      newElection.title,
      newElection.description,
      Math.floor(new Date(newElection.startDate).getTime() / 1000), // convert to seconds
      Math.floor(new Date(newElection.endDate).getTime() / 1000)
    );
    await tx.wait();
    console.log("✅ Election created!");
    setShowAddForm(false);
    setNewElection({ title: "", description: "", startDate: "", endDate: "" });
    loadElections();
  } catch (err) {
    console.error("❌ Error creating election:", err);
    alert("Failed to create election. See console for details.");
  }
};


  React.useEffect(() => {
    if (contract) {
      loadElections();
    }
  }, [contract, loadElections]);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Elections</h2>

      {/* ✅ Admin-only Add Election button */}
      {isAdmin && (
        <div className="mb-4">
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            ➕ Add Election
          </button>
        </div>
      )}

      {/* ✅ Add Election Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddElection}
          className="bg-gray-100 p-4 rounded shadow mb-4"
        >
          <h3 className="text-lg font-semibold mb-2">Add New Election</h3>
          <input
            type="text"
            placeholder="Election Title"
            value={newElection.title}
            onChange={(e) => setNewElection({ ...newElection, title: e.target.value })}
            className="block w-full mb-2 p-2 rounded border"
            required
          />
          <textarea
            placeholder="Election Description"
            value={newElection.description}
            onChange={(e) =>
              setNewElection({ ...newElection, description: e.target.value })
            }
            className="block w-full mb-2 p-2 rounded border"
            required
          />
          <input
            type="datetime-local"
            value={newElection.startDate}
            onChange={(e) => setNewElection({ ...newElection, startDate: e.target.value })}
            className="block w-full mb-2 p-2 rounded border"
            required
          />
          <input
            type="datetime-local"
            value={newElection.endDate}
            onChange={(e) => setNewElection({ ...newElection, endDate: e.target.value })}
            className="block w-full mb-2 p-2 rounded border"
            required
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              ✅ Save
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="bg-red-600 text-white px-4 py-2 rounded"
            >
              ❌ Cancel
            </button>
          </div>
        </form>
      )}

      {/* 🗳 Elections List */}
      {elections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {elections.map((election, idx) => (
            <div key={idx} className="p-4 border rounded shadow">
              <h3 className="text-xl font-semibold">{election.title}</h3>
              <p>{election.description}</p>
              <p>
                🗓 {new Date(Number(election.startDate)).toLocaleString()} →{" "}
                {new Date(Number(election.endDate)).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p>No elections found.</p>
      )}
    </div>
  );
};

export default ElectionsList;
