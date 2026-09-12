import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AgGridReact } from "ag-grid-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  Download,
  Edit3,
  FileCheck2,
  FileSpreadsheet,
  Gauge,
  GraduationCap,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  User,
  UserCog,
  Sun,
  Unlock,
  Upload,
  Users,
} from "lucide-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const ADMIN_USERNAME = import.meta.env.VITE_ADMIN_USERNAME || import.meta.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || import.meta.env.ADMIN_PASSWORD || "admin123";
const ADMIN_SESSION_MS = 60 * 60 * 1000;
const ADMIN_CREDENTIAL_KEY = "cats-admin-credentials";

type Stats = Record<string, number | string>;
type ValidationItem = { check: string; status: string; message: string; row?: number | null; code?: string | null };
type AuditEvent = { timestamp: string; action_type: string; reason: string; admin_user: string };
type Allocation = {
  subject_code: string;
  subject_name: string;
  priority: string | number;
  status: string;
  slot: number;
  reason?: string;
  match_confidence?: number;
};
type FacultyRow = {
  emp_id: string;
  faculty_name: string;
  designation: string;
  admin_role: string;
  status: string;
  workload_hours: number;
  allocations: Allocation[];
};
type AllocationTableRow = {
  id: string;
  faculty: string;
  emp_id: string;
  subject: string;
  subject_code: string;
  priority: string | number;
  workload: number;
  status: string;
};
type SubjectAnalyticsRow = {
  subject_code: string;
  subject_name: string;
  required_sections: number | string;
  allocated_sections: number;
  remaining_sections: number | string;
};
type UploadState = {
  faculty?: string;
  subjects?: string;
  combined?: string;
  rulebook?: string;
};
type LocalAuditEvent = AuditEvent & {
  faculty?: string;
  old_subject?: string;
  new_subject?: string;
};
type ManualOverrideForm = {
  empId: string;
  slot: number;
  subjectCode: string;
  reason: string;
  confirmOverride: boolean;
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "upload", label: "Data Upload", icon: Upload },
  { id: "validation", label: "Validation", icon: ClipboardCheck },
  { id: "optimization", label: "Optimization", icon: SlidersHorizontal },
  { id: "results", label: "Allocation Results", icon: FileSpreadsheet },
  { id: "faculty", label: "Faculty Analytics", icon: Users },
  { id: "subjects", label: "Subject Analytics", icon: Database },
  { id: "reports", label: "Reports", icon: Download },
  { id: "audit", label: "Audit Logs", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];

const emptyStats: Stats = {
  total_faculty: 0,
  total_subjects: 0,
  total_sections: 0,
  allocated_sections: 0,
  coverage_percent: 0,
  remaining_sections: 0,
};

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value: unknown): string {
  return `${asNumber(value).toFixed(asNumber(value) % 1 === 0 ? 0 : 1)}%`;
}

function defaultAdminCredentials() {
  return { username: ADMIN_USERNAME, password: ADMIN_PASSWORD };
}

function readAdminCredentials() {
  try {
    const stored = localStorage.getItem(ADMIN_CREDENTIAL_KEY);
    if (!stored) return defaultAdminCredentials();
    const parsed = JSON.parse(stored) as { username?: string; password?: string };
    return {
      username: parsed.username || ADMIN_USERNAME,
      password: parsed.password || ADMIN_PASSWORD,
    };
  } catch {
    return defaultAdminCredentials();
  }
}

function normalizeFacultyRows(payload: unknown): FacultyRow[] {
  const data = payload as { faculty?: unknown[] };
  if (!Array.isArray(data?.faculty)) return [];
  return data.faculty.map((item: any) => ({
    emp_id: String(item.emp_id ?? item.employee_id ?? ""),
    faculty_name: String(item.faculty_name ?? item.name ?? ""),
    designation: String(item.designation ?? ""),
    admin_role: String(item.admin_role ?? ""),
    status: String(item.status ?? ""),
    workload_hours: asNumber(item.workload_hours ?? item.workload ?? 0),
    allocations: Array.isArray(item.allocations)
      ? item.allocations.map((allocation: any) => ({
          subject_code: String(allocation.subject_code ?? allocation.code ?? ""),
          subject_name: String(allocation.subject_name ?? allocation.name ?? ""),
          priority: allocation.priority ?? "",
          status: String(allocation.status ?? item.status ?? ""),
          slot: asNumber(allocation.slot ?? 1),
          reason: allocation.reason ?? "",
          match_confidence: allocation.match_confidence,
        }))
      : [],
  }));
}

