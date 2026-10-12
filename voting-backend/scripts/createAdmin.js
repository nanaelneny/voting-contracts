// Creates an admin account. Public registration only ever creates voters.
//   npm run create-admin -- admin@knust.edu.gh "Election Officer" "a-strong-password"
const bcrypt = require("bcryptjs");
const { loadConfig } = require("../src/config");
const { createMssqlRepository } = require("../src/db/mssqlRepository");

async function main() {
  const [email, fullName, password] = process.argv.slice(2);
  if (!email || !fullName || !password) {
    console.error('Usage: npm run create-admin -- <email> "<full name>" "<password>"');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const repo = await createMssqlRepository(loadConfig().db);
  try {
    const user = await repo.createUser({
      fullName,
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin",
    });
    console.log(`Admin created: ${user.email} (id ${user.id})`);
  } finally {
    await repo.close();
  }
}

main().catch((err) => {
  console.error("Could not create admin:", err.field === "email" ? "that email is already registered" : err.message);
  process.exitCode = 1;
});
