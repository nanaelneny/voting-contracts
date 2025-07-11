const { ethers } = require("ethers");
const votingContract = require("../config/contract"); // Import your deployed contract

// Cast a vote
exports.castVote = async (req, res) => {
    const { candidateId } = req.body;

    try {
        // Call the smart contract's vote function
        const tx = await votingContract.vote(candidateId);

        console.log(`⏳ Waiting for transaction to be mined...`);
        await tx.wait(); // Wait for confirmation

        console.log(`✅ User ${req.user.id} voted for candidate ${candidateId} (TxHash: ${tx.hash})`);
        res.status(200).json({
            message: "✅ Vote cast successfully",
            transactionHash: tx.hash
        });
    } catch (error) {
        console.error("❌ Error casting vote:", error);
        res.status(500).json({ message: "❌ Failed to cast vote" });
    }
};
