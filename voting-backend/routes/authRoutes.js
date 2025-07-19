const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Admin login/register
router.post("/register", authController.registerUser);
router.post("/login", authController.loginUser);

// Voter wallet login
router.get("/nonce", authController.getNonce);
router.post("/wallet-login", authController.loginWithWallet);

module.exports = router;

