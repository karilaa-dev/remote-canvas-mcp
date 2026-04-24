export function renderAdminPage(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canvas OAuth Admin</title>
<style>
:root{color-scheme:dark;--bg:#0f1110;--panel:#181b19;--panel-2:#202522;--line:#343b37;--text:#f1f4ef;--muted:#98a39d;--accent:#76d29f;--accent-soft:rgba(118,210,159,.14);--warn:#d8b15f;--danger:#ef7d7d;--radius:8px;--shadow:0 18px 60px rgba(0,0,0,.34)}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 0 0,rgba(118,210,159,.11),transparent 34rem),linear-gradient(145deg,#0c0f0d,#151917 46%,#101311);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
button,input,textarea,select{font:inherit}
.shell{max-width:1280px;margin:0 auto;padding:28px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}
.brand{display:grid;gap:4px}
.eyebrow{color:var(--accent);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
h1{font-size:28px;line-height:1.05;margin:0;font-weight:650;letter-spacing:0}
.status{min-height:22px;color:var(--muted);text-align:right}
.grid{display:grid;grid-template-columns:390px 1fr;gap:14px}
.panel{background:linear-gradient(180deg,rgba(255,255,255,.026),transparent),var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.section{padding:16px;border-bottom:1px solid var(--line)}
.section:last-child{border-bottom:0}
.tabs{display:flex;gap:8px;padding:8px;background:#101311;border-radius:8px;border:1px solid var(--line)}
.tab{flex:1;border:0;background:transparent;color:var(--muted);border-radius:6px;padding:9px 10px;cursor:pointer}
.tab.active{background:var(--accent);color:#07100b;font-weight:700}
label{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.07em;margin:0 0 7px}
input,textarea,select{width:100%;border:1px solid var(--line);background:#0d0f0e;color:var(--text);border-radius:6px;padding:10px 11px;outline:none}
textarea{min-height:104px;resize:vertical}
input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.row{display:flex;gap:8px;align-items:center}
.row input{min-width:0}
.button{border:1px solid var(--line);background:var(--panel-2);color:var(--text);border-radius:6px;padding:10px 12px;cursor:pointer;white-space:nowrap}
.button:hover{border-color:#56615b;background:#252b28}
.primary{background:var(--accent);border-color:var(--accent);color:#07100b;font-weight:700}
.primary:hover{background:#88e2b1}
.danger{color:#ffd0d0;border-color:#604040}
.toolbar{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
.list{display:grid;gap:12px;max-height:650px;overflow:auto}
.group{display:grid;gap:7px}
.group-title{display:flex;justify-content:space-between;align-items:center;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.07em;padding:2px 2px 0}
.client{display:grid;grid-template-columns:auto 1fr;gap:9px;border:1px solid var(--line);background:#111412;border-radius:6px;padding:10px;text-align:left}
.client:hover,.client.active{border-color:var(--accent);background:#17211b}
.client input{width:auto;margin-top:3px}
.client-main{cursor:pointer;min-width:0}
.client strong{display:block;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.client span{display:block;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.metric{background:#101311;border:1px solid var(--line);border-radius:6px;padding:10px}
.metric b{display:block;font-size:20px;line-height:1.1}
.metric span{color:var(--muted);font-size:12px}
.runtime{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.runtime code{display:block;background:#101311;border:1px solid var(--line);border-radius:6px;padding:9px 10px;overflow-wrap:anywhere}
.meta{display:grid;grid-template-columns:190px 1fr;gap:8px 12px;margin:0}
.meta dt{color:var(--muted)}
.meta dd{margin:0;overflow-wrap:anywhere}
.uri-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.uri-list li{background:#0d0f0e;border:1px solid var(--line);border-radius:6px;padding:9px 10px;overflow-wrap:anywhere}
.secret-box{display:grid;gap:8px;background:#101311;border:1px solid var(--warn);border-radius:8px;padding:12px;margin-top:12px}
.secret-box code{overflow-wrap:anywhere;color:#ffe0a1}
.events{display:grid;gap:8px;max-height:280px;overflow:auto}
.event{background:#101311;border:1px solid var(--line);border-radius:6px;padding:10px;display:grid;gap:4px}
.event strong{font-size:12px}
.event span{color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.hidden{display:none!important}
.empty{color:var(--muted);padding:12px;border:1px dashed var(--line);border-radius:6px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:900px){.shell{padding:18px}.grid,.split,.metrics{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}.status{text-align:left}.meta{grid-template-columns:1fr}}
</style>
</head>
<body>
<main class="shell">
  <header class="top">
    <div class="brand">
      <div class="eyebrow">Canvas LMS</div>
      <h1>OAuth Admin</h1>
    </div>
    <div class="status" id="status"></div>
  </header>

  <section class="panel" id="loginPanel">
    <div class="section">
      <label for="token">Admin token</label>
      <div class="row">
        <input id="token" type="password" autocomplete="current-password">
        <button class="button primary" id="saveToken">Login</button>
      </div>
    </div>
  </section>

  <section class="grid hidden" id="appPanel">
    <aside class="panel">
      <div class="section">
        <div class="tabs">
          <button class="tab active" data-tab="clients">Clients</button>
          <button class="tab" data-tab="create">New client</button>
        </div>
      </div>
      <div class="section" data-view="clients">
        <div class="toolbar">
          <input id="filter" placeholder="Filter by name, ID, or redirect URI">
          <button class="button primary" id="refreshClients">Refresh</button>
        </div>
      </div>
      <div class="section" data-view="clients">
        <div class="row">
          <button class="button" id="selectVisible">Select visible</button>
          <button class="button danger" id="deleteSelected">Delete selected</button>
        </div>
      </div>
      <div class="section" data-view="clients">
        <label>Clients grouped by name</label>
        <div class="list" id="clientList"></div>
      </div>
      <div class="section hidden" data-view="create">
        <label for="newClientName">Client name</label>
        <input id="newClientName" value="Canvas LMS Custom GPT">
      </div>
      <div class="section hidden" data-view="create">
        <label for="newClientRedirect">Callback URL (optional)</label>
        <textarea id="newClientRedirect" placeholder="Leave empty, or paste https://chat.openai.com/aip/g-.../oauth/callback"></textarea>
      </div>
      <div class="section hidden" data-view="create">
        <label for="newClientAuth">Token auth method</label>
        <select id="newClientAuth">
          <option value="client_secret_post">Default POST request</option>
          <option value="client_secret_basic">Basic authorization header</option>
          <option value="none">Public client</option>
        </select>
      </div>
      <div class="section hidden" data-view="create">
        <button class="button primary" id="createClient">Create client</button>
        <div id="createdClient" class="secret-box hidden"></div>
      </div>
      <div class="section">
        <button class="button danger" id="logout">Logout</button>
      </div>
    </aside>

    <section class="panel">
      <div class="section">
        <label>Runtime version</label>
        <div class="runtime" id="runtimeInfo">
          <code>Commit: loading...</code>
          <code>Worker: loading...</code>
        </div>
      </div>
      <div class="section">
        <div class="metrics">
          <div class="metric"><b id="metricTotal">0</b><span>Total clients</span></div>
          <div class="metric"><b id="metricGroups">0</b><span>Name groups</span></div>
          <div class="metric"><b id="metricSelected">0</b><span>Selected</span></div>
          <div class="metric"><b id="metricRedirects">0</b><span>Redirect URIs</span></div>
        </div>
      </div>
      <div class="section">
        <dl class="meta" id="clientMeta"></dl>
      </div>
      <div class="section">
        <label>Redirect URIs</label>
        <ul class="uri-list" id="redirectUris"></ul>
      </div>
      <div class="section">
        <label for="newRedirect">Current callback URL</label>
        <textarea id="newRedirect" placeholder="https://chat.openai.com/aip/g-.../oauth/callback"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="button primary" id="updateRedirects">Update selected client redirects</button>
        </div>
      </div>
      <div class="section">
        <div class="toolbar">
          <label style="margin:0">Recent OAuth events</label>
          <div class="row">
            <button class="button" id="refreshEvents">Refresh events</button>
            <button class="button danger" id="clearEvents">Clear logs</button>
          </div>
        </div>
        <div class="events" id="oauthEvents" style="margin-top:10px"></div>
      </div>
    </section>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const tokenInput = $("token");
const loginPanel = $("loginPanel");
const appPanel = $("appPanel");
const statusEl = $("status");
const clientList = $("clientList");
const clientMeta = $("clientMeta");
const redirectUris = $("redirectUris");
const newRedirect = $("newRedirect");
const filter = $("filter");
const selected = new Set();
let clients = [];
let selectedClientId = "";

function setStatus(message, tone = "muted") {
  statusEl.textContent = message;
  statusEl.style.color = tone === "error" ? "var(--danger)" : tone === "ok" ? "var(--accent)" : "var(--muted)";
}
function getToken() { return localStorage.getItem("canvasAdminToken") || ""; }
function authHeaders(extra = {}) { return { ...extra, Authorization: "Bearer " + getToken() }; }
function showApp() { loginPanel.classList.add("hidden"); appPanel.classList.remove("hidden"); }
function showLogin() { appPanel.classList.add("hidden"); loginPanel.classList.remove("hidden"); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: authHeaders(options.headers || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}
function groupName(client) { return client.client_name || "Unnamed client"; }
function sortedClients(items) {
  return [...items].sort((a,b) => groupName(a).localeCompare(groupName(b)) || a.client_id.localeCompare(b.client_id));
}
function visibleClients() {
  const q = filter.value.trim().toLowerCase();
  if (!q) return clients;
  return clients.filter((client) => [
    client.client_id,
    client.client_name || "",
    ...(client.redirect_uris || [])
  ].join(" ").toLowerCase().includes(q));
}
function renderMetrics() {
  const groups = new Set(clients.map(groupName));
  $("metricTotal").textContent = String(clients.length);
  $("metricGroups").textContent = String(groups.size);
  $("metricSelected").textContent = String(selected.size);
  $("metricRedirects").textContent = String(clients.reduce((sum, client) => sum + (client.redirect_uris || []).length, 0));
}
function renderClientList() {
  const visible = visibleClients();
  clientList.innerHTML = "";
  renderMetrics();
  if (!visible.length) {
    clientList.innerHTML = '<div class="empty">No matching clients.</div>';
    return;
  }
  const groups = new Map();
  for (const client of visible) {
    const name = groupName(client);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(client);
  }
  for (const [name, groupClients] of groups) {
    const section = document.createElement("section");
    section.className = "group";
    const title = document.createElement("div");
    title.className = "group-title";
    title.innerHTML = "<span></span><span></span>";
    title.children[0].textContent = name;
    title.children[1].textContent = String(groupClients.length);
    section.appendChild(title);
    for (const client of groupClients) {
      const row = document.createElement("div");
      row.className = "client" + (client.client_id === selectedClientId ? " active" : "");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(client.client_id);
      checkbox.addEventListener("change", () => {
        checkbox.checked ? selected.add(client.client_id) : selected.delete(client.client_id);
        renderMetrics();
      });
      const main = document.createElement("div");
      main.className = "client-main";
      main.innerHTML = "<strong></strong><span></span><span></span>";
      main.querySelector("strong").textContent = client.client_name || "Unnamed client";
      main.querySelectorAll("span")[0].textContent = client.client_id + " | " + (client.token_endpoint_auth_method || "");
      main.querySelectorAll("span")[1].textContent = (client.redirect_uris || [])[0] || "No redirect URI";
      main.addEventListener("click", () => selectClient(client.client_id));
      row.append(checkbox, main);
      section.appendChild(row);
    }
    clientList.appendChild(section);
  }
}
function renderClient(client) {
  selectedClientId = client.client_id;
  clientMeta.innerHTML = "";
  const entries = [
    ["Client ID", client.client_id],
    ["Name", client.client_name || ""],
    ["Registration date", client.registration_date ? new Date(client.registration_date * 1000).toLocaleString() : ""],
    ["Grant types", (client.grant_types || []).join(", ")],
    ["Response types", (client.response_types || []).join(", ")],
    ["Token auth", client.token_endpoint_auth_method || ""],
    ["Client URI", client.client_uri || ""],
    ["Policy URI", client.policy_uri || ""],
    ["Logo URI", client.logo_uri || ""],
    ["Contacts", (client.contacts || []).join(", ")],
  ];
  for (const [label, value] of entries) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    clientMeta.append(dt, dd);
  }
  redirectUris.innerHTML = "";
  for (const uri of client.redirect_uris || []) {
    const li = document.createElement("li");
    li.textContent = uri;
    redirectUris.appendChild(li);
  }
  renderClientList();
}
function selectClient(clientId) {
  const client = clients.find((item) => item.client_id === clientId);
  if (client) renderClient(client);
}
async function refreshClients(keepSelection = true) {
  setStatus("Loading clients...");
  const data = await api("/admin/oauth-clients");
  clients = sortedClients((data.clients || []).filter(Boolean));
  if (keepSelection && selectedClientId) {
    const selectedClient = clients.find((client) => client.client_id === selectedClientId);
    if (selectedClient) renderClient(selectedClient);
    else selectedClientId = "";
  }
  renderClientList();
  setStatus("Clients loaded", "ok");
}
async function refreshRuntime() {
  const runtime = await api("/admin/runtime");
  $("runtimeInfo").innerHTML = "";
  const commit = document.createElement("code");
  commit.textContent = "Commit: " + (runtime.source_commit || "unknown");
  if (runtime.source_commit === "not injected") {
    commit.textContent += " (set Cloudflare deploy command to npm run deploy)";
  }
  const worker = document.createElement("code");
  worker.textContent = "Worker: " + (runtime.worker_version_id || "unknown");
  const tag = document.createElement("code");
  tag.textContent = "Tag: " + (runtime.worker_version_tag || "none");
  const uploaded = document.createElement("code");
  uploaded.textContent = "Uploaded: " + (runtime.worker_version_timestamp || "unknown");
  $("runtimeInfo").append(commit, worker, tag, uploaded);
}
async function refreshEvents() {
  const data = await api("/admin/oauth-events");
  const events = data.events || [];
  const box = $("oauthEvents");
  box.innerHTML = "";
  if (!events.length) {
    box.innerHTML = '<div class="empty">No OAuth events in the last 6 hours.</div>';
    return;
  }
  for (const event of events) {
    const row = document.createElement("div");
    row.className = "event";
    const title = document.createElement("strong");
    title.textContent = [event.timestamp, event.phase, event.status].filter(Boolean).join(" | ");
    const details = document.createElement("span");
    details.textContent = [
      event.client_id ? "client=" + event.client_id : "",
      event.auth_method ? "auth=" + event.auth_method : "",
      event.origin_host ? "origin=" + event.origin_host : "",
      event.access_control_request_method ? "preflight_method=" + event.access_control_request_method : "",
      event.access_control_request_headers ? "preflight_headers=" + event.access_control_request_headers : "",
      event.response_type ? "response_type=" + event.response_type : "",
      event.scope ? "scope=" + event.scope : "",
      event.completion_mode ? "completion=" + event.completion_mode : "",
      event.grant_type ? "grant=" + event.grant_type : "",
      event.has_redirect_uri === false ? "missing redirect_uri" : "",
      event.has_code_challenge ? "has code_challenge" : "",
      event.code_challenge_method ? "challenge_method=" + event.code_challenge_method : "",
      event.has_resource ? "has resource" : "",
      event.request_query_keys ? "request_query=" + event.request_query_keys.join(",") : "",
      event.has_code_verifier ? "has code_verifier" : "",
      event.redirect_host ? "redirect=" + event.redirect_host + event.redirect_path : "",
      event.callback_query_keys ? "query=" + event.callback_query_keys.join(",") : "",
      typeof event.code_length === "number" ? "code_len=" + event.code_length : "",
      event.code_has_colon ? "code has colon" : "",
      typeof event.state_length === "number" ? "state_len=" + event.state_length : "",
      event.state_hash ? "state_hash=" + event.state_hash : "",
      event.callback_state_hash ? "callback_state_hash=" + event.callback_state_hash : "",
      event.token_type ? "token_type=" + event.token_type : "",
    ].filter(Boolean).join(" | ");
    const error = document.createElement("span");
    error.textContent = event.error || event.error_description || event.message || "";
    row.append(title, details);
    if (error.textContent) row.appendChild(error);
    box.appendChild(row);
  }
}
async function clearEvents() {
  if (!confirm("Clear all OAuth diagnostic events?")) return;
  setStatus("Clearing OAuth logs...");
  await api("/admin/oauth-events/clear", { method: "POST" });
  await refreshEvents();
  setStatus("OAuth logs cleared", "ok");
}
async function updateRedirects() {
  if (!selectedClientId) throw new Error("Select a client first.");
  const redirectUri = newRedirect.value.trim();
  if (!redirectUri) throw new Error("Paste a callback URL first.");
  setStatus("Updating redirects...");
  const client = await api("/admin/oauth-clients/" + encodeURIComponent(selectedClientId) + "/redirect-uris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uri: redirectUri }),
  });
  clients = sortedClients(clients.map((item) => item.client_id === client.client_id ? client : item));
  newRedirect.value = "";
  renderClient(client);
  setStatus("Redirects updated", "ok");
}
async function createClient() {
  const clientName = $("newClientName").value.trim() || "Canvas LMS Custom GPT";
  const redirectUri = $("newClientRedirect").value.trim();
  setStatus("Creating client...");
  const body = {
    client_name: clientName,
    token_endpoint_auth_method: $("newClientAuth").value,
  };
  if (redirectUri) body.redirect_uri = redirectUri;
  const created = await api("/admin/oauth-clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  clients = sortedClients([...clients.filter((client) => client.client_id !== created.client_id), created]);
  selectedClientId = created.client_id;
  selected.clear();
  selected.add(created.client_id);
  renderClient(created);
  renderCreatedClient(created);
  setStatus("Client created", "ok");
}
function renderCreatedClient(client) {
  const box = $("createdClient");
  box.classList.remove("hidden");
  box.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = "Save this secret now. It is shown once.";
  const id = document.createElement("code");
  id.textContent = "Client ID: " + client.client_id;
  const secret = document.createElement("code");
  secret.textContent = "Client Secret: " + (client.client_secret || "(public client; no secret)");
  box.append(title, id, secret);
}
async function deleteSelected() {
  const ids = Array.from(selected);
  if (!ids.length) throw new Error("Select at least one client.");
  if (!confirm("Delete " + ids.length + " OAuth client(s)? Existing GPT connections using them will stop working.")) return;
  setStatus("Deleting clients...");
  await api("/admin/oauth-clients/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_ids: ids }),
  });
  clients = clients.filter((client) => !selected.has(client.client_id));
  if (selected.has(selectedClientId)) selectedClientId = "";
  selected.clear();
  clientMeta.innerHTML = "";
  redirectUris.innerHTML = "";
  renderClientList();
  setStatus("Clients deleted", "ok");
}
function setTab(tab) {
  document.querySelectorAll(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  document.querySelectorAll("[data-view]").forEach((view) => view.classList.toggle("hidden", view.dataset.view !== tab));
}
$("saveToken").addEventListener("click", async () => {
  localStorage.setItem("canvasAdminToken", tokenInput.value.trim());
  showApp();
  try {
    await refreshClients(false);
    await refreshRuntime();
    await refreshEvents();
  } catch (error) { setStatus(error.message, "error"); }
});
$("refreshClients").addEventListener("click", () => refreshClients().catch((error) => setStatus(error.message, "error")));
$("logout").addEventListener("click", () => { localStorage.removeItem("canvasAdminToken"); showLogin(); setStatus(""); });
$("updateRedirects").addEventListener("click", () => updateRedirects().catch((error) => setStatus(error.message, "error")));
$("createClient").addEventListener("click", () => createClient().catch((error) => setStatus(error.message, "error")));
$("deleteSelected").addEventListener("click", () => deleteSelected().catch((error) => setStatus(error.message, "error")));
$("selectVisible").addEventListener("click", () => { for (const client of visibleClients()) selected.add(client.client_id); renderClientList(); });
$("refreshEvents").addEventListener("click", () => refreshEvents().catch((error) => setStatus(error.message, "error")));
$("clearEvents").addEventListener("click", () => clearEvents().catch((error) => setStatus(error.message, "error")));
filter.addEventListener("input", renderClientList);
tokenInput.addEventListener("keydown", (event) => { if (event.key === "Enter") $("saveToken").click(); });
document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
if (getToken()) {
  showApp();
  refreshClients(false).catch((error) => setStatus(error.message, "error"));
  refreshRuntime().catch(() => {});
  refreshEvents().catch(() => {});
} else {
  showLogin();
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "DENY",
    },
  });
}
