// ─── App Module: Main Application Logic ───

let currentSessionId = null;
let isSending = false;
let uploadedImageBase64 = null;
let uploadedImageFilename = null;
let pdfChunks = [];
let uploadedPdfFilename = null;

// --- DOM References ---
const $ = (id) => document.getElementById(id);

// --- Initialize App ---
async function initApp() {
    if (!authState.isLoggedIn) {
        showAuthPage();
        return;
    }

    const user = await fetchCurrentUser();
    if (!user) {
        showAuthPage();
        return;
    }

    showAppPage();
    updateUserUI(user);
    await loadSessions();
}

function updateUserUI(user) {
    $("usernameDisplay").textContent = user.username;
    $("userAvatar").textContent = user.username.charAt(0).toUpperCase();
}

// --- Sessions ---
async function loadSessions() {
    try {
        const res = await apiRequest("/api/sessions");
        if (!res.ok) throw new Error("Failed to load sessions");
        const sessions = await res.json();

        const list = $("sessionList");
        list.innerHTML = "";

        sessions.forEach(session => {
            const item = document.createElement("div");
            item.className = "session-item";
            if (session.id === currentSessionId) {
                item.classList.add("active");
            }
            item.dataset.sessionId = session.id;

            const titleSpan = document.createElement("span");
            titleSpan.className = "session-title";
            titleSpan.textContent = session.title;

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "delete-btn";
            deleteBtn.innerHTML = "×";
            deleteBtn.title = "删除对话";
            deleteBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (confirm("确定要删除这个对话吗？")) {
                    await deleteSession(session.id);
                }
            });

            item.appendChild(titleSpan);
            item.appendChild(deleteBtn);

            item.addEventListener("click", () => selectSession(session.id, session.title));
            list.appendChild(item);
        });
    } catch (e) {
        showToast("加载对话列表失败: " + e.message, "error");
    }
}

async function createNewSession() {
    try {
        const res = await apiRequest("/api/sessions", {
            method: "POST",
            body: JSON.stringify({ title: "新对话" }),
        });
        if (!res.ok) throw new Error("Failed to create session");
        const session = await res.json();

        currentSessionId = session.id;
        $("currentSessionTitle").textContent = "新对话";
        $("chatMessages").querySelectorAll(".message").forEach(el => el.remove());
        $("emptyState").classList.remove("hidden");

        await loadSessions();
        scrollToBottom();
        $("messageInput").focus();
    } catch (e) {
        showToast("创建对话失败: " + e.message, "error");
    }
}

async function selectSession(sessionId, title) {
    currentSessionId = sessionId;
    $("currentSessionTitle").textContent = title;

    // Update active state in sidebar
    document.querySelectorAll(".session-item").forEach(item => {
        item.classList.toggle("active", parseInt(item.dataset.sessionId) === sessionId);
    });

    await loadMessages(sessionId);
    $("messageInput").focus();
}

