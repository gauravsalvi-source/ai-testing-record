import React, { useEffect, useMemo, useState } from "react";
console.log("🔥 COMPONENT LOADED");



const exportReport = (row) => {
  const csvData = [
    ["Employee", "Role", "Rating (%)", "Category", "Key Strengths"],
    [
      row.employee,
      row.role,
      ((Number(row.finalRating || 0) / 5) * 100).toFixed(0) + "%",
      row.performanceCategory,
      row.keyStrengths,
    ],
  ];

  const csvContent =
    "data:text/csv;charset=utf-8," +
    csvData.map((r) => r.join(",")).join("\n");

  const link = document.createElement("a");
  link.href = encodeURI(csvContent);
  link.download = `${row.employee}_report.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
const rawApiBase = import.meta.env.VITE_API_BASE_URL || "";
const isLocalhost = typeof window !== "undefined" && window.location.hostname === "localhost";
const configuredApiBase = rawApiBase.replace(/\/+$/, "");
const isLocalApiBase = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?/i.test(configuredApiBase);
const API_BASE = (configuredApiBase && (isLocalhost || !isLocalApiBase) ? configuredApiBase : "") ||
  (isLocalhost
    ? "http://localhost:4000/api"
    : "https://ai-testing-record.onrender.com/api");
console.log("API BASE:", API_BASE, "HOSTNAME:", typeof window !== "undefined" ? window.location.hostname : "N/A");

const TOKEN_KEY = "performanceTrackerToken";

async function readJsonResponse(response, url) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Server returned HTML instead of JSON for ${url}`);
  }
}

const initialForm = {
  date: "2026-04-01",
  employeeName: "Shivam",
  role: "Tester",
  testingApps: "Yes",
  supportTickets: "",
  chatsHandled: "",
  bugsAdded: 0,
  qualityOfTesting: "Average",
  appReviews: "",
  systemProcess: 5,
  issuesBlockers: "",
  notes: ""
};


const testingOptions = ["Yes", "No", "Leave", "Holiday"];
const qualityOptions = ["Excellent", "Good", "Average", "Poor", "N/A"];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");


  const [currentUser, setCurrentUser] = useState(null);
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [summary, setSummary] = useState([]);

  const [selectedMonth, setSelectedMonth] = useState(
  new Date().toISOString().slice(0, 7)
);
// // 1. Filter employees who did testing, regardless of role
const testers = (summary || []).filter(
  (emp) => Number(emp.totalBugs) > 0 || Number(emp.testingDays) > 0
);

// 2. Filter supports
const supports = (summary || []).filter(
  (emp) => emp.role === "Support"
);

// 3. Tester ranking = bug count first, then testing quality.
const compareTesterPerformance = (current, best) => {
  const currentBugs = Number(current.totalBugs) || 0;
  const bestBugs = Number(best.totalBugs) || 0;

  if (currentBugs !== bestBugs) {
    return currentBugs > bestBugs;
  }

  return (Number(current.testingScore) || 0) > (Number(best.testingScore) || 0);
};

// 4. Get Top Tester (highest bugs, then highest quality wins)
const topTester = testers.length
  ? testers.reduce((max, emp) =>
      compareTesterPerformance(emp, max) ? emp : max,
      testers[0]
    )
  : null;
  
// 5. Get Top Support (based on finalScore)
const topSupport = supports.length
  ? supports.reduce((max, emp) =>
      Number(emp.finalScore) > (Number(max?.finalScore) || 0) ? emp : max,
      supports[0]
    )
  : null;

// 6. Debug logs (temporary)
console.log("🧪 Tester Scores:",
  testers.map(emp => ({
    name: emp.employee,
    bugs: emp.totalBugs,
    testing: emp.testingScore
  }))
);

