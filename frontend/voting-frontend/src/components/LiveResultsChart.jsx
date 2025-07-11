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

// ✅ Register Chart.js components once
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const LiveResultsChart = ({ candidates }) => {
  if (!candidates || candidates.length === 0) {
    return (
      <p className="text-center text-gray-300">
        No candidate data available yet.
      </p>
    );
  }

  // 🌈 Generate dynamic colors for candidates
  const generateColors = (count) => {
    const colors = [];
    for (let i = 0; i < count; i++) {
      colors.push(`hsl(${(i * 360) / count}, 70%, 60%)`); // pastel hues
    }
    return colors;
  };

  const colors = generateColors(candidates.length);

  // 📊 Chart Data
  const data = {
    labels: candidates.map((candidate) => candidate.name),
    datasets: [
      {
        label: "Votes",
        data: candidates.map((candidate) => Number(candidate.voteCount)),
        backgroundColor: colors,
        borderWidth: 1,
        borderColor: "#fff",
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
      tooltip: {
        callbacks: {
          label: (context) => `Votes: ${context.parsed.y}`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#fff" },
        grid: { color: "rgba(255,255,255,0.2)" },
      },
    },
    animation: {
      duration: 1000, // smooth animation
      easing: "easeOutBounce",
    },
  };

  return (
    <div className="mt-6 p-4 rounded-lg bg-white/10 backdrop-blur-md shadow-md">
      <Bar data={data} options={options} />
    </div>
  );
};

export default LiveResultsChart;
