window.ttcWatch = (function () {
  let term = null;
  let ws = null;
  let activeSession = null;

  function setStatus(text) {
    document.getElementById("status").textContent = text;
  }

  function updateTabsRequest(sessionName) {
    const tabsEl = document.getElementById("tabs");
    if (!tabsEl || !sessionName) return;
    tabsEl.setAttribute(
      "hx-get",
      `/partials/tabs?active=${encodeURIComponent(sessionName)}`
    );
  }

  function markActiveTab(sessionName) {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.session === sessionName);
    });
  }

  function initTerminal(cols, rows) {
    const container = document.getElementById("terminal");
    container.innerHTML = "";
    term = new Terminal({
      disableStdin: true,
      convertEol: true,
      cols: cols || 120,
      rows: rows || 30,
      theme: { background: "#1e1e1e", foreground: "#d4d4d4" },
    });
    term.open(container);
  }

  function connect(sessionName) {
    if (!sessionName) return;
    if (activeSession === sessionName && ws && ws.readyState <= WebSocket.OPEN) {
      markActiveTab(sessionName);
      return;
    }

    if (ws) {
      ws.close();
      ws = null;
    }

    activeSession = sessionName;
    updateTabsRequest(sessionName);
    markActiveTab(sessionName);
    setStatus(`Connecting to ${sessionName}…`);

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${location.host}/ws/${sessionName}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "init":
          initTerminal(msg.cols, msg.rows);
          if (msg.replay) term.write(msg.replay);
          setStatus(`${msg.session_name} — ${msg.status}`);
          break;
        case "data":
          if (term) term.write(msg.data);
          break;
        case "end":
          setStatus(`${sessionName} exited (code ${msg.exit_code ?? "?"})`);
          break;
        case "error":
          setStatus(`Error: ${msg.message}`);
          break;
      }
    };

    ws.onclose = () => {
      if (activeSession === sessionName) {
        setStatus(`${sessionName} disconnected`);
      }
    };
  }

  function syncTabs() {
    if (activeSession) {
      markActiveTab(activeSession);
      return;
    }
    const activeBtn = document.querySelector(".tab.active");
    const firstBtn = document.querySelector(".tab");
    const target = activeBtn || firstBtn;
    if (target) connect(target.dataset.session);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("tabs")?.addEventListener("click", (event) => {
      const btn = event.target.closest(".tab");
      if (!btn) return;
      event.preventDefault();
      connect(btn.dataset.session);
    });
  });

  return { syncTabs, connect };
})();