console.log("🏆 Top Tester:", topTester);
console.log("🏆 Top Support:", topSupport);

  const [report, setReport] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({ employee: "All", role: "All", startDate: "", endDate: "" });
  const [activeTab, setActiveTab] = useState("daily");
  const [viewMode, setViewMode] = useState("table"); // "table" or "grid"
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedRole = form.role;
  const canEdit = ["admin", "editor"].includes(currentUser?.role);
  const isAwayEntry = form.testingApps === "Leave" || form.testingApps === "Holiday";
  


  const averageScore = summary.length
    ? (summary.reduce((total, item) => total + Number(item.finalScore || 0), 0) / summary.length).toFixed(2)
    : "0.00";

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.employee !== "All") params.set("employee", filters.employee);
    if (filters.role !== "All") params.set("role", filters.role);
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    return params.toString();
  }, [filters]);

  useEffect(() => {
    if (token) {
      loadSession();
    }
  }, [token]);

 useEffect(() => {
  if (currentUser) {
    loadEmployees();
    loadDashboard();
  }
}, [currentUser, queryString, selectedMonth]);

  async function apiFetch(path, options = {}, authToken = token) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${authToken}`
    }
  });

  const data = await readJsonResponse(res, url);
  if (!res.ok) {
    throw new Error(data.message || "Request failed");
  }

  return data; // ✅ ALWAYS JSON
}

  async function loadSession(authToken = token) {
    try {
      const user = await apiFetch("/auth/me", {}, authToken);
      setCurrentUser(user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setCurrentUser(null);
    }
  }

  async function handleLogin(credentials) {
    setError("");
    const url = `${API_BASE}/auth/login`;
    console.log("LOGIN URL:", url);

    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials)
    });

    if (!response.ok) {
      const body = await readJsonResponse(response, url).catch(() => ({}));
      throw new Error(body.message || "Unable to log in.");
    }

    const data = await readJsonResponse(response, url);
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    await loadSession(data.token);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setCurrentUser(null);
  }

  async function loadEmployees() {
    const data = await apiFetch("/employees");
    setEmployees(data);
  }

  async function loadDashboard(nextQueryString = queryString) {
    setLoading(true);
    setError("");

    try {
      const currentMonth = selectedMonth;

      const [entriesResponse, summaryResponse, reportResponse] = await Promise.all([
        apiFetch(`/entries${nextQueryString ? `?${nextQueryString}` : ""}`),
        apiFetch(`/summary?month=${currentMonth}`),
        apiFetch(`/report?month=${currentMonth}`)
      ]);

      setEntries(entriesResponse);
      setSummary(summaryResponse);
      setReport(reportResponse);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleEmployeeChange(event) {
    const employeeName = event.target.value;
    const employee = employees.find((item) => item.name === employeeName);

    setForm((currentForm) => ({
      ...currentForm,
      employeeName,
      role: employee?.role || currentForm.role,
      supportTickets: employee?.role === "Tester" ? "" : currentForm.supportTickets,
      chatsHandled: employee?.role === "Tester" ? "" : currentForm.chatsHandled,
      appReviews: employee?.role === "Tester" ? "" : currentForm.appReviews
    }));
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
  }

  function markLeave() {
    setForm((currentForm) => ({
      ...currentForm,
      testingApps: "Leave",
      supportTickets: "",
      chatsHandled: "",
      bugsAdded: 0,
      qualityOfTesting: "N/A",
      appReviews: "",
      systemProcess: "",
      issuesBlockers: currentForm.issuesBlockers || "On leave"
    }));
  }

async function handleSubmit(event) {
  event.preventDefault();
  setError("");
  setMessage("");

  try {
    await apiFetch(
      editingId ? `/entries/${editingId}` : "/entries",
      {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      }
    );

    const savedEmployeeName = form.employeeName;
    const wasEditing = Boolean(editingId);

    setMessage(
      `${wasEditing ? "Updated" : "Added"} ${savedEmployeeName}'s entry`
    );

    setForm({ ...initialForm, employeeName: savedEmployeeName, role: form.role });
    setEditingId(null);
    setFilters({ employee: "All", role: "All", startDate: "", endDate: "" });

    await loadDashboard("");
  } catch (err) {
    setError(err.message);
  }
}
  function handleEdit(entry) {
    setEditingId(entry.id);
    setMessage("");
    setForm({
      date: entry.date,
      employeeName: entry.employeeName,
      role: entry.role,
      testingApps: entry.testingApps,
      supportTickets: entry.supportTickets ?? "",
      chatsHandled: entry.chatsHandled ?? "",
      bugsAdded: entry.bugsAdded ?? 0,
      qualityOfTesting: entry.qualityOfTesting,
      appReviews: entry.appReviews ?? "",
      systemProcess: entry.systemProcess ?? 5,
      issuesBlockers: entry.issuesBlockers,
      notes: entry.notes
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(entry) {
    const confirmed = window.confirm(`Delete ${entry.employeeName}'s entry for ${entry.date}?`);
    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      await apiFetch(`/entries/${entry.id}`, { method: "DELETE" });
      if (editingId === entry.id) handleCancel();
      await loadDashboard();
      setMessage("Entry deleted.");
    } catch (err) {
      setError(err.message);
    }
  }

  function handleCancel() {
    setEditingId(null);
    setForm(initialForm);
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} error={error} setError={setError} />;
  }

  return (
    <main className="app-shell">
      <section className="page-header">
        <div>
          <p className="eyebrow">Team Base / May 2026</p>
          <h1>Team Performance Tracker</h1>
          <p className="header-copy">Daily activity, weighted scoring, and employee reports in one place.</p>
        </div>
        <div className="summary">
          <span>{summary.length}</span>
          <small>{currentUser.name}</small>
        </div>
      </section>

      <section className="stats-grid" aria-label="Performance snapshot">
        <article className="stat-card accent-blue">
          <span>Total Entries</span>
          <strong>{entries.length}</strong>
        </article>
        <article className="stat-card accent-green">
          <span>Average Score</span>
          <strong>{averageScore}</strong>
        </article>
        <article className="stat-card accent-amber">
        <span
  style={{
    display: "block",
    textAlign: "center",
    width: "100%",
    fontWeight: "600",
    marginBottom: "8px"
  }}
>
  Top Performer
</span>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "4px"
  }}
