export function renderAdminPage(): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canvas OAuth Admin</title>
<style>
:root{color-scheme:dark;--bg:#0f1110;--panel:#181b19;--line:#343b37;--text:#f1f4ef;--muted:#9aa39d;--accent:#76d29f;--warn:#d8b15f;--danger:#ef7d7d}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:#0f1110;color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace}
button,input,textarea{font:inherit}
.shell{max-width:1120px;margin:0 auto;padding:24px}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:16px}
h1{margin:0;font-size:24px;line-height:1.1}
.status{color:var(--muted);text-align:right;min-height:20px}
.grid{display:grid;grid-template-columns:360px 1fr;gap:12px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px}
.section{padding:14px;border-bottom:1px solid var(--line)}
.section:last-child{border-bottom:0}
label{display:block;margin:0 0 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
input,textarea{width:100%;border:1px solid var(--line);background:#0b0d0c;color:var(--text);border-radius:6px;padding:9px 10px;outline:none}
textarea{min-height:92px;resize:vertical}
input:focus,textarea:focus{border-color:var(--accent)}
.row{display:flex;gap:8px;align-items:center}
.row input{min-width:0}
.button{border:1px solid var(--line);background:#222723;color:var(--text);border-radius:6px;padding:9px 11px;cursor:pointer;white-space:nowrap}
.primary{background:var(--accent);border-color:var(--accent);color:#07100b;font-weight:700}
.danger{color:#ffd0d0;border-color:#604040}
.list{display:grid;gap:10px;max-height:520px;overflow:auto}
.group{display:grid;gap:6px}
.group-title{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.client{display:grid;grid-template-columns:auto 1fr;gap:8px;border:1px solid var(--line);border-radius:6px;padding:9px;background:#111412}
.client.active{border-color:var(--accent)}
.client input{width:auto;margin-top:3px}
.client-main{min-width:0;cursor:pointer}
.client strong,.client span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.client span{color:var(--muted);font-size:12px}
.details{display:grid;grid-template-columns:150px 1fr;gap:8px 12px;margin:0}
.details dt{color:var(--muted)}
.details dd{margin:0;overflow-wrap:anywhere}
.uris{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.uris li,.copy-row code,.secret code{background:#0b0d0c;border:1px solid var(--line);border-radius:6px;padding:8px 9px;overflow-wrap:anywhere}
.copy-grid{display:grid;gap:8px}
.copy-row{display:grid;grid-template-columns:145px 1fr auto;gap:8px;align-items:center}
.copy-row span{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.secret{display:grid;gap:8px;border:1px solid var(--warn);border-radius:8px;padding:10px;background:#101311}
.hidden{display:none!important}
.empty{color:var(--muted);border:1px dashed var(--line);border-radius:6px;padding:10px}
@media(max-width:820px){.shell{padding:16px}.top{display:grid}.status{text-align:left}.grid,.copy-row,.details{grid-template-columns:1fr}}
</style>
</head>
<body>
<main class="shell">
  <header class="top">
    <h1>Canvas OAuth Admin</h1>
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
        <div class="row">
          <button class="button primary" id="refreshClients">Refresh</button>
          <button class="button danger" id="logout">Logout</button>
        </div>
      </div>
      <div class="section">
        <label for="newClientName">New Custom GPT client</label>
        <div class="row">
          <input id="newClientName" value="Canvas LMS Custom GPT">
          <button class="button primary" id="createClient">Create</button>
        </div>
      </div>
      <div class="section">
        <label for="filter">Clients</label>
        <input id="filter" placeholder="Filter clients">
      </div>
      <div class="section">
        <div class="row">
          <button class="button" id="selectVisible">Select visible</button>
          <button class="button danger" id="deleteSelected">Delete selected</button>
        </div>
      </div>
      <div class="section">
        <div class="list" id="clientList"></div>
      </div>
    </aside>

    <section class="panel">
      <div class="section hidden" id="createdPanel">
        <label>Created client</label>
        <div class="secret" id="createdClient"></div>
      </div>
      <div class="section hidden" id="setupPanel">
        <label>ChatGPT action setup</label>
        <div class="copy-grid" id="setupRows"></div>
      </div>
      <div class="section">
        <label>Selected client</label>
        <dl class="details" id="clientDetails"></dl>
      </div>
      <div class="section">
        <label>Redirect URIs</label>
        <ul class="uris" id="redirectUris"></ul>
      </div>
      <div class="section">
        <label for="newRedirect">Callback URL from ChatGPT</label>
        <textarea id="newRedirect" placeholder="https://chat.openai.com/aip/g-.../oauth/callback"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="button primary" id="updateRedirects">Save callback URL</button>
        </div>
      </div>
    </section>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const selected = new Set();
let clients = [];
let selectedClientId = "";

function setStatus(message, tone = "muted") {
  $("status").textContent = message;
  $("status").style.color = tone === "error" ? "var(--danger)" : tone === "ok" ? "var(--accent)" : "var(--muted)";
}
function getToken() { return localStorage.getItem("canvasAdminToken") || ""; }
function showApp() { $("loginPanel").classList.add("hidden"); $("appPanel").classList.remove("hidden"); }
function showLogin() { $("appPanel").classList.add("hidden"); $("loginPanel").classList.remove("hidden"); }
function authHeaders(extra) { return Object.assign({}, extra || {}, { Authorization: "Bearer " + getToken() }); }
async function api(path, options) {
  const response = await fetch(path, Object.assign({}, options || {}, { headers: authHeaders((options || {}).headers) }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "Request failed");
  return data;
}
function groupName(client) { return client.client_name || "Unnamed client"; }
function sortClients(items) {
  return items.slice().sort((a, b) => groupName(a).localeCompare(groupName(b)) || a.client_id.localeCompare(b.client_id));
}
function visibleClients() {
  const query = $("filter").value.trim().toLowerCase();
  if (!query) return clients;
  return clients.filter((client) => [
    client.client_id,
    client.client_name || "",
    (client.redirect_uris || []).join(" ")
  ].join(" ").toLowerCase().includes(query));
}
function renderClientList() {
  const list = $("clientList");
  list.innerHTML = "";
  const visible = visibleClients();
  if (!visible.length) {
    list.innerHTML = '<div class="empty">No clients found.</div>';
    return;
  }
  const groups = new Map();
  for (const client of visible) {
    const name = groupName(client);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(client);
  }
  for (const [name, groupClients] of groups) {
    const group = document.createElement("section");
    group.className = "group";
    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = name + " (" + groupClients.length + ")";
    group.appendChild(title);
    for (const client of groupClients) {
      const row = document.createElement("div");
      row.className = "client" + (client.client_id === selectedClientId ? " active" : "");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selected.has(client.client_id);
      check.addEventListener("change", () => check.checked ? selected.add(client.client_id) : selected.delete(client.client_id));
      const main = document.createElement("div");
      main.className = "client-main";
      main.innerHTML = "<strong></strong><span></span><span></span>";
      main.querySelector("strong").textContent = groupName(client);
      main.querySelectorAll("span")[0].textContent = client.client_id;
      main.querySelectorAll("span")[1].textContent = (client.redirect_uris || [])[0] || "No callback URL";
      main.addEventListener("click", () => selectClient(client.client_id));
      row.append(check, main);
      group.appendChild(row);
    }
    list.appendChild(group);
  }
}
function renderClient(client) {
  selectedClientId = client.client_id;
  const details = $("clientDetails");
  details.innerHTML = "";
  for (const item of [
    ["Client ID", client.client_id],
    ["Name", groupName(client)],
    ["Token auth", client.token_endpoint_auth_method || ""],
    ["Grant types", (client.grant_types || []).join(", ")],
    ["Response types", (client.response_types || []).join(", ")]
  ]) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = item[0];
    dd.textContent = item[1];
    details.append(dt, dd);
  }
  const uriList = $("redirectUris");
  uriList.innerHTML = "";
  for (const uri of client.redirect_uris || []) {
    const li = document.createElement("li");
    li.textContent = uri;
    uriList.appendChild(li);
  }
  if (!(client.redirect_uris || []).length) uriList.innerHTML = '<li>No callback URL saved.</li>';
  renderClientList();
}
function selectClient(clientId) {
  const client = clients.find((item) => item.client_id === clientId);
  if (client) renderClient(client);
}
async function refreshClients() {
  setStatus("Loading clients...");
  const data = await api("/admin/oauth-clients");
  clients = sortClients((data.clients || []).filter(Boolean));
  if (selectedClientId) {
    const current = clients.find((client) => client.client_id === selectedClientId);
    if (current) renderClient(current);
  }
  renderClientList();
  setStatus("Clients loaded", "ok");
}
function copyRow(label, value) {
  const row = document.createElement("div");
  row.className = "copy-row";
  const name = document.createElement("span");
  const code = document.createElement("code");
  const button = document.createElement("button");
  name.textContent = label;
  code.textContent = value || "";
  button.className = "button";
  button.type = "button";
  button.textContent = "Copy";
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(value || "");
    setStatus("Copied " + label, "ok");
  });
  row.append(name, code, button);
  return row;
}
function renderCreatedClient(client) {
  $("createdPanel").classList.remove("hidden");
  $("setupPanel").classList.remove("hidden");
  const created = $("createdClient");
  created.innerHTML = "";
  created.append(
    copyRow("Client ID", client.client_id),
    copyRow("Client secret", client.client_secret || "")
  );
  const setup = client.chatgpt_setup || {};
  const rows = $("setupRows");
  rows.innerHTML = "";
  for (const item of [
    ["Schema URL", setup.openapi_schema_url || location.origin + "/actions/openapi.json"],
    ["Auth type", "OAuth"],
    ["Authorization URL", setup.authorization_url || location.origin + "/authorize"],
    ["Token URL", setup.token_url || location.origin + "/token"],
    ["Scope", setup.scope || "canvas.read"],
    ["Token exchange", setup.token_exchange_method || "Default (POST request)"],
    ["Privacy URL", setup.privacy_policy_url || location.origin + "/privacy"]
  ]) rows.appendChild(copyRow(item[0], item[1]));
}
async function createClient() {
  setStatus("Creating client...");
  const created = await api("/admin/oauth-clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: $("newClientName").value.trim() || "Canvas LMS Custom GPT" })
  });
  clients = sortClients(clients.filter((client) => client.client_id !== created.client_id).concat(created));
  selected.clear();
  selected.add(created.client_id);
  renderClient(created);
  renderCreatedClient(created);
  setStatus("Client created. Save the secret now.", "ok");
}
async function updateRedirects() {
  if (!selectedClientId) throw new Error("Select a client first.");
  const redirectUri = $("newRedirect").value.trim();
  if (!redirectUri) throw new Error("Paste the callback URL first.");
  setStatus("Saving callback URL...");
  const client = await api("/admin/oauth-clients/" + encodeURIComponent(selectedClientId) + "/redirect-uris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uri: redirectUri })
  });
  clients = sortClients(clients.map((item) => item.client_id === client.client_id ? client : item));
  $("newRedirect").value = "";
  renderClient(client);
  setStatus("Callback URL saved", "ok");
}
async function deleteSelected() {
  const ids = Array.from(selected);
  if (!ids.length) throw new Error("Select at least one client.");
  if (!confirm("Delete " + ids.length + " OAuth client(s)?")) return;
  setStatus("Deleting clients...");
  await api("/admin/oauth-clients/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_ids: ids })
  });
  clients = clients.filter((client) => !selected.has(client.client_id));
  if (selected.has(selectedClientId)) selectedClientId = "";
  selected.clear();
  $("clientDetails").innerHTML = "";
  $("redirectUris").innerHTML = "";
  renderClientList();
  setStatus("Clients deleted", "ok");
}
$("saveToken").addEventListener("click", async () => {
  localStorage.setItem("canvasAdminToken", $("token").value.trim());
  showApp();
  try { await refreshClients(); } catch (error) { setStatus(error.message, "error"); }
});
$("logout").addEventListener("click", () => { localStorage.removeItem("canvasAdminToken"); showLogin(); setStatus(""); });
$("refreshClients").addEventListener("click", () => refreshClients().catch((error) => setStatus(error.message, "error")));
$("createClient").addEventListener("click", () => createClient().catch((error) => setStatus(error.message, "error")));
$("updateRedirects").addEventListener("click", () => updateRedirects().catch((error) => setStatus(error.message, "error")));
$("deleteSelected").addEventListener("click", () => deleteSelected().catch((error) => setStatus(error.message, "error")));
$("selectVisible").addEventListener("click", () => { for (const client of visibleClients()) selected.add(client.client_id); renderClientList(); });
$("filter").addEventListener("input", renderClientList);
$("token").addEventListener("keydown", (event) => { if (event.key === "Enter") $("saveToken").click(); });
if (getToken()) {
  showApp();
  refreshClients().catch((error) => setStatus(error.message, "error"));
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
