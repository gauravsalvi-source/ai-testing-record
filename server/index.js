import express from "express";
import cors from "cors";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

console.log("🔥 SERVER STARTED");

const app = express();

// ======================
// CORS
// ======================
const rawCorsOrigins = process.env.CORS_ORIGIN || "http://localhost:5173,http://192.168.0.104:5173,https://client-teal-seven-24.vercel.app,https://ai-testing-record-dj99.vercel.app,https://team-performance-trackr.vercel.app";
const allowedOrigins = rawCorsOrigins.split(",").map((origin) => origin.trim()).filter(Boolean);

console.log("Allowed CORS origins:", allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// ======================
// ROOT
// ======================
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.get("/api", (req, res) => {
  res.json({ message: "API is working ✅" });
});

// ======================
// PATH SETUP
// ======================
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const databasePath = join(dataDir, "performance.db");

mkdirSync(dataDir, { recursive: true });

// ======================
// DATABASE
// ======================
const db = new DatabaseSync(databasePath);

db.exec(`
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  employeeName TEXT,
  role TEXT,
  testingApps TEXT,
  supportTickets REAL,
  chatsHandled REAL,
  bugsAdded REAL,
  qualityOfTesting TEXT,
  appReviews REAL,
  systemProcess REAL,
  issuesBlockers TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT UNIQUE,
  passwordHash TEXT,
  role TEXT
);
`);

// Migration: Add notes column if it doesn't exist
try {
  db.prepare("PRAGMA table_info(entries)").all().forEach((col) => {
    if (col.name === "notes") return;
  });
  
  const columns = db.prepare("PRAGMA table_info(entries)").all();
  const hasNotesColumn = columns.some(col => col.name === "notes");
  
  if (!hasNotesColumn) {
    db.exec("ALTER TABLE entries ADD COLUMN notes TEXT;");
    console.log("✅ Added notes column to entries table");
  }
} catch (err) {
  console.error("⚠️ Migration check failed:", err.message);
}

// ======================
// AUTH HELPERS
// ======================
function signToken(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function verifyToken(token) {
  try {
    return JSON.parse(Buffer.from(token, "base64").toString());
  } catch {
    return null;
  }
}

// ======================
// SEED USERS
// ======================
const employees = [
  ["Shivam", "shivam@test.com", "admin123", "Tester"],
  ["Gaurav", "gaurav@test.com", "admin123", "Support"],
  ["Lalit", "lalit@test.com", "admin123", "Support"],
  ["Rupali", "rupali@test.com", "admin123", "Support"],
  ["Prathamesh", "prathamesh@test.com", "admin123", "Support"]
];

employees.forEach(([name, email, password, role]) => {
  const exists = db.prepare("SELECT * FROM users WHERE email=?").get(email);

  if (!exists) {
    db.prepare(`
      INSERT INTO users (name, email, passwordHash, role)
      VALUES (?, ?, ?, ?)
    `).run(name, email, password, role);
  } else {
    db.prepare(`
      UPDATE users SET name=?, passwordHash=?, role=? WHERE email=?
    `).run(name, password, role, email);
  }
});

// Admin user
const adminExists = db.prepare("SELECT * FROM users WHERE email=?").get("admin@example.com");

if (!adminExists) {
  db.prepare(`
    INSERT INTO users (name, email, passwordHash, role)
    VALUES (?, ?, ?, ?)
  `).run("Admin", "admin@example.com", "admin123", "admin");
}

// ======================
// AUTH MIDDLEWARE
// ======================
function authenticate(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const user = verifyToken(token);

  if (!user) return res.status(401).json({ message: "Unauthorized" });

  req.user = user;
  next();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function dbValue(value) {
  return value === undefined ? null : value;
}

function isAwayEntry(entry) {
  return ["leave", "holiday"].includes(String(entry.testingApps || "").toLowerCase().trim());
}

function qualityScore(value) {
  const scores = {
    excellent: 5,
    good: 4,
    average: 3,
    poor: 2
  };

  return scores[String(value || "").toLowerCase().trim()] || 0;
}

function calculateOverallEffort(entry) {
  if (isAwayEntry(entry)) return null;

  const systemScore = toNumber(entry.systemProcess);
  const testingQualityScore = qualityScore(entry.qualityOfTesting);

  if (!systemScore && !testingQualityScore) return null;
  if (!testingQualityScore) return systemScore;
  if (!systemScore) return testingQualityScore;

  return (systemScore * 0.6) + (testingQualityScore * 0.4);
}

function supportActivityScore(entry) {
  if (isAwayEntry(entry)) return 0;

  const rawScore =
    (toNumber(entry.supportTickets) * 0.2) +
    (toNumber(entry.chatsHandled) * 0.1) +
    (toNumber(entry.appReviews) * 0.5);

  return Math.min(rawScore, 5);
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    return null;
  }

  return {
    start: `${month}-01`,
    end: `${month}-31`
  };
}

function formatScore(value) {
  return Number(value || 0).toFixed(2);
}

// ======================
// AUTH ROUTES
// ======================
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);

  if (!user || password !== user.passwordHash) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  res.json({ token });
});