>
  <div style={{ textAlign: "left" }}>
    <span style={{ display: "block", fontSize: "12px", color: "#17c3c6" }}>
      Top Tester
    </span>
    <strong style={{ fontSize: "18px" }}>
      {topTester?.employee || "-"}
    </strong>
  </div>

  <div style={{ textAlign: "right" }}>
    <span style={{ display: "block", fontSize: "12px", color: "#a94e9a" }}>
      Top Support
    </span>
    <strong style={{ fontSize: "18px" }}>
      {topSupport?.employee || "-"}
    </strong>
  </div>
</div>

        </article>
        <article className="stat-card accent-rose">
          <span>Active View</span>
          <strong>{activeTab === "daily" ? "Daily" : activeTab === "summary" ? "Summary" : "Report"}</strong>
        </article>
      </section>

      <div className="base-bar">
        <nav className="tabs" aria-label="Tracker views">
          <button className={activeTab === "daily" ? "active" : ""} onClick={() => setActiveTab("daily")}>
            Daily Tracker
          </button>
          <button className={activeTab === "summary" ? "active" : ""} onClick={() => setActiveTab("summary")}>
            Monthly Summary
          </button>
          <button className={activeTab === "report" ? "active" : ""} onClick={() => setActiveTab("report")}>
            Final Report
          </button>
          {currentUser.role === "admin" && (
            <button className={activeTab === "admin" ? "active" : ""} onClick={() => setActiveTab("admin")}>
              Admin
            </button>
          )}
        </nav>
        <div className="view-tools">
          <button 
            type="button"
            className={`view-toggle ${viewMode === "grid" ? "active" : ""}`}
            onClick={() => setViewMode(viewMode === "grid" ? "table" : "grid")}
            title={`Switch to ${viewMode === "grid" ? "table" : "grid"} view`}
          >
            {viewMode === "grid" ? "📊 Table view" : "📋 Grid view"}
          </button>
          <span>{entries.length} records</span>
          <button type="button" className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="success">{message}</div>}

      {activeTab === "daily" && (
        <section className="workspace">
          {canEdit && (
          <form className="tracker-form" onSubmit={handleSubmit}>
            <div className="form-heading">
              <h2>{editingId ? "Edit Daily Entry" : "Add Daily Entry"}</h2>
              <div className="form-actions">
                <button type="button" className="leave-button" onClick={markLeave}>
                  Mark Leave
                </button>
                {editingId && (
                  <button type="button" className="secondary-button" onClick={handleCancel}>
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <label>
              Date
              <input type="date" name="date" value={form.date} onChange={handleChange} required />
            </label>

            <div className="form-row">
              <label>
                Employee
                <select name="employeeName" value={form.employeeName} onChange={handleEmployeeChange}>
                  {employees.map((employee) => (
                    <option key={employee.name}>{employee.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Role
                <input name="role" value={form.role} readOnly />
              </label>
            </div>

            <div className="form-row">
              <label>
                Testing Apps
                <select name="testingApps" value={form.testingApps} onChange={handleChange}>
                  {testingOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label>
                Quality
                <select name="qualityOfTesting" value={form.qualityOfTesting} onChange={handleChange}>
                  {qualityOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            {isAwayEntry && (
              <div className="leave-note">
                This entry is marked as {form.testingApps}. Work metrics and effort score will be skipped.
              </div>
            )}

            {!isAwayEntry && selectedRole !== "Tester" && (
              <div className="form-row">
                <label>
                  Support Tickets
                  <input type="number" min="0" name="supportTickets" value={form.supportTickets} onChange={handleChange} />
                </label>

                <label>
                  Chats Handled
                  <input type="number" min="0" name="chatsHandled" value={form.chatsHandled} onChange={handleChange} />
                </label>
              </div>
            )}

            {!isAwayEntry && (
              <div className="form-row">
                <label>
                  Bugs Added
                  <input type="number" min="0" name="bugsAdded" value={form.bugsAdded} onChange={handleChange} />
                </label>

                <label>
                  System Process
                  <input type="number" min="1" max="5" step="0.1" name="systemProcess" value={form.systemProcess} onChange={handleChange} required />
                </label>
              </div>
            )}

            {!isAwayEntry && selectedRole !== "Tester" && (
              <label>
                App Reviews
                <input type="number" min="0" name="appReviews" value={form.appReviews} onChange={handleChange} />
              </label>
            )}

            <label>
              Issues / Blockers
              <textarea name="issuesBlockers" value={form.issuesBlockers} onChange={handleChange} rows="3" />
            </label>

            <label>
              Notes
              <textarea name="notes" value={form.notes} onChange={handleChange} rows="3" />
            </label>

            <button type="submit">{editingId ? "Save Changes" : "Add Entry"}</button>
          </form>
          )}

          <section className="data-panel">
            <div className="view-header">
              <div>
                <h2>Daily records</h2>
                <p>Filter by employee, role, or date range.</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setFilters({ employee: "All", role: "All", startDate: "", endDate: "" });
                  loadDashboard("");
                }}
              >
                Refresh
              </button>
            </div>
            <div className="filters">
              <label>
                Employee
                <select value={filters.employee} onChange={(event) => setFilters({ ...filters, employee: event.target.value })}>
                  <option>All</option>
                  {employees.map((employee) => (
                    <option key={employee.name}>{employee.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Role
                <select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
                  <option>All</option>
                  <option>Tester</option>
                  <option>Support</option>
                </select>
              </label>

              <label>
                From
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(event) => setFilters({ ...filters, startDate: event.target.value })}
                />
              </label>

              <label>
                To
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(event) => setFilters({ ...filters, endDate: event.target.value })}
                />
              </label>
            </div>

            <DataTable loading={loading} entries={entries} canEdit={canEdit} onEdit={handleEdit} onDelete={handleDelete} viewMode={viewMode} />
          </section>
        </section>
      )}

{activeTab === "summary" && (
  <section className="data-panel full-panel">

    <div style={{ marginBottom: "10px" }}>
      <label style={{ marginRight: "10px" }}>Select Month:</label>
      <input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
      />
    </div>

    <SummaryTable rows={summary} />
  </section>
)}
    {activeTab === "report" && <ReportTable rows={report} token={token} />}
      {activeTab === "admin" && currentUser.role === "admin" && <AdminPanel token={token} apiFetch={apiFetch} />}
    </main>
  );
}

function LoginScreen({ onLogin, error, setError }) {
  const [credentials, setCredentials] = useState({ email: "admin@example.com", password: "admin123" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await onLogin(credentials);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Team Base</p>
        <h1>Sign in</h1>
        {error && <div className="alert">{error}</div>}
        <label>
          Email
          <input
            type="email"
            value={credentials.email}
            onChange={(event) => setCredentials({ ...credentials, email: event.target.value })}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={credentials.password}
            onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </button>
        <p className="login-help">Default admin: admin@example.com / admin123</p>
      </form>
    </main>
  );
}

function DataTable({ loading, entries, canEdit, onEdit, onDelete, viewMode = "table" }) {
  if (viewMode === "grid") {
    return (
      <div className="grid-wrap">
        {loading ? (
          <div className="empty-state">Loading entries...</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">No entries match the filters.</div>
        ) : (
          <div className="entries-grid">
            {entries.map((entry) => (
              <div key={entry.id} className="entry-card">
                <div className="card-header">
                  <h3>{entry.employeeName}</h3>
                  <span className="role-chip">{entry.role}</span>
                </div>
                <div className="card-body">
                  <div className="card-field">
                    <strong>Date:</strong> {entry.date}
                  </div>
                  <div className="card-field">
                    <strong>Testing:</strong> <span className={`status-chip status-${entry.testingApps.toLowerCase()}`}>{entry.testingApps}</span>
                  </div>
                  <div className="card-row">
                    <div className="card-field">
                      <strong>Tickets:</strong> {entry.supportTickets ?? "N/A"}
                    </div>
                    <div className="card-field">
                      <strong>Chats:</strong> {entry.chatsHandled ?? "N/A"}
                    </div>
                    <div className="card-field">
                      <strong>Bugs:</strong> {entry.bugsAdded}
                    </div>
                  </div>
                  <div className="card-row">
                    <div className="card-field">
                      <strong>Quality:</strong>
                      {["leave", "holiday"].includes((entry.testingApps || "").toLowerCase().trim()) ? (
                        "N/A"
                      ) : (
                        <span className={`quality-chip quality-${(entry.qualityOfTesting || "na").toLowerCase().replace("/", "")}`}>
                          {entry.qualityOfTesting || "N/A"}
                        </span>
                      )}
                    </div>
                    <div className="card-field">
                      <strong>Reviews:</strong> {entry.appReviews ?? "N/A"}
                    </div>
                  </div>
                  <div className="card-row">
                    <div className="card-field">
                      <strong>System:</strong> {entry.testingApps === "Leave" || entry.testingApps === "Holiday" ? "N/A" : entry.systemProcess}
                    </div>
                    <div className="card-field">
                      <strong>Effort:</strong> <span className={`score-pill ${scoreClass(entry.overallEffort)}`}>{entry.overallEffort || "N/A"}</span>
                    </div>
                  </div>
                  <div className="card-field">
                    <strong>Issues:</strong> {entry.issuesBlockers || "-"}
                  </div>
                  <div className="card-field">
                    <strong>Notes:</strong> {entry.notes || "-"}
                  </div>
                </div>
                {canEdit && (
                  <div className="card-actions">
                    <button type="button" className="table-button" onClick={() => onEdit(entry)}>Edit</button>
                    <button type="button" className="table-button danger-button" onClick={() => onDelete(entry)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Employee</th>
            <th>Role</th>
            <th>Testing</th>
            <th>Tickets</th>
            <th>Chats</th>
            <th>Bugs</th>
            <th>Quality</th>
            <th>Reviews</th>
            <th>System</th>
            <th>Effort</th>
            <th>Issues</th>
            <th>Notes</th>
            {canEdit && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={canEdit ? 14 : 13} className="empty-state">Loading entries...</td>
            </tr>
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={canEdit ? 14 : 13} className="empty-state">No entries match the filters.</td>
            </tr>
          ) : (
            entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.date}</td>
                <td>{entry.employeeName}</td>
                <td><span className="role-chip">{entry.role}</span></td>
                <td><span className={`status-chip status-${entry.testingApps.toLowerCase()}`}>{entry.testingApps}</span></td>
                <td>{entry.supportTickets ?? "N/A"}</td>
                <td>{entry.chatsHandled ?? "N/A"}</td>
          <td>{entry.bugsAdded}</td>

<td>
  {["leave", "holiday"].includes(
    (entry.testingApps || "").toLowerCase().trim()
  ) ? (
    "N/A"
  ) : (
    <span
      className={`quality-chip quality-${(entry.qualityOfTesting || "na")
        .toLowerCase()
        .replace("/", "")}`}
    >
      {entry.qualityOfTesting || "N/A"}
    </span>
  )}
</td>

<td>{entry.appReviews ?? "N/A"}</td>
               <td>
  {entry.testingApps === "Leave" || entry.testingApps === "Holiday"
    ? "N/A"
    : entry.systemProcess}
</td>
                <td><span className={`score-pill ${scoreClass(entry.overallEffort)}`}>{entry.overallEffort || "N/A"}</span></td>
                <td>{entry.issuesBlockers || "-"}</td>
                <td>{entry.notes || "-"}</td>
                {canEdit && <td>
                  <div className="table-actions">
                    <button type="button" className="table-button" onClick={() => onEdit(entry)}>Edit</button>
                    <button type="button" className="table-button danger-button" onClick={() => onDelete(entry)}>Delete</button>
                  </div>
                </td>}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryTable({ rows }) {
  return (
    <section className="data-panel full-panel">
      <div className="panel-heading">
        <h2>Monthly Performance Summary</h2>
        <p>System Process has the highest weight, matching the workbook logic.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Employee", "Role", "Days", "Testing Days", "Tickets", "Chats", "Bugs", "Reviews", "Avg System", "Avg Effort", "Testing", "Support", "Final"].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.employee}>
                <td>{row.employee}</td>
                <td><span className="role-chip">{row.role}</span></td>
                <td>{row.daysWorked}</td>
                <td>{row.testingDays}</td>
                <td>{row.totalTickets}</td>
                <td>{row.totalChats}</td>
                <td>{row.totalBugs}</td>
                <td>{row.totalAppReviews}</td>
                <td>{row.avgSystemProcess}</td>
                <td>{row.avgEffortScore}</td>
                <td>{row.testingScore}</td>
                <td>{row.supportScore}</td>
                <td><span className={`score-pill ${scoreClass(row.finalScore)}`}>{row.finalScore}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportTable({ rows, token }) {

  // ✅ FUNCTION INSIDE COMPONENT
  const exportAllReports = () => {
    const safe = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const csvData = [
      ["Employee", "Role", "Rating (%)", "Category", "Key Strengths"],
      ...rows.map((row) => [
        safe(row.employee || ""),
        safe(row.role || ""),
        safe(
          row.finalRating !== undefined
            ? ((Number(row.finalRating) / 5) * 100).toFixed(0) + "%"
            : "0%"
        ),
        safe(row.performanceCategory || ""),
        safe(row.keyStrengths || ""),
      ]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      csvData.map((r) => r.join(",")).join("\n");

    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = "Team_Performance_Report.csv";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  return (
    <section className="data-panel full-panel">
      <div className="panel-heading">
  <h2>Final Report</h2>
  <p>Final category is calculated from the monthly final rating.</p>

  <button
    type="button"
    className="export-button"
    onClick={exportAllReports}
  >
    Export Full CSV
  </button>
</div>
      <div className="report-grid">
        {rows.map((row) => (
          <article className="report-card" key={row.employee}>
            <div>
              <h3>{row.employee}</h3>
              <span className="role-chip">{row.role}</span>
            </div>
            <strong className={scoreClass(row.finalRating)}>{row.finalRating}</strong>
            <p className={`category-badge ${categoryClass(row.performanceCategory)}`}>{row.performanceCategory}</p>
          <small>{row.keyStrengths}</small>


<button
  type="button"
  className="export-button"
  onClick={() => exportReport(row)}
>
  Export CSV
</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminPanel({ token, apiFetch }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "editor" });
  const [backupText, setBackupText] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    const response = await apiFetch("/users");
setUsers(response);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    try {
      await apiFetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      setForm({ name: "", email: "", password: "", role: "editor" });
      setMessage("User created.");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete ${user.email}?`)) return;

    await apiFetch(`/users/${user.id}`, { method: "DELETE" });
    await loadUsers();
  }

  function exportBackup() {
    window.open(`${API_BASE}/database/export?token=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
  }

  function handleBackupFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setBackupText(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function importBackup() {
    setMessage("");
    setError("");

    try {
      const parsedBackup = JSON.parse(backupText);
      await apiFetch("/database/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedBackup)
      });

      setMessage("Backup imported. Refresh the tracker views to see restored data.");
      setBackupText("");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="admin-grid">
      <form className="tracker-form admin-form" onSubmit={handleSubmit}>
        <h2>Create user</h2>
        {error && <div className="alert">{error}</div>}
        {message && <div className="success">{message}</div>}
        <label>
          Name
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
        </label>
        <label>
          Role
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option>admin</option>
            <option>editor</option>
            <option>viewer</option>
          </select>
        </label>
        <button type="submit">Create User</button>
      </form>
      <section className="data-panel">
        <div className="view-header">
          <div>
            <h2>Users</h2>
            <p>Admins can create and remove users.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td><span className="role-chip">{user.role}</span></td>
                  <td>
                    <button type="button" className="table-button danger-button" onClick={() => deleteUser(user)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="data-panel backup-panel">
        <div className="view-header">
          <div>
            <h2>Database Backup</h2>
            <p>Export or restore entries and users as JSON.</p>
          </div>
        </div>
        <div className="backup-tools">
          <button type="button" onClick={exportBackup}>Export Backup</button>
          <label>
            Import Backup File
            <input type="file" accept="application/json,.json" onChange={handleBackupFile} />
          </label>
          <label>
            Backup JSON
            <textarea rows="8" value={backupText} onChange={(event) => setBackupText(event.target.value)} />
          </label>
          <button type="button" className="danger-button" onClick={importBackup} disabled={!backupText.trim()}>
            Restore Backup
          </button>
        </div>
      </section>
    </section>
  );
}

function scoreClass(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "";
  if (value >= 4.5) return "score-excellent";
  if (value >= 3.8) return "score-strong";
  if (value >= 3) return "score-good";
  if (value >= 2.5) return "score-average";
  return "score-low";
}

function categoryClass(category) {
  return category.toLowerCase().replaceAll(" ", "-");
}

export default App;
