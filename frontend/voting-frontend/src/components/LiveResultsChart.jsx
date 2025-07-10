import React from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// ✅ Register chart.js components once
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const LiveResultsChart = ({ candidates }) => {
  if (!candidates || candidates.length === 0) {
    return (
      <p className="text-center text-gray-300">
        No candidate data available yet.
      </p>
    );
  }

  // 📊 Chart Data
  const data = {
    labels: candidates.map((candidate) => candidate.name),
    datasets: [
      {
        label: "Votes",
        data: candidates.map((candidate) => Number(candidate.voteCount)),
        backgroundColor: [
          "#f87171", // red
          "#60a5fa", // blue
          "#34d399", // green
          "#fbbf24", // yellow
          "#a78bfa", // purple
          "#f472b6", // pink
        ],
        borderWidth: 1,
      },
    ],
  };

  // ⚙️ Chart Options
  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: "#fff",
        },
      },
      title: {
        display: true,
        text: "📊 Live Voting Results",
        color: "#fff",
        font: {
          size: 18,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
      },
      y: {
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
      },
    },
  };

  return (
    <div className="mt-6 p-4 rounded-lg bg-white/10 backdrop-blur-md">
      <Bar data={data} options={options} />
    </div>
  );
};

export default LiveResultsChart;
