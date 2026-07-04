// ─── Auth Module ───

const API_BASE = "";
let authToken = localStorage.getItem("chatbot_token");
let currentUser = null;

const authState = {
    get token() { return authToken; },
    set token(v) { authToken = v; if (v) localStorage.setItem("chatbot_token", v); else localStorage.removeItem("chatbot_token"); },
    get user() { return currentUser; },
    set user(u) { currentUser = u; },
    get isLoggedIn() { return !!authToken; },
};

async function apiRequest(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
    }
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (res.status === 401) {
        authState.token = null;
        authState.user = null;
        showAuthPage();
        throw new Error("Session expired");
    }
    return res;
}

async function login(username, password) {
    const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    authState.token = data.access_token;
    authState.user = data.user;
    return data;
}

async function register(username, password) {
    const res = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Registration failed");
    }
    const data = await res.json();
    authState.token = data.access_token;
    authState.user = data.user;
    return data;
}

async function fetchCurrentUser() {
    try {
        const res = await apiRequest("/api/auth/me");
        if (res.ok) {
            const data = await res.json();
            authState.user = data;
            return data;
        }
    } catch (e) {
        console.warn("Failed to fetch user:", e);
    }
    return null;
}

function logout() {
    authState.token = null;
    authState.user = null;
    showAuthPage();
}

// ─── UI Helpers ───

function showToast(message, type = "error") {
    const existing = document.querySelector(".toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showAuthPage() {
    document.getElementById("authPage").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
}

function showAppPage() {
    document.getElementById("authPage").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
}
