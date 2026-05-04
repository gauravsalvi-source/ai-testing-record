import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const app = express();
const port = process.env.PORT || 4000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "data");
const databasePath = join(dataDir, "performance.db");
const tokenSecret = process.env.AUTH_SECRET || "change-this-secret-before-production";
const tokenMaxAgeMs = 1000 * 60 * 60 * 8;

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://client-teal-seven-24.vercel.app"
  ],
  credentials: true
}));

app.use(express.json());

mkdirSync(dataDir, { recursive: true });

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

const employees = [
  { name: "Shivam", role: "Tester" },
  { name: "Lalit", role: "Support" },
  { name: "Rupali", role: "Support" },
  { name: "Gaurav", role: "Support" },
  { name: "Prathmesh", role: "Support" }
];

const seedEntries = [
  {
    date: "2026-04-01",
    employeeName: "Shivam",
    role: "Tester",
    testingApps: "Yes",
    supportTickets: null,
    chatsHandled: null,
    bugsAdded: 11,
    qualityOfTesting: "Average",
    appReviews: null,
    systemProcess: 5,
    issuesBlockers: "",
    notes: ""
  },
  {
    date: "2026-04-01",
    employeeName: "Lalit",
    role: "Support",
    testingApps: "Yes",
    supportTickets: 11,
    chatsHandled: 1,
    bugsAdded: 4,
    qualityOfTesting: "Average",
    appReviews: 0,
    systemProcess: 5,
    issuesBlockers: "",
    notes: ""
  },
  {
    date: "2026-04-02",
    employeeName: "Gaurav",
    role: "Support",
    testingApps: "Yes",
    supportTickets: 5,
    chatsHandled: 1,
    bugsAdded: 4,
    qualityOfTesting: "Average",
    appReviews: 0,
    systemProcess: 5,
    issuesBlockers: "Not informed about office coming",
    notes: ""
  }
];

seedDatabase();
seedAdminUser();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = passwordHash.split(":");
  const attemptedHash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(attemptedHash, "hex"));
}

function base64Url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function signToken(payload) {
  const body = base64Url(payload);
  const signature = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [body, signature] = token.split(".");
  const expectedSignature = crypto.createHmac("sha256", tokenSecret).update(body).digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

  if (!payload.expiresAt || payload.expiresAt < Date.now()) {
    return null;
  }

  return payload;
}

function seedAdminUser() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get();

  if (row.count > 0) {
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

  db.prepare(
    `INSERT INTO users (name, email, passwordHash, role)
     VALUES (:name, :email, :passwordHash, :role)`
  ).run({
    name: "Admin",
    email: adminEmail,
    passwordHash: hashPassword(adminPassword),
    role: "admin"
  });
}

