/**
 * Hypnosis AI — Frontend Controller
 * Handles view routing, character builder, and chat interactions.
 */

(function () {
    "use strict";

    // ── View Navigation ──
    const views = document.querySelectorAll(".view");
    const navButtons = document.querySelectorAll("[data-view]");

    function showView(viewId) {
        views.forEach((v) => {
            v.classList.remove("active");
        });
        const target = document.getElementById(viewId);
        if (target) target.classList.add("active");
    }

    navButtons.forEach((btn) => {
        btn.addEventListener("click", () => showView(btn.dataset.view));
    });

    // ── Character Builder ──
    const nameInput = document.getElementById("guide-name");
    const personalitySelect = document.getElementById("guide-personality");
    const depthSlider = document.getElementById("depth-slider");
    const voiceButtons = document.querySelectorAll(".avatar-btn");
    const previewName = document.getElementById("preview-name");
    const previewTraits = document.getElementById("preview-traits");

    let selectedVoice = "ethereal";

    function updatePreview() {
        const name = nameInput.value.trim() || "Your Guide";
        const personality = personalitySelect.options[personalitySelect.selectedIndex].text;
        const depth = depthSlider.value;
        previewName.textContent = name;
        previewTraits.textContent = `${personality} \u2022 ${selectedVoice} \u2022 Depth ${depth}`;
    }

    nameInput.addEventListener("input", updatePreview);
    personalitySelect.addEventListener("change", updatePreview);
    depthSlider.addEventListener("input", updatePreview);

    voiceButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            voiceButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            selectedVoice = btn.dataset.voice;
            updatePreview();
        });
    });

    // Create guide → jump to chat
    const createBtn = document.getElementById("btn-create-guide");
    if (createBtn) {
        createBtn.addEventListener("click", () => {
            const name = nameInput.value.trim() || "Serenity";
            const chatGuideName = document.getElementById("chat-guide-name");
            if (chatGuideName) chatGuideName.textContent = name;
            showView("view-chat");
        });
    }

    // ── Chat ──
    const chatForm = document.getElementById("chat-form");
    const chatInput = document.getElementById("chat-input");
    const chatMessages = document.getElementById("chat-messages");

    const API_BASE = window.location.origin;

    function addMessage(text, role) {
        const wrapper = document.createElement("div");
        wrapper.className = `message ${role}`;

        const bubble = document.createElement("div");
        bubble.className = "msg-bubble";
        bubble.textContent = text;

        if (role === "assistant") {
            const audioBtn = document.createElement("button");
            audioBtn.className = "play-audio-btn btn-icon";
            audioBtn.title = "Play audio";
            audioBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
            bubble.appendChild(audioBtn);
        }

        wrapper.appendChild(bubble);
        chatMessages.appendChild(wrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage(text) {
        addMessage(text, "user");

        try {
            const res = await fetch(`${API_BASE}/api/predict`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ input: text }),
            });

            if (res.ok) {
                const data = await res.json();
                addMessage(data.prediction || data.output || "I hear you. Let\u2019s continue.", "assistant");
            } else {
                addMessage("I\u2019m here with you. Let me gather my thoughts\u2026", "assistant");
            }
        } catch {
            // Fallback when API is not running
            const fallbacks = [
                "Take a slow, deep breath. Feel the calm settling in.",
                "That\u2019s a wonderful reflection. Tell me more about how that feels.",
                "Close your eyes for a moment. Notice the stillness around you.",
                "You\u2019re doing beautifully. Let\u2019s explore that thought together.",
                "I\u2019m fully present with you. What comes to mind next?",
            ];
            const reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            setTimeout(() => addMessage(reply, "assistant"), 800);
        }
    }

    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = "";
        sendMessage(text);
    });
})();
