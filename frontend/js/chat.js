// ─── Chat Module: Markdown, LaTeX, Streaming ───

// --- Markdown + LaTeX rendering with tokenization ---
function renderMarkdown(text) {
    if (!text) return "";

    const tokens = [];
    let tokenIndex = 0;
    let processed = text;

    // 1. Extract block math $$...$$
    processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
        const token = `%%MATH_BLOCK_${tokenIndex}%%`;
        tokens.push({ type: "block", formula: formula.trim(), token });
        tokenIndex++;
        return token;
    });

    // 2. Extract inline math $...$ (avoid matching $$)
    processed = processed.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (match, formula) => {
        const token = `%%MATH_INLINE_${tokenIndex}%%`;
        tokens.push({ type: "inline", formula: formula.trim(), token });
        tokenIndex++;
        return token;
    });

    // 3. Parse Markdown
    let html = "";
    try {
        html = marked.parse(processed, { breaks: true, gfm: true });
    } catch (e) {
        html = processed.replace(/\n/g, "<br>");
    }

    // 4. Replace tokens with KaTeX rendered HTML
    tokens.forEach(t => {
        try {
            let rendered;
            if (t.type === "block") {
                rendered = katex.renderToString(t.formula, {
                    displayMode: true,
                    throwOnError: false,
                });
            } else {
                rendered = katex.renderToString(t.formula, {
                    displayMode: false,
                    throwOnError: false,
                });
            }
            html = html.replace(t.token, rendered);
        } catch (e) {
            html = html.replace(t.token, `<span class="katex-error">${t.formula}</span>`);
        }
    });

    return html;
}

// --- Process message bubble content ---
function renderMessageContent(container, text) {
    container.innerHTML = renderMarkdown(text);
    // Highlight code blocks
    container.querySelectorAll("pre code").forEach(block => {
        try {
            hljs.highlightElement(block);
        } catch (e) {
            // ignore highlight failures
        }
    });
}

// --- Create message element ---
function createMessageElement(role, content, extraClass = "") {
    const div = document.createElement("div");
    div.className = `message ${role} ${extraClass}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "AI";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    div.appendChild(avatar);
    div.appendChild(bubble);

    if (content) {
        renderMessageContent(bubble, content);
    }

    return div;
}

// --- Stream response from server ---
async function streamChat(sessionId, message, imageBase64, imageFilename, model) {
    try {
        const res = await fetch(`${API_BASE}/api/chat/${sessionId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${authState.token}`,
            },
            body: JSON.stringify({
                message: message || "",
                image_base64: imageBase64 || null,
                image_filename: imageFilename || null,
                model: model || null,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || "Chat request failed");
        }

        // Create assistant message element
        const msgEl = createMessageElement("assistant", "");
        const bubble = msgEl.querySelector(".message-bubble");
        document.getElementById("chatMessages").appendChild(msgEl);
        document.getElementById("emptyState")?.classList.add("hidden");

        // Scroll to bottom
        scrollToBottom();

        let fullContent = "";
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    try {
                        const payload = JSON.parse(line.slice(6));
                        if (payload.type === "delta") {
                            fullContent += payload.content;
                            renderMessageContent(bubble, fullContent);
                            scrollToBottom();
                        } else if (payload.type === "done") {
                            fullContent = payload.content;
                            renderMessageContent(bubble, fullContent);
                            scrollToBottom();
                            return;
                        } else if (payload.type === "error") {
                            bubble.textContent = payload.content;
                            showToast(payload.content, "error");
                            return;
                        }
                    } catch (e) {
                        console.warn("Stream parse error:", e);
                    }
                }
            }
        }

        // Final render
        if (fullContent) {
            renderMessageContent(bubble, fullContent);
            scrollToBottom();
        }
    } catch (e) {
        console.error("Stream error:", e);
        showToast(e.message || "网络错误", "error");
    }
}

function scrollToBottom() {
    const chatMsgs = document.getElementById("chatMessages");
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

// --- Load messages for a session ---
async function loadMessages(sessionId) {
    try {
        const res = await apiRequest(`/api/sessions/${sessionId}/messages`);
        if (!res.ok) throw new Error("Failed to load messages");
        const messages = await res.json();

        const container = document.getElementById("chatMessages");
        const emptyState = document.getElementById("emptyState");

        // Clear existing messages (keep empty state)
        container.querySelectorAll(".message").forEach(el => el.remove());

        if (messages.length === 0) {
            emptyState.classList.remove("hidden");
        } else {
            emptyState.classList.add("hidden");
            messages.forEach(msg => {
                const el = createMessageElement(msg.role, msg.content);
                container.appendChild(el);
            });
            scrollToBottom();
        }
    } catch (e) {
        showToast("加载消息失败: " + e.message, "error");
    }
}