function seedDatabase() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM entries").get();

  if (row.count > 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO entries (
      date, employeeName, role, testingApps, supportTickets, chatsHandled, bugsAdded,
      qualityOfTesting, appReviews, systemProcess, issuesBlockers, notes
    )
    VALUES (
      :date, :employeeName, :role, :testingApps, :supportTickets, :chatsHandled, :bugsAdded,
      :qualityOfTesting, :appReviews, :systemProcess, :issuesBlockers, :notes
    )
  `);

  db.exec("BEGIN");

  try {
    for (const entry of seedEntries) {
      insert.run(entry);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getEntries() {
  return db
    .prepare(
      `SELECT
        id, date, employeeName, role, testingApps, supportTickets, chatsHandled, bugsAdded,
        qualityOfTesting, appReviews, systemProcess, issuesBlockers, notes
      FROM entries
      ORDER BY date DESC, id DESC`
    )
    .all();
}

function getEntryById(id) {
  return db
    .prepare(
      `SELECT
        id, date, employeeName, role, testingApps, supportTickets, chatsHandled, bugsAdded,
        qualityOfTesting, appReviews, systemProcess, issuesBlockers, notes
      FROM entries
      WHERE id = ?`
    )
    .get(id);
}

function createEntry(entry) {
  const result = db
    .prepare(
      `INSERT INTO entries (
        date, employeeName, role, testingApps, supportTickets, chatsHandled, bugsAdded,
        qualityOfTesting, appReviews, systemProcess, issuesBlockers, notes
      )
      VALUES (
        :date, :employeeName, :role, :testingApps, :supportTickets, :chatsHandled, :bugsAdded,
        :qualityOfTesting, :appReviews, :systemProcess, :issuesBlockers, :notes
      )`
    )
    .run(entry);

  return getEntryById(result.lastInsertRowid);
}

function updateEntry(id, entry) {
  db.prepare(
    `UPDATE entries
      SET
        date = :date,
        employeeName = :employeeName,
        role = :role,
        testingApps = :testingApps,
        supportTickets = :supportTickets,
        chatsHandled = :chatsHandled,
        bugsAdded = :bugsAdded,
        qualityOfTesting = :qualityOfTesting,
        appReviews = :appReviews,
        systemProcess = :systemProcess,
        issuesBlockers = :issuesBlockers,
        notes = :notes,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = :id`
  ).run({ ...entry, id });

  return getEntryById(id);
}

function deleteEntry(id) {
  return db.prepare("DELETE FROM entries WHERE id = ?").run(id).changes;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function getUserByEmail(email) {
  return db.prepare("SELECT id, name, email, passwordHash, role FROM users WHERE email = ?").get(email);
}

function getUserById(id) {
  return db.prepare("SELECT id, name, email, passwordHash, role FROM users WHERE id = ?").get(id);
}

function getUsers() {
  return db.prepare("SELECT id, name, email, role, createdAt FROM users ORDER BY id ASC").all();
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.query.token || "";
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const user = getUserById(payload.id);

  if (!user) {
    return res.status(401).json({ message: "User not found." });
  }

  req.user = publicUser(user);
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  next();
}

function requireEditor(req, res, next) {
  if (!["admin", "editor"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Editor access required." });
  }

  next();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "" || value === "N/A") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function calculateEffort(entry) {
  if (entry.testingApps === "Leave" || entry.testingApps === "Holiday") {
    return "";
  }

  const bugsAdded = toNumber(entry.bugsAdded) || 0;
  const systemProcess = toNumber(entry.systemProcess);
  const qualityScores = {
    Excellent: entry.role === "Tester" ? 1.2 : 1,
    Good: entry.role === "Tester" ? 0.9 : 0.75,
    Average: entry.role === "Tester" ? 0.6 : 0.5,
    Poor: entry.role === "Tester" ? 0.3 : 0.25,
    "N/A": 0
  };

  let score = 1;

  if (entry.role === "Tester") {
    score += entry.testingApps === "Yes" ? 1.2 : 0;
    score += Math.min(bugsAdded / 5, 1.5);
  } else {
    const supportTickets = toNumber(entry.supportTickets);
    const chatsHandled = toNumber(entry.chatsHandled);
    const appReviews = toNumber(entry.appReviews);

    score += entry.testingApps === "Yes" ? 1 : 0;
    score += supportTickets === null ? 0 : supportTickets === 0 ? 0.3 : Math.min(supportTickets / 8, 1.2);
    score += chatsHandled === null ? 0 : chatsHandled === 0 ? 0.3 : Math.min(chatsHandled / 12, 1.2);
    score += Math.min(bugsAdded / 5, 1);
    score += appReviews === null ? 0 : Math.min(appReviews / 3, 0.4);
  }

  score += qualityScores[entry.qualityOfTesting] || 0;
  score += systemProcess === null ? 0 : (systemProcess - 1) * 0.35;

  return round(Math.min(5, Math.max(1, score)), 1);
}

function normalizeEntry(body, existing = {}) {
  const employee = employees.find((item) => item.name === body.employeeName);
  const role = body.role || employee?.role || existing.role || "Support";
  const isTester = role === "Tester";

  return {
    ...existing,
    date: body.date,
    employeeName: body.employeeName,
    role,
    testingApps: body.testingApps,
    supportTickets: isTester ? null : toNumber(body.supportTickets),
    chatsHandled: isTester ? null : toNumber(body.chatsHandled),
    bugsAdded: toNumber(body.bugsAdded) || 0,
    qualityOfTesting: body.qualityOfTesting,
    appReviews: isTester ? null : toNumber(body.appReviews),
    systemProcess: toNumber(body.systemProcess),
    issuesBlockers: body.issuesBlockers || "",
    notes: body.notes || ""
  };
}

function withEffort(entry) {
  const isAway =
    entry.testingApps === "Leave" ||
    entry.testingApps === "Holiday";

  return {
    ...entry,
    systemProcess: isAway ? "N/A" : entry.systemProcess, // ✅ FIX HERE
    overallEffort: calculateEffort(entry)
  };
}

function getSummary(data = getEntries()) {
  // ✅ use 'data' instead of getEntries()
  const maxTickets = Math.max(0, ...data.map((entry) => toNumber(entry.supportTickets) || 0));
  const maxChats = Math.max(0, ...data.map((entry) => toNumber(entry.chatsHandled) || 0));

  return employees.map((employee) => {
    const employeeEntries = data.filter((entry) => entry.employeeName === employee.name);

    const activeEntries = employeeEntries.filter(
      (entry) => entry.testingApps === "Yes" || entry.testingApps === "No"
    );

    const testingDays = employeeEntries.filter((entry) => entry.testingApps === "Yes").length;

    const totalTickets = employee.role === "Tester" ? null : sum(employeeEntries, "supportTickets");
    const totalChats = employee.role === "Tester" ? null : sum(employeeEntries, "chatsHandled");
    const totalBugs = sum(employeeEntries, "bugsAdded");
    const totalAppReviews = employee.role === "Tester" ? null : sum(employeeEntries, "appReviews");

    const avgSystemProcess = average(employeeEntries, "systemProcess");

    const effortScores = employeeEntries.map(calculateEffort).filter((value) => value !== "");
    const avgEffortScore = effortScores.length ? round(averageValues(effortScores), 2) : 0;

    const testingScore =
      employee.role === "Tester"
        ? Math.min(5, 1 + Math.min(totalBugs / 10, 2.5) + avgEffortScore * 0.5)
        : Math.min(5, 1 + Math.min(totalBugs / 8, 1.8) + testingDays * 0.15);

    const supportScore =
      employee.role === "Tester"
        ? null
        : totalTickets + totalChats === 0
          ? 2
          : Math.min(
              5,
              2 +
                (maxTickets > 0 ? (totalTickets / maxTickets) * 1.5 : 0) +
                (maxChats > 0 ? (totalChats / maxChats) * 1.5 : 0)
            );

    const systemScore = avgSystemProcess;

    const finalScore =
      employee.role === "Tester"
        ? round(systemScore * 0.35 + testingScore * 0.4 + avgEffortScore * 0.25, 2)
        : round(systemScore * 0.35 + testingScore * 0.25 + supportScore * 0.25 + avgEffortScore * 0.15, 2);

    return {
      employee: employee.name,
      role: employee.role,
      daysWorked: activeEntries.length,
      testingDays,
      totalTickets: totalTickets ?? "N/A",
      totalChats: totalChats ?? "N/A",
      totalBugs,
      totalAppReviews: totalAppReviews ?? "N/A",
      avgSystemProcess: round(avgSystemProcess, 2),
      avgEffortScore,
      testingScore: round(testingScore, 2),
      supportScore: supportScore === null ? "N/A" : round(supportScore, 2),
      systemScore: round(systemScore, 2),
      finalScore
    };
  });
}

function sum(items, field) {
  return items.reduce((total, item) => total + (toNumber(item[field]) || 0), 0);
}

function average(items, field) {
  const values = items.map((item) => toNumber(item[field])).filter((value) => value !== null);
  return values.length ? averageValues(values) : 0;
}

function averageValues(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function category(score) {
  if (score >= 4.5) return "Excellent";
  if (score >= 3.8) return "Very Good";
  if (score >= 3) return "Good";
  if (score >= 2.5) return "Average";
  return "Needs Improvement";
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function employeeReportRows(employeeName) {
  const summary = getSummary();
  const selectedSummary = summary.find((item) => item.employee === employeeName);

  if (!selectedSummary) {
    return null;
  }

  const selectedEntries = getEntries()
    .filter((entry) => entry.employeeName === employeeName)
    .map(withEffort)
    .sort((a, b) => a.date.localeCompare(b.date));

  const reportRow = {
    employee: selectedSummary.employee,
    role: selectedSummary.role,
    finalRating: selectedSummary.finalScore,
    performanceCategory: category(selectedSummary.finalScore),
    daysWorked: selectedSummary.daysWorked,
    testingDays: selectedSummary.testingDays,
    totalTickets: selectedSummary.totalTickets,
    totalChats: selectedSummary.totalChats,
    totalBugs: selectedSummary.totalBugs,
    totalAppReviews: selectedSummary.totalAppReviews,
    avgSystemProcess: selectedSummary.avgSystemProcess,
    avgEffortScore: selectedSummary.avgEffortScore,
    testingScore: selectedSummary.testingScore,
    supportScore: selectedSummary.supportScore
  };

  return { reportRow, selectedEntries };
}

function buildEmployeeCsv(employeeName) {
  const data = employeeReportRows(employeeName);

  if (!data) {
    return null;
  }

  const { reportRow, selectedEntries } = data;
  const summaryHeaders = [
    "Employee",
    "Role",
    "Final Rating",
    "Performance Category",
    "Days Worked",
    "Testing Days",
    "Total Tickets",
    "Total Chats",
    "Total Bugs",
    "Total App Reviews",
    "Avg System Process",
    "Avg Effort Score",
    "Testing Score",
    "Support Score"
  ];
  const summaryValues = [
    reportRow.employee,
    reportRow.role,
    reportRow.finalRating,
    reportRow.performanceCategory,
    reportRow.daysWorked,
    reportRow.testingDays,
    reportRow.totalTickets,
    reportRow.totalChats,
    reportRow.totalBugs,
    reportRow.totalAppReviews,
    reportRow.avgSystemProcess,
    reportRow.avgEffortScore,
    reportRow.testingScore,
    reportRow.supportScore
  ];
  const entryHeaders = [
    "Date",
    "Testing Apps",
    "Support Tickets",
    "Chats Handled",
    "Bugs Added",
    "Quality of Testing",
    "App Reviews",
    "System Process",
    "Overall Effort",
    "Issues/Blockers",
    "Notes"
  ];
  const entryRows = selectedEntries.map((entry) => [
    entry.date,
    entry.testingApps,
    entry.supportTickets ?? "N/A",
    entry.chatsHandled ?? "N/A",
    entry.bugsAdded,
    entry.qualityOfTesting,
    entry.appReviews ?? "N/A",
    entry.systemProcess,
    entry.overallEffort || "N/A",
    entry.issuesBlockers,
    entry.notes
  ]);

  return [
    ["Team Performance Report"].map(csvValue).join(","),
    summaryHeaders.map(csvValue).join(","),
    summaryValues.map(csvValue).join(","),
    "",
    ["Daily Entries"].map(csvValue).join(","),
    entryHeaders.map(csvValue).join(","),
    ...entryRows.map((row) => row.map(csvValue).join(","))
  ].join("\n");
}

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = getUserByEmail(email || "");

  if (!user || !verifyPassword(password || "", user.passwordHash)) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    expiresAt: Date.now() + tokenMaxAgeMs
  });

  res.json({ token, user: publicUser(user) });
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json(req.user);
});

app.get("/api/users", authenticate, requireAdmin, (req, res) => {
  res.json(getUsers());
});

app.post("/api/users", authenticate, requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "Name, email, password, and role are required." });
  }

  if (!["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ message: "Invalid role." });
  }

  try {
    const result = db.prepare(
      `INSERT INTO users (name, email, passwordHash, role)
       VALUES (:name, :email, :passwordHash, :role)`
    ).run({
      name,
      email,
      passwordHash: hashPassword(password),
      role
    });

    res.status(201).json(publicUser(getUserById(result.lastInsertRowid)));
  } catch (error) {
    res.status(400).json({ message: "Unable to create user. Email may already exist." });
  }
});

app.patch("/api/users/:id", authenticate, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const existingUser = getUserById(userId);

  if (!existingUser) {
    return res.status(404).json({ message: "User not found." });
  }

  const name = req.body.name || existingUser.name;
  const email = req.body.email || existingUser.email;
  const role = req.body.role || existingUser.role;
  const passwordHash = req.body.password ? hashPassword(req.body.password) : existingUser.passwordHash;

  if (!["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ message: "Invalid role." });
  }

  db.prepare(
    `UPDATE users
     SET name = :name, email = :email, role = :role, passwordHash = :passwordHash, updatedAt = CURRENT_TIMESTAMP
     WHERE id = :id`
  ).run({ id: userId, name, email, role, passwordHash });

  res.json(publicUser(getUserById(userId)));
});

app.delete("/api/users/:id", authenticate, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);

  if (userId === req.user.id) {
    return res.status(400).json({ message: "You cannot delete your own user." });
  }

  const changes = db.prepare("DELETE FROM users WHERE id = ?").run(userId).changes;

  if (changes === 0) {
    return res.status(404).json({ message: "User not found." });
  }

  res.status(204).send();
});

app.use("/api", authenticate);

app.get("/api/employees", (req, res) => {
  res.json(employees);
});

app.get("/api/entries", (req, res) => {
  const { employee, role, date, startDate, endDate } = req.query;
  const filteredEntries = getEntries().filter((entry) => {
    const matchesEmployee = !employee || employee === "All" || entry.employeeName === employee;
    const matchesRole = !role || role === "All" || entry.role === role;
    const matchesDate = !date || entry.date === date;
    const matchesStartDate = !startDate || entry.date >= startDate;
    const matchesEndDate = !endDate || entry.date <= endDate;

    return matchesEmployee && matchesRole && matchesDate && matchesStartDate && matchesEndDate;
  });

  res.json(filteredEntries.map(withEffort));
});

// ✅ UPDATED POST API
// =======================
app.post("/api/entries", requireEditor, (req, res) => {
  const isAway =
    req.body.testingApps === "Leave" ||
    req.body.testingApps === "Holiday";

  // ✅ FIX: Force systemProcess = 0 for Holiday
  if (req.body.testingApps === "Holiday") {
    req.body.systemProcess = 0;
  }

  const requiredFields = isAway
    ? ["date", "employeeName", "testingApps"]
    : [
        "date",
        "employeeName",
        "testingApps",
        "qualityOfTesting",
        "systemProcess",
      ];

  const missingField = requiredFields.find((field) => !req.body[field]);

  if (missingField) {
    return res.status(400).json({ message: `${missingField} is required.` });
  }

  const entry = createEntry(normalizeEntry(req.body));
  res.status(201).json(withEffort(entry));
});


// =======================
// ✅ UPDATED PATCH API
// =======================
app.patch("/api/entries/:id", requireEditor, (req, res) => {
  const entryId = Number(req.params.id);
  const existingEntry = getEntryById(entryId);

  if (!existingEntry) {
    return res.status(404).json({ message: "Entry not found." });
  }

  // ✅ FIX: Force systemProcess = 0 for Holiday
  if (req.body.testingApps === "Holiday") {
    req.body.systemProcess = 0;
  }

  const entry = updateEntry(entryId, normalizeEntry(req.body, existingEntry));
  res.json(withEffort(entry));
});

app.delete("/api/entries/:id", requireEditor, (req, res) => {
  const entryId = Number(req.params.id);
  const changes = deleteEntry(entryId);

  if (changes === 0) {
    return res.status(404).json({ message: "Entry not found." });
  }

  res.status(204).send();
});

app.get("/api/summary", (req, res) => {
  const { month } = req.query;

  let allEntries = getEntries(); // ✅ use a different name

  if (month) {
    allEntries = allEntries.filter((entry) =>
      entry.date.startsWith(month)
    );
  }

  res.json(getSummary(allEntries));
});

app.get("/api/report", (req, res) => {
  const { month } = req.query;

  let allEntries = getEntries();

  if (month) {
    allEntries = allEntries.filter((entry) =>
      entry.date.startsWith(month)
    );
  }

  res.json(
    getSummary(allEntries).map((item) => ({
      employee: item.employee,
      role: item.role,
      finalRating: item.finalScore,
      performanceCategory: category(item.finalScore),
      keyStrengths:
        item.role === "Tester"
          ? "Testing quality, bug discovery, system process"
          : "Support handling, testing participation, system process"
    }))
  );
});


app.get("/api/report/:employee/export", (req, res) => {
  const employeeName = req.params.employee;
  const csv = buildEmployeeCsv(employeeName);

  if (!csv) {
    return res.status(404).json({ message: "Employee not found." });
  }

  const fileName = `${employeeName.replaceAll(" ", "_")}_performance_report.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.send(csv);
});