async function deleteSession(sessionId) {
    try {
        const res = await apiRequest(`/api/sessions/${sessionId}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete session");

        if (currentSessionId === sessionId) {
            currentSessionId = null;
            $("currentSessionTitle").textContent = "新对话";
            $("chatMessages").querySelectorAll(".message").forEach(el => el.remove());
            $("emptyState").classList.remove("hidden");
        }

        await loadSessions();
    } catch (e) {
        showToast("删除对话失败: " + e.message, "error");
    }
}

// --- Send Message ---
async function sendMessage() {
    if (isSending) return;

    const input = $("messageInput");
    const text = input.value.trim();
    const hasImage = !!uploadedImageBase64;
    const hasPdf = pdfChunks.length > 0;

    if (!text && !hasImage && !hasPdf) return;

    // Ensure a session exists
    if (!currentSessionId) {
        await createNewSession();
        // After creating, if still no session id, bail
        if (!currentSessionId) return;
    }

    isSending = true;
    $("sendBtn").disabled = true;

    // Build message text
    let messageText = text;
    if (hasPdf) {
        const relevantChunks = pdfChunks.slice(0, 3);
        const context = relevantChunks.join("\n\n");
        messageText = `请根据以下参考资料回答问题：\n\n参考资料：\n${context}\n\n---\n\n${text || "请总结以上参考资料"}`;
    }

    // Show user message
    const container = $("chatMessages");
    $("emptyState").classList.add("hidden");

    let userMsgEl;
    if (hasPdf) {
        // PDF: show file card instead of raw extracted text
        userMsgEl = createMessageElement("user", "");
        const bubble = userMsgEl.querySelector(".message-bubble");
        const pdfCard = document.createElement("div");
        pdfCard.className = "pdf-card";
        pdfCard.innerHTML = `
            <div class="pdf-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div class="pdf-card-info">
                <div class="pdf-card-name">${uploadedPdfFilename || "PDF文件"}</div>
                <div class="pdf-card-desc">${pdfChunks.length} 段 · 已上传</div>
            </div>
        `;
        bubble.appendChild(pdfCard);
        if (text) {
            const textPara = document.createElement("p");
            textPara.style.marginTop = "8px";
            textPara.textContent = text;
            bubble.appendChild(textPara);
        }
    } else {
        userMsgEl = createMessageElement("user", messageText);
        if (hasImage) {
            const img = document.createElement("img");
            img.src = `data:image/jpeg;base64,${uploadedImageBase64}`;
            img.className = "message-image";
            const bubble = userMsgEl.querySelector(".message-bubble");
            bubble.insertBefore(img, bubble.firstChild);
        }
    }
    container.appendChild(userMsgEl);
    scrollToBottom();

    // Stream response (必须先发送图片base64再清空)
    const selectedModel = $("modelSelect").value;
    await streamChat(currentSessionId, messageText, uploadedImageBase64, uploadedImageFilename, selectedModel);

    // Clear input and upload state
    input.value = "";
    input.style.height = "auto";
    clearUploads();

    // Refresh session list (title might have updated)
    await loadSessions();

    isSending = false;
    $("sendBtn").disabled = false;
    input.focus();
}

// --- Upload Handlers ---
function clearUploads() {
    uploadedImageBase64 = null;
    uploadedImageFilename = null;
    uploadedPdfFilename = null;
    pdfChunks = [];
    $("uploadPreview").classList.add("hidden");
    $("uploadFileName").textContent = "";
}

async function handleImageUpload(file) {
    if (!file) return;

    // Read as base64 for sending to chat
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result.split(",")[1];
        uploadedImageBase64 = base64Data;
        uploadedImageFilename = file.name;

        $("uploadFileName").textContent = `🖼️ ${file.name}`;
        $("uploadPreview").classList.remove("hidden");
        $("messageInput").focus();
    };
    reader.readAsDataURL(file);
}

async function handlePdfUpload(file) {
    if (!file) return;

    try {
        uploadedPdfFilename = file.name;
        // Upload PDF to server for processing
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_BASE}/api/upload/pdf`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${authState.token}` },
            body: formData,
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "PDF upload failed");
        }

        const data = await res.json();
        pdfChunks = data.chunks || [];

        $("uploadFileName").textContent = `📄 ${file.name} (${data.total_chunks || "?"} 段)`;
        $("uploadPreview").classList.remove("hidden");

        showToast("PDF 已解析，共 " + (data.total_chunks || 0) + " 段文本", "success");
    } catch (e) {
        showToast("PDF 处理失败: " + e.message, "error");
    }
}

// --- Event Binding ---
function bindEvents() {
    // Auth tabs
    document.querySelectorAll(".auth-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            const form = tab.dataset.tab === "login" ? "loginForm" : "registerForm";
            const other = tab.dataset.tab === "login" ? "registerForm" : "loginForm";
            document.getElementById(form).classList.remove("hidden");
            document.getElementById(other).classList.add("hidden");
            document.getElementById("authError").style.display = "none";
            document.getElementById("regError").style.display = "none";
        });
    });

    // Login form
    $("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = $("loginUsername").value.trim();
        const password = $("loginPassword").value;
        const errorEl = $("authError");
        errorEl.style.display = "none";
        try {
            await login(username, password);
            await initApp();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = "block";
        }
    });

    // Register form
    $("registerForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = $("regUsername").value.trim();
        const password = $("regPassword").value;
        const errorEl = $("regError");
        errorEl.style.display = "none";
        try {
            await register(username, password);
            await initApp();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.style.display = "block";
        }
    });

    // New chat
    $("newChatBtn").addEventListener("click", createNewSession);

    // Send message
    $("sendBtn").addEventListener("click", sendMessage);
    $("messageInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Logout
    $("logoutBtn").addEventListener("click", () => {
        logout();
    });

    // Image upload
    $("imageUploadBtn").addEventListener("click", () => $("imageInput").click());
    $("imageInput").addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleImageUpload(e.target.files[0]);
        }
        e.target.value = "";
    });

    // PDF upload
    $("pdfUploadBtn").addEventListener("click", () => $("pdfInput").click());
    $("pdfInput").addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handlePdfUpload(e.target.files[0]);
        }
        e.target.value = "";
    });

    // Remove upload
    $("removeUploadBtn").addEventListener("click", clearUploads);
}

// --- Start ---
document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    if (authState.isLoggedIn) {
        initApp();
    } else {
        showAuthPage();
    }
});