app.get("/api/auth/me", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const user = verifyToken(token);

  if (!user) return res.status(401).json({ message: "Invalid token" });

  res.json(user);
});

// ======================
// USERS (FIXED)
// ======================
app.get("/api/users", (req, res) => {
    try {
    const users = db.prepare(`
      SELECT id, name, email, role FROM users
    `).all();

    res.json(users);
  } catch (err) {
    console.error("❌ Fetch users error:", err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// ======================
// EMPLOYEES
// ======================
app.get("/api/employees", authenticate, (req, res) => {
  const users = db.prepare(`
    SELECT name, role 
    FROM users 
    WHERE role != 'admin'
    GROUP BY name
  `).all();

  res.json(users);
});

// ======================
// ENTRIES
// ======================
app.get("/api/entries", authenticate, (req, res) => {
  const { employee, role, startDate, endDate } = req.query;
  const conditions = [];
  const params = [];

  if (employee && employee !== "All") {
    conditions.push("employeeName = ?");
    params.push(employee);
  }

  if (role && role !== "All") {
    conditions.push("role = ?");
    params.push(role);
  }

  if (startDate) {
    conditions.push("date >= ?");
    params.push(startDate);
  }

  if (endDate) {
    conditions.push("date <= ?");
    params.push(endDate);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`
    SELECT * FROM entries
    ${whereClause}
    ORDER BY date DESC, employeeName ASC, id DESC
  `).all(...params);

  res.json(rows.map((row) => ({
    ...row,
    overallEffort: calculateOverallEffort(row) === null
      ? null
      : formatScore(calculateOverallEffort(row))
  })));
});

app.post("/api/entries", authenticate, (req, res) => {
  const {
    date,
    employeeName,
    role,
    testingApps,
    supportTickets,
    chatsHandled,
    bugsAdded,
    qualityOfTesting,
    appReviews,
    systemProcess,
    issuesBlockers,
    notes
  } = req.body;

  try {
    const result = db.prepare(`
      INSERT INTO entries (
        date, employeeName, role, testingApps,
        supportTickets, chatsHandled, bugsAdded,
        qualityOfTesting, appReviews, systemProcess,
        issuesBlockers, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dbValue(date), dbValue(employeeName), dbValue(role), dbValue(testingApps),
      dbValue(supportTickets), dbValue(chatsHandled), dbValue(bugsAdded),
      dbValue(qualityOfTesting), dbValue(appReviews), dbValue(systemProcess),
      dbValue(issuesBlockers), dbValue(notes)
    );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error("❌ Insert error:", err);
    res.status(500).json({ message: "Insert failed" });
  }
});

app.put("/api/entries/:id", authenticate, (req, res) => {
  const { id } = req.params;
  const data = req.body;

  try {
    const result = db.prepare(`
      UPDATE entries SET
        date=?, employeeName=?, role=?, testingApps=?,
        supportTickets=?, chatsHandled=?, bugsAdded=?,
        qualityOfTesting=?, appReviews=?, systemProcess=?,
        issuesBlockers=?, notes=?
      WHERE id=?
    `).run(
      dbValue(data.date),
      dbValue(data.employeeName),
      dbValue(data.role),
      dbValue(data.testingApps),
      dbValue(data.supportTickets),
      dbValue(data.chatsHandled),
      dbValue(data.bugsAdded),
      dbValue(data.qualityOfTesting),
      dbValue(data.appReviews),
      dbValue(data.systemProcess),
      dbValue(data.issuesBlockers),
      dbValue(data.notes),
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    const updatedEntry = db.prepare("SELECT * FROM entries WHERE id=?").get(id);
    res.json({
      ...updatedEntry,
      overallEffort: calculateOverallEffort(updatedEntry) === null
        ? null
        : formatScore(calculateOverallEffort(updatedEntry))
    });
  } catch (err) {
    console.error("❌ Update error:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ======================
// DELETE ENTRY (FIX)
// ======================
app.delete("/api/entries/:id", (req, res) => {
  const { id } = req.params;

  try {
    const result = db.prepare(`
      DELETE FROM entries WHERE id = ?
    `).run(id);

    if (result.changes === 0) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

// ======================
// SUMMARY
// ======================
app.get("/api/summary", authenticate, (req, res) => {
  const users = db.prepare(`
    SELECT name as employee, role FROM users WHERE role != 'admin'
  `).all();

  const selectedMonth = monthRange(req.query.month);
  const entries = selectedMonth
    ? db.prepare("SELECT * FROM entries WHERE date >= ? AND date <= ?").all(selectedMonth.start, selectedMonth.end)
    : db.prepare("SELECT * FROM entries").all();

  const map = {};

  users.forEach(u => {
    map[u.employee] = {
      employee: u.employee,
      role: u.role,
      daysWorked: 0,
      testingDays: 0,
      totalTickets: 0,
      totalChats: 0,
      totalBugs: 0,
      totalAppReviews: 0,
      avgSystemProcess: 0,
      avgEffortScore: 0,
      testingScore: 0,
      supportScore: 0,
      activeCount: 0,
      testingCount: 0
    };
  });

  entries.forEach(e => {
    if (!map[e.employeeName]) return;

    const emp = map[e.employeeName];
    const effort = calculateOverallEffort(e);

    emp.totalBugs += toNumber(e.bugsAdded);

    if (isAwayEntry(e)) return;

    emp.daysWorked++;
    emp.totalTickets += toNumber(e.supportTickets);
    emp.totalChats += toNumber(e.chatsHandled);
    emp.totalAppReviews += toNumber(e.appReviews);
    emp.avgSystemProcess += toNumber(e.systemProcess);
    emp.supportScore += supportActivityScore(e);
    emp.activeCount++;

    if (effort !== null) {
      emp.avgEffortScore += effort;
    }

    if (String(e.testingApps || "").toLowerCase().trim() === "yes") {
      emp.testingDays++;
      emp.testingScore += qualityScore(e.qualityOfTesting);
      emp.testingCount++;
    }
  });

  const result = Object.values(map).map(emp => {
    const avgSystemProcess = emp.activeCount ? emp.avgSystemProcess / emp.activeCount : 0;
    const avgEffortScore = emp.activeCount ? emp.avgEffortScore / emp.activeCount : 0;
    const testingScore = emp.testingCount ? emp.testingScore / emp.testingCount : 0;
    const supportScore = emp.activeCount ? emp.supportScore / emp.activeCount : 0;
    const bugScore = emp.testingDays ? Math.min(emp.totalBugs / emp.testingDays, 5) : 0;
    const finalScore = emp.role === "Tester"
      ? (avgSystemProcess * 0.35) + (avgEffortScore * 0.25) + (testingScore * 0.25) + (bugScore * 0.15)
      : (avgSystemProcess * 0.45) + (avgEffortScore * 0.25) + (supportScore * 0.30);

    return {
      employee: emp.employee,
      role: emp.role,
      daysWorked: emp.daysWorked,
      testingDays: emp.testingDays,
      totalTickets: emp.totalTickets,
      totalChats: emp.totalChats,
      totalBugs: emp.totalBugs,
      totalAppReviews: emp.totalAppReviews,
      avgSystemProcess: formatScore(avgSystemProcess),
      avgEffortScore: formatScore(avgEffortScore),
      testingScore: formatScore(testingScore),
      supportScore: formatScore(supportScore),
      finalScore: formatScore(finalScore)
    };
  });

  res.json(result);
});

// ======================
// REPORT
// ======================
app.get("/api/report", authenticate, (req, res) => {
  const selectedMonth = monthRange(req.query.month);
  const entries = selectedMonth
    ? db.prepare("SELECT * FROM entries WHERE date >= ? AND date <= ?").all(selectedMonth.start, selectedMonth.end)
    : db.prepare("SELECT * FROM entries").all();

  const map = {};

  entries.forEach(e => {
    if (!map[e.employeeName]) {
      map[e.employeeName] = {
        employee: e.employeeName,
        role: e.role,
        totalSystem: 0,
        totalEffort: 0,
        totalTesting: 0,
        totalSupport: 0,
        totalBugs: 0,
        activeCount: 0,
        testingCount: 0,
        testingDays: 0
      };
    }

    const emp = map[e.employeeName];
    emp.totalBugs += toNumber(e.bugsAdded);

    if (isAwayEntry(e)) return;

    const effort = calculateOverallEffort(e);
    emp.totalSystem += toNumber(e.systemProcess);
    emp.totalEffort += effort || 0;
    emp.totalSupport += supportActivityScore(e);
    emp.activeCount++;

    if (String(e.testingApps || "").toLowerCase().trim() === "yes") {
      emp.testingDays++;
      emp.totalTesting += qualityScore(e.qualityOfTesting);
      emp.testingCount++;
    }
  });

  const result = Object.values(map).map(e => {
    const avgSystemProcess = e.activeCount ? e.totalSystem / e.activeCount : 0;
    const avgEffortScore = e.activeCount ? e.totalEffort / e.activeCount : 0;
    const testingScore = e.testingCount ? e.totalTesting / e.testingCount : 0;
    const supportScore = e.activeCount ? e.totalSupport / e.activeCount : 0;
    const bugScore = e.testingDays ? Math.min(e.totalBugs / e.testingDays, 5) : 0;
    const finalRating = e.role === "Tester"
      ? (avgSystemProcess * 0.35) + (avgEffortScore * 0.25) + (testingScore * 0.25) + (bugScore * 0.15)
      : (avgSystemProcess * 0.45) + (avgEffortScore * 0.25) + (supportScore * 0.30);

    let category = "Average";
    if (finalRating >= 4.5) category = "Excellent";
    else if (finalRating >= 3.5) category = "Good";
    else if (finalRating < 2.5) category = "Poor";

    const strengths = [];
    if (avgSystemProcess >= 4) strengths.push("System process");
    if (testingScore >= 4) strengths.push("Testing quality");
    if (supportScore >= 4) strengths.push("Support activity");
    if (bugScore >= 4) strengths.push("Bug reporting");

    return {
      employee: e.employee,
      role: e.role,
      finalRating: formatScore(finalRating),
      performanceCategory: category,
      keyStrengths: strengths.length ? strengths.join(", ") : "Needs more monthly data"
    };
  });

  res.json(result);
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