app.get("/api/database/export", requireAdmin, (req, res) => {
  const backup = {
    exportedAt: new Date().toISOString(),
    version: 1,
    entries: db.prepare("SELECT * FROM entries ORDER BY id ASC").all(),
    users: db.prepare("SELECT id, name, email, passwordHash, role, createdAt, updatedAt FROM users ORDER BY id ASC").all()
  };

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="team-performance-backup.json"');
  res.json(backup);
});

app.post("/api/database/import", requireAdmin, (req, res) => {
  const { entries: backupEntries, users: backupUsers } = req.body;

  if (!Array.isArray(backupEntries)) {
    return res.status(400).json({ message: "Backup must include an entries array." });
  }

  db.exec("BEGIN");

  try {
    db.exec("DELETE FROM entries");

    const insertEntry = db.prepare(
      `INSERT INTO entries (
        id, date, employeeName, role, testingApps, supportTickets, chatsHandled, bugsAdded,
        qualityOfTesting, appReviews, systemProcess, issuesBlockers, notes, createdAt, updatedAt
      )
      VALUES (
        :id, :date, :employeeName, :role, :testingApps, :supportTickets, :chatsHandled, :bugsAdded,
        :qualityOfTesting, :appReviews, :systemProcess, :issuesBlockers, :notes,
        COALESCE(:createdAt, CURRENT_TIMESTAMP), COALESCE(:updatedAt, CURRENT_TIMESTAMP)
      )`
    );

    for (const entry of backupEntries) {
      insertEntry.run({
        id: entry.id,
        date: entry.date,
        employeeName: entry.employeeName,
        role: entry.role,
        testingApps: entry.testingApps,
        supportTickets: entry.supportTickets ?? null,
        chatsHandled: entry.chatsHandled ?? null,
        bugsAdded: entry.bugsAdded ?? 0,
        qualityOfTesting: entry.qualityOfTesting ?? "N/A",
        appReviews: entry.appReviews ?? null,
        systemProcess: entry.systemProcess ?? null,
        issuesBlockers: entry.issuesBlockers ?? "",
        notes: entry.notes ?? "",
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
      });
    }

    if (Array.isArray(backupUsers) && backupUsers.length > 0) {
      db.exec("DELETE FROM users");

      const insertUser = db.prepare(
        `INSERT INTO users (id, name, email, passwordHash, role, createdAt, updatedAt)
         VALUES (:id, :name, :email, :passwordHash, :role, COALESCE(:createdAt, CURRENT_TIMESTAMP), COALESCE(:updatedAt, CURRENT_TIMESTAMP))`
      );

      for (const user of backupUsers) {
        insertUser.run({
          id: user.id,
          name: user.name,
          email: user.email,
          passwordHash: user.passwordHash,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        });
      }
    }

    db.exec("COMMIT");
    res.json({ message: "Database restored successfully." });
  } catch (error) {
    db.exec("ROLLBACK");
    res.status(400).json({ message: "Unable to import backup." });
  }
});

app.listen(port, () => {
  console.log(`Performance tracker API running at http://localhost:${port}`);
});
