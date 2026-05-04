import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

console.log("🔥 FILE LOADED ON RENDER");

const app = express();

// ✅ CORS (keep only this)
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://client-teal-seven-24.vercel.app"
  ],
  credentials: true
}));

app.use(express.json());

// ✅ Root route
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

// ✅ API test route
app.get("/api", (req, res) => {
  res.json({ message: "API is working ✅" });
});

// ======================
// 📁 PATH SETUP
// ======================
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const databasePath = join(dataDir, "performance.db");

mkdirSync(dataDir, { recursive: true });

// ======================
// 🗄 DATABASE
// ======================
const db = new DatabaseSync(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    employeeName TEXT NOT NULL,
    role TEXT NOT NULL,
    testingApps TEXT NOT NULL,
    supportTickets REAL,
    chatsHandled REAL,
    bugsAdded REAL DEFAULT 0,
    qualityOfTesting TEXT,
    appReviews REAL,
    systemProcess REAL,
    issuesBlockers TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ======================
// 🔐 AUTH HELPERS
// ======================
const tokenSecret = process.env.AUTH_SECRET || "change-this-secret-before-production";
const tokenMaxAgeMs = 1000 * 60 * 60 * 8;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = passwordHash.split(":");
  const attemptedHash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(attemptedHash, "hex"));
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

  if (payload.expiresAt < Date.now()) return null;

  return payload;
}

// ======================
// 🔐 AUTH MIDDLEWARE
// ======================
function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Authentication required." });
  }

  req.user = payload;
  next();
}

// ======================
// 🔐 AUTH ROUTES
// ======================
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + tokenMaxAgeMs
  });

  res.json({ token });
});

// ======================
// 🔒 PROTECTED ROUTES
// ======================
app.get("/api/entries", authenticate, (req, res) => {
  const entries = db.prepare("SELECT * FROM entries").all();
  res.json(entries);
});

// ======================
// 🚀 START SERVER (ONLY ONCE)
// ======================
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});