const submitBtn = document.getElementById("submitBtn");
const sampleBtn = document.getElementById("sampleBtn");
const clearBtn = document.getElementById("clearBtn");
const nodeInput = document.getElementById("nodeInput");
const responseBox = document.getElementById("responseBox");
const errorBox = document.getElementById("errorBox");
const statusPill = document.getElementById("statusPill");
const lineCount = document.getElementById("lineCount");

const sampleData = [
  "A->B",
  "A->C",
  "B->D",
  "C->E",
  "E->F",
  "X->Y",
  "Y->Z",
  "Z->X",
  "P->Q",
  "Q->R",
  "G->H",
  "G->H",
  "G->I",
  "hello",
  "1->2",
  "A->"
];

updateLineCount();

nodeInput.addEventListener("input", updateLineCount);

sampleBtn.addEventListener("click", () => {
  nodeInput.value = sampleData.join("\n");
  updateLineCount();
  hideError();
});

clearBtn.addEventListener("click", () => {
  nodeInput.value = "";
  responseBox.innerHTML = "No response yet.";
  hideError();
  setStatus("Idle");
  updateLineCount();
});

submitBtn.addEventListener("click", async () => {
  hideError();
  setStatus("Loading", "loading");
  setBusy(true);

  const rawLines = nodeInput.value.split(/\r?\n/).map((line) => line.trim());

  try {
    responseBox.innerHTML = "<p>Loading...</p>";

    const res = await fetch("/bfhl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ data: rawLines })
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "API request failed");
    }

    renderResponse(result);
    setStatus("Success", "success");
  } catch (error) {
    responseBox.innerHTML = "No response yet.";
    showError(error.message || "Something went wrong");
    setStatus("Error", "error");
  } finally {
    setBusy(false);
  }
});

function renderResponse(data) {
  const hierarchyHtml = (data.hierarchies || [])
    .map((item, index) => {
      const status = item.has_cycle
        ? '<span class="pill red">Cycle</span>'
        : '<span class="pill green">Tree</span>';

      const depthHtml = typeof item.depth === "number"
        ? `<p><strong>Depth:</strong> ${item.depth}</p>`
        : "";

      return `
        <div class="section">
          <h3>Hierarchy ${index + 1}</h3>
          ${status}
          <span class="pill blue">Root: ${escapeHtml(item.root)}</span>
          ${depthHtml}
          <div class="tree-box">
            <pre>${escapeHtml(JSON.stringify(item.tree, null, 2))}</pre>
          </div>
        </div>
      `;
    })
    .join("");

  responseBox.innerHTML = `
    <div class="section">
      <h3>Identity</h3>
      <div class="meta-grid">
        <div class="meta-key">User ID</div>
        <div>${escapeHtml(data.user_id || "")}</div>
        <div class="meta-key">Email</div>
        <div>${escapeHtml(data.email_id || "")}</div>
        <div class="meta-key">Roll Number</div>
        <div>${escapeHtml(data.college_roll_number || "")}</div>
      </div>
    </div>

    <div class="section">
      <h3>Summary</h3>
      <div class="meta-grid">
        <div class="meta-key">Total Trees</div>
        <div>${data.summary?.total_trees ?? ""}</div>
        <div class="meta-key">Total Cycles</div>
        <div>${data.summary?.total_cycles ?? ""}</div>
        <div class="meta-key">Largest Tree Root</div>
        <div>${escapeHtml(data.summary?.largest_tree_root || "")}</div>
      </div>
    </div>

    <div class="section">
      <h3>Hierarchies</h3>
      ${hierarchyHtml || "<p>No hierarchies found.</p>"}
    </div>

    <div class="section">
      <h3>Invalid Entries</h3>
      <div class="list-box">${arrayToList(data.invalid_entries)}</div>
    </div>

    <div class="section">
      <h3>Duplicate Edges</h3>
      <div class="list-box">${arrayToList(data.duplicate_edges)}</div>
    </div>

    <div class="section">
      <h3>Raw JSON</h3>
      <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </div>
  `;
}

function arrayToList(values) {
  if (!values || values.length === 0) {
    return "<p>None</p>";
  }

  return `<ul>${values.map((value) => `<li>${escapeHtml(String(value))}</li>`).join("")}</ul>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function setStatus(text, variant = "") {
  statusPill.textContent = text;
  statusPill.className = "status-pill";

  if (variant) {
    statusPill.classList.add(variant);
  }
}

function setBusy(isBusy) {
  submitBtn.disabled = isBusy;
  sampleBtn.disabled = isBusy;
  clearBtn.disabled = isBusy;
  submitBtn.textContent = isBusy ? "Submitting..." : "Submit";
}

function updateLineCount() {
  const lines = nodeInput.value.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
  lineCount.textContent = `${lines} line${lines === 1 ? "" : "s"}`;
}