function App() {
  const [activeView, setActiveView] = useState(() => (window.location.pathname.toLowerCase().startsWith("/admin") ? "admin" : "dashboard"));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("cats-theme") === "dark");
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<FacultyRow[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [validation, setValidation] = useState<ValidationItem[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [hierarchy, setHierarchy] = useState("bottom-up");
  const [duplicatePolicy, setDuplicatePolicy] = useState("merge");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("System Online");
  const [lastRun, setLastRun] = useState<string>("Not run yet");
  const [uploads, setUploads] = useState<UploadState>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyRow | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(() => {
    const expires = Number(localStorage.getItem("cats-admin-expires") || 0);
    return Date.now() < expires;
  });
  const [adminUser, setAdminUser] = useState(() => localStorage.getItem("cats-admin-user") || "");
  const [allocationLocked, setAllocationLocked] = useState(() => localStorage.getItem("cats-allocation-locked") === "true");
  const [localAudit, setLocalAudit] = useState<LocalAuditEvent[]>([]);
  const [adminCredentials, setAdminCredentials] = useState(readAdminCredentials);
  const [manualForm, setManualForm] = useState<ManualOverrideForm>({
    empId: "",
    slot: 1,
    subjectCode: "",
    reason: "",
    confirmOverride: false,
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("cats-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("cats-allocation-locked", String(allocationLocked));
  }, [allocationLocked]);

  useEffect(() => {
    if (!adminAuthenticated) return;
    const timer = window.setInterval(() => {
      const expires = Number(localStorage.getItem("cats-admin-expires") || 0);
      if (Date.now() >= expires) {
        logoutAdmin();
        setStatus("Admin session expired");
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [adminAuthenticated]);

  useEffect(() => {
    const target = activeView === "admin" ? "/admin" : "/";
    if (window.location.pathname !== target) {
      window.history.pushState(null, "", target);
    }
  }, [activeView]);

  useEffect(() => {
    if (["results", "faculty", "subjects", "admin"].includes(activeView) && rows.length === 0 && !resultsLoading) {
      loadResults();
    }
  }, [activeView]);

  const liveStats = stats || emptyStats;

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const haystack = `${row.emp_id} ${row.faculty_name} ${row.designation} ${row.status} ${row.allocations
        .map((item) => `${item.subject_code} ${item.subject_name}`)
        .join(" ")}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, rows, statusFilter]);

  const allocationRows = useMemo<AllocationTableRow[]>(() => {
    return filteredRows.flatMap((row) => {
      if (row.allocations.length === 0) {
        return [{
          id: `${row.emp_id}-empty`,
          faculty: row.faculty_name,
          emp_id: row.emp_id,
          subject: "Not allocated",
          subject_code: "",
          priority: "",
          workload: row.workload_hours,
          status: row.status,
        }];
      }
      return row.allocations.map((allocation) => ({
        id: `${row.emp_id}-${allocation.slot}-${allocation.subject_code}`,
        faculty: row.faculty_name,
        emp_id: row.emp_id,
        subject: allocation.subject_name,
        subject_code: allocation.subject_code,
        priority: allocation.priority,
        workload: row.workload_hours,
        status: allocation.status || row.status,
      }));
    });
  }, [filteredRows]);

  const subjectRows = useMemo<SubjectAnalyticsRow[]>(() => {
    const map = new Map<string, { subject_code: string; subject_name: string; allocated_sections: number; faculty: string[] }>();
    rows.forEach((row) => {
      row.allocations.forEach((allocation) => {
        const current = map.get(allocation.subject_code) || {
          subject_code: allocation.subject_code,
          subject_name: allocation.subject_name,
          allocated_sections: 0,
          faculty: [],
        };
        current.allocated_sections += 1;
        current.faculty.push(row.faculty_name);
        map.set(allocation.subject_code, current);
      });
    });
    const coverageComplete = asNumber(liveStats.remaining_sections) === 0 && asNumber(liveStats.total_sections) > 0;
    return Array.from(map.values())
      .map((subject) => ({
        subject_code: subject.subject_code,
        subject_name: subject.subject_name,
        allocated_sections: subject.allocated_sections,
        required_sections: coverageComplete ? subject.allocated_sections : "Unavailable",
        remaining_sections: coverageComplete ? 0 : "Unavailable",
      }))
      .sort((a, b) => b.allocated_sections - a.allocated_sections);
  }, [liveStats.remaining_sections, liveStats.total_sections, rows]);

  const priorityData = useMemo(
    () => [1, 2, 3, 4].map((priority) => ({ label: `Priority ${priority}`, value: asNumber(liveStats[`priority_${priority}`]) })),
    [liveStats],
  );

  const workloadData = useMemo(() => {
    const buckets = [
      { label: "0-4", value: 0 },
      { label: "5-8", value: 0 },
      { label: "9-12", value: 0 },
      { label: "13+", value: 0 },
    ];
    rows.forEach((row) => {
      if (row.workload_hours <= 4) buckets[0].value += 1;
      else if (row.workload_hours <= 8) buckets[1].value += 1;
      else if (row.workload_hours <= 12) buckets[2].value += 1;
      else buckets[3].value += 1;
    });
    return buckets;
  }, [rows]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      row.allocations.forEach((allocation) => {
        map.set(allocation.subject_code, allocation.subject_name);
      });
    });
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const mergedAudit = useMemo<LocalAuditEvent[]>(() => {
    return [...localAudit, ...audit].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [audit, localAudit]);

  const selectedManualFaculty = useMemo(() => rows.find((row) => row.emp_id === manualForm.empId) || null, [manualForm.empId, rows]);

  const manualConflicts = useMemo(() => {
    const warnings: string[] = [];
    const faculty = selectedManualFaculty;
    if (!faculty || !manualForm.subjectCode) return warnings;
    const chosenSubject = subjectOptions.find((subject) => subject.code === manualForm.subjectCode);
    const currentSlot = faculty.allocations.find((allocation) => allocation.slot === manualForm.slot);
    if (!currentSlot) warnings.push("Selected slot is empty; this will add a new manual allocation.");
    if (faculty.allocations.some((allocation) => allocation.subject_code === manualForm.subjectCode && allocation.slot !== manualForm.slot)) {
      warnings.push("Duplicate allocation risk: this faculty already has the selected subject.");
    }
    if (faculty.workload_hours >= 14 && (!currentSlot || currentSlot.subject_code !== manualForm.subjectCode)) {
      warnings.push("Faculty workload is at or above the recommended maximum.");
    }
    if (!chosenSubject) warnings.push("Selected subject is not present in current allocation results.");
    return warnings;
  }, [manualForm, selectedManualFaculty, subjectOptions]);

  async function upload(path: "faculty" | "subjects" | "combined", file: File) {
    const body = new FormData();
    body.append("file", file);
    const queryString = path === "subjects" || path === "combined" ? `?duplicate_policy=${duplicatePolicy}` : "";
    setStatus(`Uploading ${file.name}`);
    const res = await fetch(`${API}/upload/${path}${queryString}`, { method: "POST", body });
    const data = await res.json();
    setUploads((current) => ({ ...current, [path]: file.name }));
    setValidation(data.issues || []);
    setStatus(res.ok ? "Upload completed" : "Upload failed");
  }

  async function runAllocation() {
    setBusy(true);
    setStatus("Optimization running");
    try {
      const res = await fetch(`${API}/allocation/run?hierarchy_mode=${hierarchy}&duplicate_policy=${duplicatePolicy}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Allocation failed");
      setStats(data.statistics);
      setValidation(data.validation || []);
      const resultRes = await fetch(`${API}/results`);
      const resultData = await resultRes.json();
      const normalizedRows = normalizeFacultyRows(resultData);
      setRows(normalizedRows);
      setResultsError("");
      setSelectedFaculty(normalizedRows[0] || null);
      const auditRes = await fetch(`${API}/audit`);
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAudit(auditData.events || []);
      }
      setLastRun(new Date().toLocaleString());
      setStatus("Allocation completed");
      setActiveView("dashboard");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Allocation failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadResults() {
    setResultsLoading(true);
    setResultsError("");
    try {
      const res = await fetch(`${API}/results`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "No allocation results are available.");
      const normalizedRows = normalizeFacultyRows(data);
      setRows(normalizedRows);
      setSelectedFaculty((current) => current || normalizedRows[0] || null);
      const statsRes = await fetch(`${API}/statistics`);
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (normalizedRows.length === 0) {
        setResultsError("No faculty allocation records were returned by the server.");
      }
    } catch (error) {
      setResultsError(error instanceof Error ? error.message : "Unable to load allocation results.");
    } finally {
      setResultsLoading(false);
    }
  }

  function loginAdmin(username: string, password: string): boolean {
    if (username === adminCredentials.username && password === adminCredentials.password) {
      const expires = Date.now() + ADMIN_SESSION_MS;
      localStorage.setItem("cats-admin-expires", String(expires));
      localStorage.setItem("cats-admin-user", username);
      setAdminAuthenticated(true);
      setAdminUser(username);
      setStatus("Admin authenticated");
      setLocalAudit((current) => [
        ...current,
        {
          timestamp: new Date().toISOString(),
          action_type: "Admin Login",
          reason: "Admin session started",
          admin_user: username,
        },
      ]);
      return true;
    }
    setStatus("Invalid admin credentials");
    return false;
  }

  function logoutAdmin() {
    localStorage.removeItem("cats-admin-expires");
    localStorage.removeItem("cats-admin-user");
    setAdminAuthenticated(false);
    setAdminUser("");
    setUserMenuOpen(false);
    setStatus("Admin logged out");
  }

  function updateAdminCredentials(username: string, password: string) {
    const next = { username, password };
    localStorage.setItem(ADMIN_CREDENTIAL_KEY, JSON.stringify(next));
    setAdminCredentials(next);
    setAdminUser(username);
    localStorage.setItem("cats-admin-user", username);
    setStatus("Admin credentials updated");
    setLocalAudit((current) => [
      ...current,
      {
        timestamp: new Date().toISOString(),
        action_type: "Admin Credentials Updated",
        reason: "Security settings changed from frontend admin settings",
        admin_user: username,
      },
    ]);
  }


  function setLockState(locked: boolean) {
    setAllocationLocked(locked);
    setLocalAudit((current) => [
      ...current,
      {
        timestamp: new Date().toISOString(),
        action_type: locked ? "Allocation Locked" : "Allocation Unlocked",
        reason: locked ? "Final allocation locked by admin" : "Allocation reopened for manual modification",
        admin_user: adminUser || "admin",
      },
    ]);
  }

  async function applyManualOverride() {
    const faculty = selectedManualFaculty;
    const subject = subjectOptions.find((item) => item.code === manualForm.subjectCode);
    if (!faculty || !subject || !manualForm.reason.trim()) {
      setStatus("Select faculty, subject, and reason before saving");
      return;
    }
    if (allocationLocked) {
      setStatus("Allocation is locked. Unlock before editing.");
      return;
    }
    if (manualConflicts.length > 0 && !manualForm.confirmOverride) {
      setStatus("Review conflict warnings and confirm override");
      return;
    }

    const before = faculty.allocations.find((allocation) => allocation.slot === manualForm.slot);
    const nextAllocation: Allocation = {
      subject_code: subject.code,
      subject_name: subject.name,
      priority: "manual",
      status: "MANUAL OVERRIDE",
      slot: manualForm.slot,
      reason: manualForm.reason,
      match_confidence: 100,
    };

    setRows((current) =>
      current.map((row) => {
        if (row.emp_id !== faculty.emp_id) return row;
        const withoutSlot = row.allocations.filter((allocation) => allocation.slot !== manualForm.slot);
        return {
          ...row,
          status: "MANUAL OVERRIDE",
          allocations: [...withoutSlot, nextAllocation].sort((a, b) => a.slot - b.slot),
        };
      }),
    );

    setLocalAudit((current) => [
      ...current,
      {
        timestamp: new Date().toISOString(),
        action_type: "Manual Override",
        reason: manualForm.reason,
        admin_user: adminUser || "admin",
        faculty: faculty.faculty_name,
        old_subject: before ? `${before.subject_code} - ${before.subject_name}` : "Empty slot",
        new_subject: `${subject.code} - ${subject.name}`,
      },
    ]);

    const params = new URLSearchParams({
      emp_id: faculty.emp_id,
      subject_code: subject.code,
      reason: manualForm.reason,
      admin_user: adminUser || "admin",
    });
    fetch(`${API}/override?${params.toString()}`, { method: "POST" }).catch(() => undefined);
    setManualForm((current) => ({ ...current, reason: "", confirmOverride: false }));
    setStatus("Manual override applied");
  }

  const facultyColumns = [
    { field: "emp_id", headerName: "EMP ID", width: 110 },
    { field: "faculty_name", headerName: "Faculty", flex: 1.2 },
    { field: "designation", width: 170 },
    { field: "status", width: 190 },
    { field: "workload_hours", headerName: "Hours", width: 95 },
    {
      headerName: "Allocated Subjects",
      flex: 1.4,
      valueGetter: (p: any) => p.data.allocations.map((a: Allocation) => `${a.subject_code} (${a.priority})`).join(", "),
    },
  ];

  const allocationColumns = [
    { field: "faculty", headerName: "Faculty", flex: 1.2 },
    { field: "subject", headerName: "Subject", flex: 1.4 },
    { field: "priority", headerName: "Priority", width: 120 },
    { field: "workload", headerName: "Workload", width: 120 },
    { field: "status", headerName: "Status", width: 190 },
  ];

  const subjectColumns = [
    { field: "subject_code", headerName: "Subject Code", width: 180 },
    { field: "subject_name", headerName: "Subject", flex: 1.4 },
    { field: "required_sections", headerName: "Required Sections", width: 170 },
    { field: "allocated_sections", headerName: "Allocated Sections", width: 170 },
    { field: "remaining_sections", headerName: "Remaining Sections", width: 175 },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>
        <div className="brand">
          <div className="brand-mark"><GraduationCap size={22} /></div>
          {sidebarOpen && (
            <div>
              <strong>AI Allocation Platform</strong>
              <span>GITAM CSE | Intelligent Faculty Management System</span>
            </div>
          )}
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item ${activeView === item.id ? "active" : ""}`} onClick={() => setActiveView(item.id)}>
                <Icon size={18} />
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <button className="collapse-btn" onClick={() => setSidebarOpen((value) => !value)}>
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          {sidebarOpen && <span>Collapse</span>}
        </button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>{activeView === "admin" ? "Admin Panel" : navItems.find((item) => item.id === activeView)?.label || "Dashboard"}</h1>
          </div>
          <div className="topbar-actions">
            <span className="status-pill"><span className="pulse" /> {status}</span>
            <span className="muted">Last run: {lastRun}</span>
            <button className="icon-btn" onClick={() => setDarkMode((value) => !value)} title="Toggle theme">
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="user-menu">
              <button className="profile" onClick={() => setUserMenuOpen((value) => !value)}>
                <User size={16} /> {adminAuthenticated ? adminUser || "Admin" : "Admin"} <ChevronRight size={14} />
              </button>
              {userMenuOpen && (
                <div className="user-dropdown">
                  <button onClick={() => setActiveView("faculty")}><User size={15} /> Profile</button>
                  <button onClick={() => { setActiveView("admin"); setUserMenuOpen(false); }}><UserCog size={15} /> Admin Panel</button>
                  <button onClick={() => { setActiveView("settings"); setUserMenuOpen(false); }}><Settings size={15} /> System Settings</button>
                  <button onClick={logoutAdmin}><LogOut size={15} /> Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          {activeView === "dashboard" && (
            <>
              <HeroCard stats={liveStats} lastRun={lastRun} />
              <KpiGrid stats={liveStats} />
              <section className="analytics-grid">
                <Panel title="Allocation Priority Distribution" icon={BarChart3}>
                  <DonutChart data={priorityData} />
                </Panel>
                <Panel title="Workload Distribution" icon={Gauge}>
                  <BarChart data={workloadData} />
                </Panel>
                <Panel title="Coverage Progress" icon={Activity}>
                  <CircularProgress value={asNumber(liveStats.coverage_percent)} label={pct(liveStats.coverage_percent)} />
                </Panel>
                <Panel title="Faculty Satisfaction" icon={CheckCircle2}>
                  <CircularProgress value={asNumber(liveStats.priority_1_faculty_satisfaction_percent)} label={pct(liveStats.priority_1_faculty_satisfaction_percent)} />
                </Panel>
              </section>
            </>
          )}

          {activeView === "upload" && (
            <UploadWorkflow
              uploads={uploads}
              duplicatePolicy={duplicatePolicy}
              hierarchy={hierarchy}
              busy={busy}
              setDuplicatePolicy={setDuplicatePolicy}
              setHierarchy={setHierarchy}
              setUploads={setUploads}
              upload={upload}
              runAllocation={runAllocation}
            />
          )}

          {activeView === "validation" && <ValidationView validation={validation} stats={liveStats} />}
          {activeView === "optimization" && <OptimizationView stats={liveStats} busy={busy} runAllocation={runAllocation} />}
          {activeView === "results" && (
            <ResultsView
              rows={allocationRows}
              columns={allocationColumns}
              query={query}
              setQuery={setQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              loading={resultsLoading}
              error={resultsError}
              reload={loadResults}
              onSelect={(row) => setSelectedFaculty(rows.find((faculty) => faculty.emp_id === row.emp_id) || null)}
            />
          )}
          {activeView === "faculty" && <FacultyAnalytics rows={rows} selectedFaculty={selectedFaculty} setSelectedFaculty={setSelectedFaculty} loading={resultsLoading} error={resultsError} />}
          {activeView === "subjects" && <SubjectAnalytics rows={subjectRows} columns={subjectColumns} loading={resultsLoading} error={resultsError} />}
          {activeView === "reports" && <ReportsView stats={liveStats} />}
          {activeView === "audit" && <AuditView audit={mergedAudit} validation={validation} />}
          {activeView === "settings" && (
            <SettingsView
              hierarchy={hierarchy}
              duplicatePolicy={duplicatePolicy}
              setHierarchy={setHierarchy}
              setDuplicatePolicy={setDuplicatePolicy}
              isAdmin={adminAuthenticated}
              credentials={adminCredentials}
              updateCredentials={updateAdminCredentials}
            />
          )}
          {activeView === "admin" && (
            <AdminPanel
              isAuthenticated={adminAuthenticated}
              loginAdmin={loginAdmin}
              rows={rows}
              stats={liveStats}
              status={status}
              lastRun={lastRun}
              subjectOptions={subjectOptions}
              manualForm={manualForm}
              setManualForm={setManualForm}
              manualConflicts={manualConflicts}
              applyManualOverride={applyManualOverride}
              allocationLocked={allocationLocked}
              setLockState={setLockState}
              runAllocation={runAllocation}
              busy={busy}
              audit={mergedAudit}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function HeroCard({ stats, lastRun }: { stats: Stats; lastRun: string }) {
  return (
    <section className="hero-card">
      <div>
        <p className="eyebrow">AI-powered optimization engine</p>
        <h2>GITAM CSE Automated Faculty Allocation System</h2>
        <p>
          Intelligent section coverage, workload balancing, validation, auditability, and report generation for department-ready
          allocation cycles.
        </p>
        <div className="engine-badge"><SlidersHorizontal size={15} /> Powered by Google OR-Tools CP-SAT Optimization Engine</div>
      </div>
      <div className="hero-meta">
        <MetricLine label="Allocation Status" value={asNumber(stats.remaining_sections) === 0 && asNumber(stats.total_sections) > 0 ? "Complete" : "Awaiting run"} />
        <MetricLine label="Solver" value="Deterministic repair optimizer" />
        <MetricLine label="Dataset" value={`${asNumber(stats.total_faculty)} faculty / ${asNumber(stats.total_subjects)} subjects`} />
        <MetricLine label="Last Execution" value={lastRun} />
      </div>
    </section>
  );
}

function KpiGrid({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Total Faculty", value: asNumber(stats.total_faculty), icon: Users, detail: "Faculty records processed" },
    { label: "Total Subjects", value: asNumber(stats.total_subjects), icon: Database, detail: "Subject requirements loaded" },
    { label: "Total Sections", value: asNumber(stats.total_sections), icon: FileSpreadsheet, detail: "Required teaching sections" },
    { label: "Allocated Sections", value: asNumber(stats.allocated_sections), icon: CheckCircle2, detail: "Covered by allocation engine" },
    { label: "Coverage", value: pct(stats.coverage_percent), icon: Gauge, detail: "Subject fulfillment progress" },
    { label: "Remaining Requirement", value: asNumber(stats.remaining_sections), icon: Activity, detail: "Open sections after repair" },
  ];
  return (
    <section className="kpi-grid">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div className="kpi-card" key={card.label} style={{ animationDelay: `${index * 55}ms` }}>
            <div className="kpi-icon"><Icon size={20} /></div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </div>
        );
      })}
    </section>
  );
}

function UploadWorkflow(props: {
  uploads: UploadState;
  duplicatePolicy: string;
  hierarchy: string;
  busy: boolean;
  setDuplicatePolicy: (value: string) => void;
  setHierarchy: (value: string) => void;
  setUploads: React.Dispatch<React.SetStateAction<UploadState>>;
  upload: (path: "faculty" | "subjects" | "combined", file: File) => Promise<void>;
  runAllocation: () => Promise<void>;
}) {
  return (
    <section className="workflow">
      <StepCard step="01" title="Upload Data" subtitle="Load faculty preferences, requirements, and optional rulebook.">
        <div className="upload-grid">
          <UploadTile label="Faculty Preference File" file={props.uploads.faculty} accept=".xlsx" onFile={(file) => props.upload("faculty", file)} />
          <UploadTile label="Subject Requirement File" file={props.uploads.subjects} accept=".xlsx" onFile={(file) => props.upload("subjects", file)} />
          <UploadTile label="Combined Workbook" file={props.uploads.combined} accept=".xlsx" onFile={(file) => props.upload("combined", file)} />
          <UploadTile
            label="Rulebook PDF"
            file={props.uploads.rulebook}
            accept=".pdf"
            onFile={(file) => props.setUploads((current) => ({ ...current, rulebook: file.name }))}
          />
        </div>
      </StepCard>
      <StepCard step="02" title="Validation" subtitle="Choose strictness and faculty order before running optimization.">
        <div className="control-row">
          <label>
            Hierarchy
            <select value={props.hierarchy} onChange={(event) => props.setHierarchy(event.target.value)}>
              <option value="bottom-up">Bottom Up</option>
              <option value="top-down">Top Down</option>
            </select>
          </label>
          <label>
            Duplicate Policy
            <select value={props.duplicatePolicy} onChange={(event) => props.setDuplicatePolicy(event.target.value)}>
              <option value="merge">Merge Duplicate Capacity</option>
              <option value="reject">Reject Duplicates</option>
            </select>
          </label>
        </div>
      </StepCard>
      <StepCard step="03" title="Optimization" subtitle="Run allocation, coverage repair, validation, and audit generation.">
        <button className="primary-action" onClick={props.runAllocation} disabled={props.busy}>
          <Play size={18} /> {props.busy ? "Running optimization..." : "Run Allocation"}
        </button>
      </StepCard>
    </section>
  );
}

function ValidationView({ validation, stats }: { validation: ValidationItem[]; stats: Stats }) {
  const passed = validation.filter((item) => item.status === "PASS").length;
  const warnings = validation.filter((item) => item.status === "WARNING").length;
  const failures = validation.filter((item) => item.status === "FAIL").length;
  return (
    <section className="stack">
      <div className="summary-strip">
        <MetricLine label="Passed Checks" value={passed} />
        <MetricLine label="Warnings" value={warnings} />
        <MetricLine label="Failures" value={failures} />
        <MetricLine label="Remaining Sections" value={asNumber(stats.remaining_sections)} />
      </div>
      <Panel title="Validation Results" icon={ClipboardCheck}>
        <div className="validation-list">
          {validation.length === 0 && <EmptyState title="No validation yet" detail="Upload files or run allocation to see validation results." />}
          {validation.map((item, index) => (
            <div className={`validation-item ${item.status.toLowerCase()}`} key={`${item.check}-${index}`}>
              <strong>{item.status}</strong>
              <span>{item.check}</span>
              <p>{item.message}</p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}

function OptimizationView({ stats, busy, runAllocation }: { stats: Stats; busy: boolean; runAllocation: () => Promise<void> }) {
  return (
    <section className="analytics-grid two">
      <Panel title="Optimization Metrics" icon={SlidersHorizontal}>
        <MetricLine label="Priority 1 Allocation" value={pct(stats.priority_1_allocation_percent)} />
        <MetricLine label="Same Subject" value={pct(stats.same_subject_percent)} />
        <MetricLine label="Related Matches" value={asNumber(stats.related_match_allocations)} />
        <MetricLine label="Workload Variance" value={asNumber(stats.workload_variance).toFixed(2)} />
      </Panel>
      <Panel title="Solver Progress" icon={Activity}>
        <div className="progress-stack">
          <Progress label="Subject fulfillment" value={asNumber(stats.subject_fulfillment_percent)} />
          <Progress label="Coverage" value={asNumber(stats.coverage_percent)} />
          <Progress label="Faculty satisfaction" value={asNumber(stats.priority_1_faculty_satisfaction_percent)} />
        </div>
        <button className="primary-action" onClick={runAllocation} disabled={busy}>
          <Play size={18} /> {busy ? "Running..." : "Run Again"}
        </button>
      </Panel>
    </section>
  );
}

function ResultsView(props: {
  rows: AllocationTableRow[];
  columns: any[];
  query: string;
  setQuery: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  onSelect: (row: AllocationTableRow) => void;
}) {
  return (
    <Panel title="Faculty Allocation Results" icon={FileSpreadsheet}>
      <div className="table-toolbar">
        <div className="search-box"><Search size={16} /><input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search faculty, subject, status" /></div>
        <select value={props.statusFilter} onChange={(event) => props.setStatusFilter(event.target.value)}>
          <option value="all">All Statuses</option>
          <option value="FULLY ALLOCATED">Fully Allocated</option>
          <option value="PARTIALLY ALLOCATED">Partially Allocated</option>
          <option value="RELATED ALLOCATION">Related Allocation</option>
          <option value="MANUAL ALLOCATION REQUIRED">Manual Required</option>
        </select>
        <a className="secondary-action" href={`${API}/export/excel`}><Download size={16} /> Excel</a>
        <a className="secondary-action" href={`${API}/export/pdf`}><FileCheck2 size={16} /> PDF</a>
        <button className="secondary-action" onClick={props.reload} disabled={props.loading}>Refresh</button>
      </div>
      {props.loading && <EmptyState title="Loading allocation results" detail="Fetching the latest /results data from the backend." />}
      {!props.loading && props.error && <EmptyState title="Unable to load results" detail={props.error} />}
      {!props.loading && !props.error && props.rows.length === 0 && <EmptyState title="No allocation rows found" detail="Run allocation or refresh after the backend has allocation results." />}
      {!props.loading && !props.error && props.rows.length > 0 && <DataGrid rows={props.rows} columns={props.columns} onSelect={props.onSelect} />}
    </Panel>
  );
}

function FacultyAnalytics({ rows, selectedFaculty, setSelectedFaculty, loading, error }: { rows: FacultyRow[]; selectedFaculty: FacultyRow | null; setSelectedFaculty: (row: FacultyRow) => void; loading: boolean; error: string }) {
  return (
    <section className="analytics-grid two">
      <Panel title="Faculty Workload Overview" icon={Users}>
        {loading && <EmptyState title="Loading faculty analytics" detail="Fetching allocation results from the backend." />}
        {!loading && error && <EmptyState title="Unable to load faculty analytics" detail={error} />}
        {!loading && !error && rows.length === 0 && <EmptyState title="No faculty rows found" detail="Run allocation first, then return here for faculty analytics." />}
        <div className="faculty-list">
          {!loading && !error && rows.slice(0, 20).map((row) => (
            <button key={row.emp_id} className={`faculty-row ${selectedFaculty?.emp_id === row.emp_id ? "active" : ""}`} onClick={() => setSelectedFaculty(row)}>
              <span>{row.faculty_name}</span>
              <strong>{row.workload_hours} hrs</strong>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="AI Explanation Panel" icon={ShieldCheck}>
        {loading && <EmptyState title="Loading explanation" detail="Waiting for faculty allocation rows." />}
        {!loading && error && <EmptyState title="Explanation unavailable" detail={error} />}
        {!loading && !error && (selectedFaculty ? <Explanation faculty={selectedFaculty} /> : <EmptyState title="No faculty selected" detail="Select a faculty member to inspect allocation reasoning." />)}
      </Panel>
    </section>
  );
}

function SubjectAnalytics({ rows, columns, loading, error }: { rows: SubjectAnalyticsRow[]; columns: any[]; loading: boolean; error: string }) {
  return (
    <section className="stack">
      <Panel title="Subject Allocation Analytics" icon={Database}>
        {loading && <EmptyState title="Loading subject analytics" detail="Fetching allocation results from the backend." />}
        {!loading && error && <EmptyState title="Unable to load subject analytics" detail={error} />}
        {!loading && !error && rows.length === 0 && <EmptyState title="No subject rows found" detail="Run allocation first, then return here for subject analytics." />}
        {!loading && !error && rows.length > 0 && <DataGrid rows={rows} columns={columns} />}
      </Panel>
      {!loading && !error && rows.length > 0 && (
        <Panel title="Allocated Sections by Subject" icon={BarChart3}>
          <BarChart data={rows.slice(0, 12).map((row) => ({ label: row.subject_code || "Subject", value: row.allocated_sections }))} />
        </Panel>
      )}
    </section>
  );
}

function ReportsView({ stats }: { stats: Stats }) {
  const reports: Array<{ title: string; detail: string; href: string; Icon: typeof FileSpreadsheet }> = [
    { title: "Final Allocation Excel", detail: "Faculty allocation, subject utilization, validation, audit, workload.", href: `${API}/export/excel`, Icon: FileSpreadsheet },
    { title: "Allocation Summary PDF", detail: "Executive-ready summary for department review.", href: `${API}/export/pdf`, Icon: FileCheck2 },
  ];
  return (
    <section className="report-grid">
      {reports.map(({ title, detail, href, Icon }) => (
        <a className="report-card" href={href} key={title}>
          <Icon size={24} />
          <strong>{title}</strong>
          <p>{detail}</p>
          <span>Download <ChevronRight size={16} /></span>
        </a>
      ))}
      <Panel title="Report Snapshot" icon={BarChart3}>
        <MetricLine label="Coverage" value={pct(stats.coverage_percent)} />
        <MetricLine label="Allocated Sections" value={asNumber(stats.allocated_sections)} />
        <MetricLine label="Validation Failures" value={asNumber(stats.validation_failures)} />
      </Panel>
    </section>
  );
}

function AdminPanel(props: {
  isAuthenticated: boolean;
  loginAdmin: (username: string, password: string) => boolean;
  rows: FacultyRow[];
  stats: Stats;
  status: string;
  lastRun: string;
  subjectOptions: { code: string; name: string }[];
  manualForm: ManualOverrideForm;
  setManualForm: React.Dispatch<React.SetStateAction<ManualOverrideForm>>;
  manualConflicts: string[];
  applyManualOverride: () => Promise<void>;
  allocationLocked: boolean;
  setLockState: (locked: boolean) => void;
  runAllocation: () => Promise<void>;
  busy: boolean;
  audit: LocalAuditEvent[];
}) {
  if (!props.isAuthenticated) {
    return <AdminLogin loginAdmin={props.loginAdmin} />;
  }

  return (
    <section className="admin-grid">
      <Panel title="Admin Overview" icon={Building2}>
        <div className="admin-overview">
          <MetricLine label="System Status" value={props.status} />
          <MetricLine label="Allocation Status" value={asNumber(props.stats.remaining_sections) === 0 && asNumber(props.stats.total_sections) > 0 ? "Complete" : "Pending"} />
          <MetricLine label="Lock State" value={props.allocationLocked ? "Allocation Locked" : "Allocation Editable"} />
          <MetricLine label="Last Allocation Run" value={props.lastRun} />
        </div>
        <div className="mini-kpis">
          <MetricLine label="Faculty Count" value={asNumber(props.stats.total_faculty)} />
          <MetricLine label="Subjects" value={asNumber(props.stats.total_subjects)} />
          <MetricLine label="Sections" value={asNumber(props.stats.total_sections)} />
          <MetricLine label="Coverage" value={pct(props.stats.coverage_percent)} />
        </div>
      </Panel>

      <Panel title="Allocation Management" icon={ShieldCheck}>
        <div className="admin-actions">
          <div className={`lock-card ${props.allocationLocked ? "locked" : "editable"}`}>
            {props.allocationLocked ? <Lock size={22} /> : <Unlock size={22} />}
            <div>
              <strong>{props.allocationLocked ? "Locked" : "Editable"}</strong>
              <p>{props.allocationLocked ? "Final allocation is protected from manual edits." : "Manual corrections are currently allowed."}</p>
            </div>
          </div>
          <button className="secondary-action" onClick={() => props.setLockState(!props.allocationLocked)}>
            {props.allocationLocked ? <Unlock size={16} /> : <Lock size={16} />} {props.allocationLocked ? "Unlock Allocation" : "Lock Allocation"}
          </button>
          <button className="primary-action" onClick={props.runAllocation} disabled={props.busy}>
            <Play size={16} /> Re-run Optimization
          </button>
        </div>
        <div className="summary-strip">
          <MetricLine label="Faculty Records" value={props.rows.length} />
          <MetricLine label="Editable State" value={props.allocationLocked ? "Locked" : "Open"} />
          <MetricLine label="Manual Audit Events" value={props.audit.filter((event) => event.action_type.includes("Manual")).length} />
        </div>
      </Panel>

      <Panel title="Manual Override System" icon={Edit3}>
        <ManualOverrideEditor
          rows={props.rows}
          subjectOptions={props.subjectOptions}
          form={props.manualForm}
          setForm={props.setManualForm}
          conflicts={props.manualConflicts}
          save={props.applyManualOverride}
          locked={props.allocationLocked}
        />
      </Panel>

      <Panel title="Conflict Detection" icon={AlertTriangle}>
        <ConflictPanel conflicts={props.manualConflicts} />
      </Panel>

      <Panel title="Audit History" icon={History}>
        <AdminAuditList audit={props.audit} />
      </Panel>

      <Panel title="Admin Reports" icon={Download}>
        <AdminReportDownloads />
      </Panel>
    </section>
  );
}

function AdminReportDownloads() {
  const [loading, setLoading] = useState("");
  async function downloadReport(label: string, path: string, extension: "xlsx" | "pdf") {
    setLoading(label);
    try {
      const response = await fetch(`${API}${path}`);
      if (!response.ok) throw new Error("Report download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${label.toLowerCase().replace(/\s+/g, "-")}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading("");
    }
  }

  const reports = [
    { label: "Allocation Report", path: "/export/excel", extension: "xlsx" as const, icon: FileSpreadsheet },
    { label: "PDF Summary", path: "/export/pdf", extension: "pdf" as const, icon: FileCheck2 },
    { label: "Audit Workbook", path: "/export/excel", extension: "xlsx" as const, icon: Download },
    { label: "Workload Report", path: "/export/excel", extension: "xlsx" as const, icon: Gauge },
  ];

  return (
    <div className="report-actions">
      {reports.map((report) => {
        const Icon = report.icon;
        return (
          <button
            className="secondary-action"
            disabled={Boolean(loading)}
            key={report.label}
            onClick={() => downloadReport(report.label, report.path, report.extension)}
          >
            <Icon size={16} /> {loading === report.label ? "Preparing..." : report.label}
          </button>
        );
      })}
    </div>
  );
}

function AdminLogin({ loginAdmin }: { loginAdmin: (username: string, password: string) => boolean }) {
  const [username, setUsername] = useState(() => readAdminCredentials().username);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="login-shell">
      <div className="login-card">
        <div className="brand-mark large"><UserCog size={28} /></div>
        <h2>Admin Management</h2>
        <p>Protected control center for manual corrections, lock state, audit review, and administrative reports.</p>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button
          className="primary-action"
          onClick={() => {
            if (!loginAdmin(username, password)) setError("Invalid username or password.");
          }}
        >
          <ShieldCheck size={16} /> Login
        </button>
      </div>
    </section>
  );
}

function ManualOverrideEditor(props: {
  rows: FacultyRow[];
  subjectOptions: { code: string; name: string }[];
  form: ManualOverrideForm;
  setForm: React.Dispatch<React.SetStateAction<ManualOverrideForm>>;
  conflicts: string[];
  save: () => Promise<void>;
  locked: boolean;
}) {
  const [facultySearch, setFacultySearch] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const filteredFaculty = props.rows.filter((row) => `${row.faculty_name} ${row.emp_id}`.toLowerCase().includes(facultySearch.toLowerCase()));
  const filteredSubjects = props.subjectOptions.filter((subject) => `${subject.code} ${subject.name}`.toLowerCase().includes(subjectSearch.toLowerCase()));
  const selectedFaculty = props.rows.find((row) => row.emp_id === props.form.empId);
  const currentSubject = selectedFaculty?.allocations.find((allocation) => allocation.slot === props.form.slot);
  const selectedSubject = props.subjectOptions.find((subject) => subject.code === props.form.subjectCode);
  const attemptSave = () => {
    if (props.conflicts.length > 0 && !props.form.confirmOverride) {
      setConfirmOpen(true);
      return;
    }
    props.save();
  };
  return (
    <div className="manual-form">
      {confirmOpen && (
        <div className="modal-backdrop">
          <div className="warning-modal">
            <AlertTriangle size={28} />
            <h3>Confirm Manual Override</h3>
            <p>One or more conflict warnings were detected. Review them before applying this manual change.</p>
            <div className="conflict-list">
              {props.conflicts.map((conflict) => (
                <div className="conflict-item" key={conflict}><AlertTriangle size={16} /><span>{conflict}</span></div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button
                className="primary-action"
                onClick={() => {
                  props.setForm((current) => ({ ...current, confirmOverride: true }));
                  setConfirmOpen(false);
                  window.setTimeout(props.save, 0);
                }}
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}
      <label>
        Search Faculty
        <input value={facultySearch} onChange={(event) => setFacultySearch(event.target.value)} placeholder="Type faculty name or ID" />
      </label>
      <label>
        Faculty
        <select value={props.form.empId} onChange={(event) => props.setForm((current) => ({ ...current, empId: event.target.value }))}>
          <option value="">Select faculty</option>
          {filteredFaculty.map((row) => <option value={row.emp_id} key={row.emp_id}>{row.faculty_name} ({row.emp_id})</option>)}
        </select>
      </label>
      <label>
        Allocation Slot
        <select value={props.form.slot} onChange={(event) => props.setForm((current) => ({ ...current, slot: Number(event.target.value) }))}>
          <option value={1}>Subject Allotment I</option>
          <option value={2}>Subject Allotment II</option>
          <option value={3}>Coverage Slot</option>
        </select>
      </label>
      <label>
        Search Subject
        <input value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="Type subject code or name" />
      </label>
      <label>
        New Subject
        <select value={props.form.subjectCode} onChange={(event) => props.setForm((current) => ({ ...current, subjectCode: event.target.value }))}>
          <option value="">Select subject</option>
          {filteredSubjects.map((subject) => <option value={subject.code} key={subject.code}>{subject.code} - {subject.name}</option>)}
        </select>
      </label>
      <label>
        Modification Reason
        <textarea value={props.form.reason} onChange={(event) => props.setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Faculty request, department requirement, administrative decision..." />
      </label>
      {props.conflicts.length > 0 && (
        <label className="check-row">
          <input type="checkbox" checked={props.form.confirmOverride} onChange={(event) => props.setForm((current) => ({ ...current, confirmOverride: event.target.checked }))} />
          Confirm override despite warnings
        </label>
      )}
      <div className="override-table">
        <div>Faculty</div>
        <div>Current Subject</div>
        <div>New Subject</div>
        <div>Reason</div>
        <div>Action</div>
        <strong>{selectedFaculty?.faculty_name || "Not selected"}</strong>
        <span>{currentSubject ? `${currentSubject.subject_code} - ${currentSubject.subject_name}` : "Empty slot"}</span>
        <span>{selectedSubject ? `${selectedSubject.code} - ${selectedSubject.name}` : "Not selected"}</span>
        <span>{props.form.reason || "No reason entered"}</span>
        <span>{props.locked ? "Locked" : "Ready"}</span>
      </div>
      <button className="primary-action" onClick={attemptSave} disabled={props.locked}>
        <SaveIcon /> Save Manual Change
      </button>
    </div>
  );
}

function SaveIcon() {
  return <CheckCircle2 size={16} />;
}

function ConflictPanel({ conflicts }: { conflicts: string[] }) {
  if (conflicts.length === 0) {
    return <EmptyState title="No conflicts detected" detail="Select a faculty and subject to preview workload, capacity, and duplicate warnings." />;
  }
  return (
    <div className="conflict-list">
      {conflicts.map((conflict) => (
        <div className="conflict-item" key={conflict}>
          <AlertTriangle size={16} />
          <span>{conflict}</span>
        </div>
      ))}
    </div>
  );
}

function AdminAuditList({ audit }: { audit: LocalAuditEvent[] }) {
  const events = audit.slice(-10).reverse();
  if (events.length === 0) return <EmptyState title="No admin actions yet" detail="Manual changes, lock events, and logins will appear here." />;
  return (
    <div className="admin-audit">
      {events.map((event, index) => (
        <div className="admin-audit-item" key={`${event.timestamp}-${index}`}>
          <span>{new Date(event.timestamp).toLocaleString()}</span>
          <strong>{event.action_type}</strong>
          <p>{event.faculty ? `${event.faculty}: ${event.old_subject || ""} -> ${event.new_subject || ""}` : event.reason}</p>
          <small>{event.admin_user}</small>
        </div>
      ))}
    </div>
  );
}

function AuditView({ audit, validation }: { audit: LocalAuditEvent[]; validation: ValidationItem[] }) {
  const events = audit.length
    ? audit.slice(-20).reverse()
    : validation.slice(0, 8).map((item, index) => ({
        timestamp: new Date(Date.now() - index * 60000).toISOString(),
        action_type: item.check,
        reason: item.message,
        admin_user: "system",
      }));
  return (
    <Panel title="Audit Timeline" icon={History}>
      <div className="timeline">
        {events.length === 0 && <EmptyState title="No audit events" detail="Run allocation to populate the audit trail." />}
        {events.map((event, index) => (
          <div className="timeline-item" key={`${event.timestamp}-${index}`}>
            <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
            <strong>{event.action_type}</strong>
            <p>{event.reason}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SettingsView(props: {
  hierarchy: string;
  duplicatePolicy: string;
  setHierarchy: (value: string) => void;
  setDuplicatePolicy: (value: string) => void;
  isAdmin: boolean;
  credentials: { username: string; password: string };
  updateCredentials: (username: string, password: string) => void;
}) {
  const [username, setUsername] = useState(props.credentials.username);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const saveSecurity = () => {
    if (!props.isAdmin) {
      setSecurityMessage("Login as admin before changing security settings.");
      return;
    }
    if (!username.trim()) {
      setSecurityMessage("Username is required.");
      return;
    }
    if (password.length < 4) {
      setSecurityMessage("Password must contain at least 4 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setSecurityMessage("Password and confirm password do not match.");
      return;
    }
    props.updateCredentials(username.trim(), password);
    setPassword("");
    setConfirmPassword("");
    setSecurityMessage("Admin credentials updated.");
  };

  return (
    <section className="stack">
      <Panel title="System Settings" icon={Settings}>
        {!props.isAdmin && <div className="settings-lock"><Lock size={16} /> Login as admin to edit system configuration.</div>}
        <div className="settings-grid">
          <label>
            Allocation Order
            <select value={props.hierarchy} disabled={!props.isAdmin} onChange={(event) => props.setHierarchy(event.target.value)}>
              <option value="bottom-up">Bottom Up</option>
              <option value="top-down">Top Down</option>
            </select>
          </label>
          <label>
            Duplicate Subject Policy
            <select value={props.duplicatePolicy} disabled={!props.isAdmin} onChange={(event) => props.setDuplicatePolicy(event.target.value)}>
              <option value="merge">Merge Duplicate Capacity</option>
              <option value="reject">Reject Duplicates</option>
            </select>
          </label>
          <label>Maximum Faculty Workload<input disabled={!props.isAdmin} defaultValue="Professor 6 / Associate 10 / Assistant 14" /></label>
          <label>Preference Weights<input disabled={!props.isAdmin} defaultValue="100, 75, 50, 25" /></label>
          <label>Optimization Weights<input disabled={!props.isAdmin} defaultValue="Coverage, preference, same subject, workload" /></label>
          <label>Solver Timeout<input disabled={!props.isAdmin} defaultValue="120 seconds" /></label>
          <label>Semester Information<input disabled={!props.isAdmin} defaultValue="Configurable in admin workflow" /></label>
          <label>Department Details<input disabled={!props.isAdmin} defaultValue="GITAM CSE" /></label>
        </div>
      </Panel>
      <Panel title="Security" icon={ShieldCheck}>
        <div className="settings-grid security-grid">
          <label>
            Change Username
            <input disabled={!props.isAdmin} value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Change Password
            <input disabled={!props.isAdmin} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label>
            Confirm Password
            <input disabled={!props.isAdmin} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          <button className="primary-action" disabled={!props.isAdmin} onClick={saveSecurity}>Save Security Settings</button>
        </div>
        {securityMessage && <p className="settings-message">{securityMessage}</p>}
      </Panel>
    </section>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div><Icon size={18} /><h2>{title}</h2></div>
      </div>
      {children}
    </section>
  );
}

function StepCard({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="step-card">
      <div className="step-index">{step}</div>
      <div className="step-body">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {children}
      </div>
    </section>
  );
}

function UploadTile({ label, file, accept, onFile }: { label: string; file?: string; accept: string; onFile: (file: File) => void }) {
  return (
    <label className={`upload-tile ${file ? "done" : ""}`}>
      <Upload size={20} />
      <strong>{label}</strong>
      <span>{file || "Choose file"}</span>
      <input type="file" accept={accept} onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
    </label>
  );
}

function DataGrid({ rows, columns, onSelect }: { rows: any[]; columns: any[]; onSelect?: (row: any) => void }) {
  return (
    <div className="grid ag-theme-quartz">
      <AgGridReact rowData={rows} columnDefs={columns} pagination paginationPageSize={25} rowSelection="single" onRowClicked={(event) => onSelect?.(event.data)} />
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 25;
  const colors = ["#155a9c", "#06b6d4", "#7c3aed", "#f59e0b"];
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" className="donut">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--ring)" strokeWidth="5" />
        {data.map((item, index) => {
          const length = (item.value / total) * 100;
          const circle = <circle key={item.label} cx="21" cy="21" r="15.915" fill="transparent" stroke={colors[index]} strokeWidth="5" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={offset} />;
          offset -= length;
          return circle;
        })}
      </svg>
      <div className="chart-legend">
        {data.map((item, index) => <span key={item.label}><i style={{ background: colors[index] }} /> {item.label}: {item.value}</span>)}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="bars">
      {data.map((item) => (
        <div className="bar-row" key={item.label}>
          <span>{item.label}</span>
          <div><i style={{ width: `${(item.value / max) * 100}%` }} /></div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function CircularProgress({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="circle-progress" style={{ background: `conic-gradient(var(--accent) ${safe}%, var(--ring) 0)` }}>
      <div><strong>{label}</strong><span>complete</span></div>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress">
      <div><span>{label}</span><strong>{pct(value)}</strong></div>
      <i><b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i>
    </div>
  );
}

function Explanation({ faculty }: { faculty: FacultyRow }) {
  const first = faculty.allocations[0];
  return (
    <div className="explanation">
      <h3>{faculty.faculty_name}</h3>
      <p>{faculty.designation} | {faculty.workload_hours} workload hours | {faculty.status}</p>
      {first ? (
        <ul>
          <li>Preference marker: {first.priority}</li>
          <li>Subject: {first.subject_code} - {first.subject_name}</li>
          <li>Reason: {first.reason || "Capacity, workload, and preference constraints satisfied."}</li>
          <li>Match confidence: {first.match_confidence ?? 100}</li>
        </ul>
      ) : (
        <EmptyState title="Manual attention required" detail="No feasible preferred or related allocation was returned for this faculty." />
      )}
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <ShieldCheck size={24} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
