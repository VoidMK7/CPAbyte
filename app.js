const state = {
  page: "dashboard",
  user: { id:"demo-telegram-id", first_name:"Demo", last_name:"User", username:"demo_user" },
  balance: 0,
  pending: 0,
  lifetime: 0,
  referrals: 0,
  hbc: 25,
  tasks: [],
  notifications: [
    {title:"Welcome to HillsByte", body:"Your Telegram account is connected.", time:"Just now", unread:true},
    {title:"Daily check-in", body:"Check in today to keep your streak.", time:"Today", unread:true}
  ],
  streak: 1,
  ai: [], isAdmin:false, events:[], broadcasts:[], history:[], friends:[]
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => `$${Number(n).toFixed(2)}`;

const api = async (url, options={}) => {
  const tg = window.Telegram?.WebApp;
  const headers = {"X-Telegram-Init-Data": tg?.initData || "", ...(options.headers||{})};
  let body = options.body;
  if(body && !(body instanceof FormData) && typeof body !== "string") { headers["Content-Type"]="application/json"; body=JSON.stringify(body); }
  const r = await fetch(url,{...options,headers,body});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
};

async function syncBackend(){
  const tg = window.Telegram?.WebApp;
  const u = tg?.initDataUnsafe?.user;
  if(!u?.id) return false;
  const startParam = tg?.initDataUnsafe?.start_param || "";
  const d = await api(`/api/bootstrap?telegramId=${encodeURIComponent(u.id)}&username=${encodeURIComponent(u.username||"")}&firstName=${encodeURIComponent(u.first_name||"")}&referralCode=${encodeURIComponent(startParam)}`);
  state.user = d.user || state.user;
  state.tasks = d.tasks || [];
  state.balance = Number(d.user?.balance||0);
  state.pending = Number(d.user?.pending_balance||0);
  state.lifetime = Number(d.user?.lifetime_earnings||0);
  state.referrals = Number(d.user?.referral_earnings||0);
  state.hbc = Number(d.user?.hillscoin||25);
  state.isAdmin = !!d.admin;
  state.events = d.events || [];
  state.broadcasts = d.broadcasts || [];
  try {
    const p = await api(`/api/profile/details?telegramId=${encodeURIComponent(u.id)}`);
    state.notifications = (p.notifications||[]).map(n=>({title:n.title,body:n.message,time:n.created_at||"",unread:!n.read_at}));
    state.history = p.history || [];
    state.friends = p.friends || [];
  } catch {}
  return true;
}

function currentTelegramId(){ return String(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || state.user.id || "demo-user"); }

function icon(name){ return `<span class="i i-${name}"></span>`; }

function setPage(page){
  state.page = page;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page || (page==="earn"&&b.dataset.page==="dashboard")));
  $$(".side-link").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  render();
  closeMenu();
}

function render(){
  const views = {
    dashboard: dashboardView,
    earn: earnView,
    activity: activityView,
    wallet: walletView,
    referrals: referralsView,
    community: communityView,
    events: eventsView,
    leaderboard: leaderboardView,
    notifications: notificationsView,
    profile: profileView,
    admin: adminView
  };
  $("#main").innerHTML = (views[state.page] || dashboardView)();
  bindView();
}

function dashboardView(){
  return `
    <div class="hero-row">
      <div><div class="hero-name">Welcome back, ${escapeHtml(state.user.first_name || "User")}</div><div class="muted">Here's your HillsByte snapshot.</div></div>
      <div class="brand-mark">${escapeHtml((state.user.first_name||"U")[0])}</div>
    </div>
    <div class="grid2">
      ${stat("Available Balance",money(state.balance),"wallet")}
      ${stat("Pending",money(state.pending),"clock")}
      ${stat("Lifetime Earnings",money(state.lifetime),"activity")}
      ${stat("HillsCoin",state.hbc+" HBC","coin")}
    </div>
    <div class="check-card">
      <div class="check-head"><div><div class="check-title">${icon("spark")} Daily check-in</div><div class="check-sub">Current streak: ${state.streak} day</div></div><button class="check-btn" id="checkIn">Check in</button></div>
      <div class="days">${["D1","D2","D3","D4","D5","D6","D7"].map((d,i)=>`<div class="day ${i===0?"done":""}">${d}</div>`).join("")}</div>
    </div>
    <div class="quick-title">Quick actions</div>
    <div class="quick-grid">
      ${quick("spark","Earn","earn")}${quick("wallet","Wallet","wallet")}${quick("users","Referral","referrals")}${quick("activity","Activity","activity")}
      ${quick("community","Community","community")}${quick("calendar","Events","events")}${quick("trophy","Leaderboard","leaderboard")}${quick("user","Profile","profile")}
    </div>
    ${adSection()}
    <div class="quick-title">Recent activity</div>
    <div class="empty">${icon("activity")}<strong>No earnings yet</strong><p>Complete your first task to start earning.</p><button class="primary-btn" data-go="earn">Find tasks</button></div>
  `;
}

function stat(label,value,ic){return `<div class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><span class="stat-icon">${icon(ic==="coin"?"wallet":ic)}</span></div>`}
function quick(ic,label,page){return `<button class="quick-item" data-go="${page}"><span class="quick-icon">${icon(ic)}</span>${label}</button>`}

function adSection(){
  return `<div class="ad-card"><span class="ad-badge">ADVERTISEMENT</span><div class="ad-title">Boost your earnings</div><div class="ad-copy">Discover a sponsored offer or partner task. Ads can be managed from the admin panel.</div><button class="primary-btn" id="openAd">View offer</button></div>`;
}

function earnView(){
  const rows = (state.tasks||[]).map(t=>`<div class="list-row"><div><div class="row-title">${escapeHtml(t.title)}</div><div class="row-sub">${escapeHtml(t.category||"Task")} • ${Number(t.est_minutes||2)} min${t.daily_completed!=null?` • ${Number(t.remaining_daily||0)} left today`:""}</div></div><button class="primary-btn" data-task-id="${escapeHtml(t.id)}">${money(t.reward)}</button></div>`).join("");
  return `<div class="page-head"><h1>Earn</h1><div class="muted">Complete tasks and build your HillsByte balance.</div></div>
    ${adSection()}
    <div class="toolbar"><button class="pill active">All</button><button class="pill">Social</button><button class="pill">Apps</button><button class="pill">Web3</button></div>
    <div class="list">${rows || `<div class="empty">${icon("spark")}<strong>No active tasks yet</strong><p>New earning opportunities will appear here.</p></div>`}</div>`;
}

function activityView(){
  return `<div class="page-head"><h1>Activity</h1><div class="muted">Your HillsByte account activity — not financial trading.</div></div>
  <div class="grid2">${stat("Total earned",money(state.lifetime),"activity")}${stat("Avg daily",money(state.lifetime/7),"calendar")}${stat("Best day",money(state.lifetime),"trophy")}${stat("Tasks completed",state.tasks.length,"activity")}${stat("Referral earnings",money(state.referrals),"users")}${stat("Total withdrawals",money(0),"wallet")}</div>
  <div class="toolbar"><button class="pill active">Earnings</button><button class="pill">Balance</button><button class="pill">Tasks</button><button class="pill">Referrals</button><button class="pill">Withdrawals</button><span style="flex:1"></span><button class="pill">7D</button><button class="pill">30D</button><button class="pill">All</button></div>
  <div class="chart"><svg viewBox="0 0 600 190" preserveAspectRatio="none"><polyline points="0,170 90,165 180,166 270,145 360,158 450,120 540,135 600,100" fill="none" stroke="#29c985" stroke-width="2"/></svg></div>
  <div class="empty">${icon("activity")}<strong>No activity yet</strong><p>Complete tasks to see your earnings chart grow.</p><button class="primary-btn" data-go="earn">Find tasks</button></div>`;
}

function walletView(){
  return `<div class="page-head"><h1>Wallet</h1><div class="muted">Your balances, transactions and withdrawals.</div></div>
  <div class="grid2">${stat("Available",money(state.balance),"wallet")}${stat("Pending",money(state.pending),"clock")}${stat("Lifetime",money(state.lifetime),"activity")}${stat("Referral earnings",money(state.referrals),"users")}${stat("Withdrawable",money(state.balance),"wallet")}${stat("HillsCoin",state.hbc+" HBC","wallet")}</div>
  <button class="primary-btn withdraw" id="withdraw">↓ Withdraw</button>
  <div class="quick-title">Transaction history</div><div class="empty">${icon("wallet")}<strong>No transactions yet</strong><p>Your earnings will appear here.</p></div>`;
}

function referralsView(){
  const link = `https://t.me/HillsByteBot?start=ref_${state.user.referral_code||state.user.id}`;
  return `<div class="page-head"><h1>Referrals</h1><div class="muted">Invite friends and earn from eligible activity.</div></div>
  <div class="card"><div class="stat-label">Your referral link</div><div class="row-title" style="word-break:break-all;margin:7px 0 10px">${link}</div><button class="primary-btn" id="copyRef">Copy link</button></div>
  <div class="grid2" style="margin-top:10px">${stat("Invited",0,"users")}${stat("Referral earnings",money(state.referrals),"activity")}</div>
  <div class="empty">${icon("users")}<strong>No referrals yet</strong><p>Share your link to start building your team.</p></div>`;
}

function communityView(){
  return `<div class="page-head"><h1>Community</h1><div class="muted">Connect with the HillsByte community.</div></div>
  <div class="list">
    ${["Telegram Community","Announcements Channel","Support Chat"].map((x,i)=>`<div class="list-row"><div><div class="row-title">${x}</div><div class="row-sub">${i===0?"Join other HillsByte members":"Get updates and support"}</div></div><button class="primary-btn" data-community="${i}">Open</button></div>`).join("")}
  </div>${adSection()}`;
}

function eventsView(){
  const rows=(state.events||[]).map(e=>`<div class="list-row"><div><div class="row-title">${escapeHtml(e.title)}</div><div class="row-sub">${escapeHtml(e.description||"HillsByte event")} • ${escapeHtml(e.starts_at||"Upcoming")}</div></div><button class="primary-btn">View</button></div>`).join("");
  return `<div class="page-head"><h1>Events</h1><div class="muted">Upcoming HillsByte events and campaigns.</div></div><div class="list">${rows||`<div class="empty">${icon("calendar")}<strong>No upcoming events</strong><p>Keep notifications enabled for new event drops.</p></div>`}</div>`;
}

function leaderboardView(){
  return `<div class="page-head"><h1>Leaderboards</h1><div class="muted">See how you rank across HillsByte.</div></div>
  <div class="toolbar"><button class="pill active">🏆 Top Earners</button><button class="pill">♧ Top Referrers</button><button class="pill">◷ Most Tasks</button><button class="pill">♨ Longest Streak</button></div>
  <div class="toolbar"><button class="pill">Today</button><button class="pill">This Week</button><button class="pill">This Month</button><button class="pill active">All Time</button></div>
  <div class="empty">${icon("trophy")}<strong>No rankings yet</strong><p>Be the first to climb the leaderboard.</p></div>`;
}

function notificationsView(){
  return `<div class="page-head"><h1>Notifications</h1><div class="muted">Stay updated on your HillsByte account.</div></div>
  <div class="list">${state.notifications.map((n,i)=>`<div class="list-row"><div><div class="row-title">${n.unread?"● ":""}${escapeHtml(n.title)}</div><div class="row-sub">${escapeHtml(n.body)} • ${n.time}</div></div><button class="primary-btn" data-read="${i}">${n.unread?"Read":"Seen"}</button></div>`).join("")}</div>`;
}

function profileView(){
  const name = `${state.user.first_name||"Telegram"} ${state.user.last_name||"User"}`.trim();
  return `<div class="card profile-card"><div class="avatar">${escapeHtml((state.user.first_name||"T")[0])}</div><div style="flex:1"><div class="row-title">${escapeHtml(name)}</div><div class="row-sub">@${escapeHtml(state.user.username||"telegram_user")} • Telegram ID ${escapeHtml(String(state.user.id))}</div></div><span class="pill active">Telegram</span></div>
  <div class="grid2" style="margin-top:10px">${stat("Lifetime",money(state.lifetime),"activity")}${stat("Available",money(state.balance),"wallet")}${stat("Tasks done",state.tasks.length,"activity")}${stat("HillsCoin",state.hbc+" HBC","wallet")}</div>
  <div class="settings"><div class="quick-title">⚙ Settings</div><div class="card">
    <div class="setting-row">◉ Display currency <span class="select">USD — US Dollar</span></div>
    <div class="setting-row">◎ Language <span class="select">English</span></div>
    <div class="setting-row">♧ Notifications <span class="accent">On</span></div>
    <div class="setting-row">◌ Privacy <span>Default</span></div>
    <div class="setting-row">✉ Telegram <span class="accent">✓ Connected</span></div>
  </div></div>
  <button class="card" id="signOut" style="width:100%;margin-top:14px;color:#e36c6c;background:transparent;border-color:rgba(227,108,108,.15)">↪ Sign out</button>`;
}

function adminView(){
  return `<div class="page-head"><h1>Admin Control Center</h1><div class="muted">Manage tasks, proof, withdrawals, events, announcements and ads.</div></div>
  <div class="toolbar"><button class="pill active">Overview</button><button class="pill">Tasks</button><button class="pill">Proofs</button><button class="pill">Withdrawals</button><button class="pill">Events</button><button class="pill">Announcements</button><button class="pill">Ads</button></div>
  <div class="list">
    ${["Write a short review","Daily check-in bonus","Try a partner app","Follow HillsByte on X","Join HillsByte Community"].map((x,i)=>`<div class="list-row"><div><div class="row-title">${x}</div><div class="row-sub">${["$0.12","$0.02","$0.15","$0.05","$0.07"][i]} • active</div></div><div><button class="pill">Edit</button> <button class="pill">Delete</button></div></div>`).join("")}
  </div>
  <div class="quick-title">Create content</div>
  <div class="grid2"><button class="card" id="newTask"><b>＋ New task</b><div class="row-sub">Add reward, timer, proof and requirements.</div></button><button class="card" id="newEvent"><b>＋ New event</b><div class="row-sub">Create event banner, rules and CTA.</div></button><button class="card" id="newAd"><b>＋ New ad</b><div class="row-sub">Manage sponsored placements.</div><button class="card" id="newAnnouncement"><b>＋ Announcement</b><div class="row-sub">Publish a pinned message.</div></div>`;
}

function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));}

async function startTask(id){
  const task=(state.tasks||[]).find(t=>String(t.id)===String(id));
  if(!task) return;
  try{
    const d=await api(`/api/tasks/${encodeURIComponent(id)}/start`,{method:"POST",body:{telegramId:currentTelegramId()}});
    openTaskRunner(task,d.attempt);
  }catch(e){toast(e.message)}
}
function openTaskRunner(task,attempt){
  openModal(`<div class="modal-head"><div class="modal-title">${escapeHtml(task.title)}</div><button class="icon-btn" onclick="closeModal()">${icon("x")}</button></div>
  <div class="muted">${escapeHtml(task.instructions||task.description||"Complete the task and submit proof.")}</div>
  <div class="card" style="margin-top:12px"><div class="stat-label">Reward</div><div class="stat-value">${money(task.reward)}</div><div class="row-sub">Timer: ${Number(task.timer_seconds||120)} seconds</div></div>
  ${task.task_url?`<button class="primary-btn" style="width:100%;margin-top:12px" id="openTaskLink">Open task</button>`:""}
  <div class="field full" style="margin-top:12px"><label>Proof screenshots</label><input id="proofFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple></div>
  <div class="field full"><label>Note (optional)</label><textarea id="proofNote" placeholder="Anything the reviewer should know..."></textarea></div>
  <div class="modal-actions"><button class="primary-btn" style="width:100%" id="submitProof">Submit proof</button></div></div>`);
  if(task.task_url) $("#openTaskLink").onclick=()=>window.open(task.task_url,"_blank","noopener,noreferrer");
  $("#submitProof").onclick=async()=>{
    const files=[...($("#proofFiles")?.files||[])].slice(0,3);
    if(!files.length){toast("Upload at least one screenshot.");return}
    const fd=new FormData(); fd.append("telegramId",currentTelegramId()); fd.append("attemptId",String(attempt.id)); fd.append("note",$("#proofNote").value||""); files.forEach(f=>fd.append("screenshots",f));
    try{await api("/api/submissions",{method:"POST",body:fd});closeModal();toast("Proof submitted for review.");await syncBackend();render();}catch(e){toast(e.message)}
  };
}

function bindView(){
  $$("[data-go]").forEach(b=>b.onclick=()=>setPage(b.dataset.go));
  $$("[data-page]").forEach(b=>b.onclick=()=>setPage(b.dataset.page));
  $("#checkIn")?.addEventListener("click",()=>toast("Daily check-in will be available when enabled by the administrator."));
  $("[data-task-id]")?.addEventListener("click", async e=>{});
  $$('[data-task-id]').forEach(b=>b.onclick=()=>startTask(b.dataset.taskId));
  $("#withdraw")?.addEventListener("click",()=>toast("Withdrawal requests are available after you meet the minimum balance."));
  $("#copyRef")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(`https://t.me/HillsByteBot?start=ref_${state.user.referral_code||state.user.id}`);toast("Referral link copied")}catch{toast("Copy unavailable")}})
  $$('[data-read]').forEach(b=>b.onclick=async()=>{state.notifications[Number(b.dataset.read)].unread=false;try{await api('/api/notifications/read',{method:'POST',body:{telegramId:currentTelegramId()}})}catch{};render()});
  $("#signOut")?.addEventListener("click",()=>toast("Telegram session stays controlled by Telegram. Close the Mini App to leave."));
  $("#newTask")?.addEventListener("click",()=>taskModal());
  $("#newEvent")?.addEventListener("click",()=>eventModal());
  $("#newAd")?.addEventListener("click",()=>adModal());
  $("#newAnnouncement")?.addEventListener("click",()=>announcementModal());
  $("#openAd")?.addEventListener("click",()=>toast("Demo sponsored offer opened."));
  $$("[data-community]").forEach(b=>b.onclick=()=>toast("Add your Telegram community URL in the app settings."));
}

function openModal(html){$("#modalRoot").innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;$("#modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeModal()})}
function closeModal(){$("#modalRoot").innerHTML=""}

function taskModal(){openModal(`<div class="modal-head"><div class="modal-title">New task</div><button class="icon-btn" onclick="closeModal()">${icon("x")}</button></div><div class="form-grid">
${field("Title","",true)}${field("Description","",true,"textarea")}${field("Reward (USD)","0.07")}${field("Category","social","select")}${field("Est. minutes","2")}${field("Difficulty","easy","select")}${field("Max slots","1000")}${field("Timer (sec)","120")}${field("Task URL","",true)}${field("Logo URL","",true)}${field("Instructions","",true,"textarea")}${field("Requirements","",true,"textarea")}</div><label style="font-size:9px"><input type="checkbox" checked> Proof required</label><div class="modal-actions"><button class="primary-btn" style="width:100%" onclick="toast('Task saved in demo mode');closeModal()">Save</button></div>`)}

function eventModal(){openModal(`<div class="modal-head"><div class="modal-title">New event</div><button class="icon-btn" onclick="closeModal()">${icon("x")}</button></div><div class="form-grid">
${field("Title","",true)}${field("Description","",true,"textarea")}${field("Banner URL","Leave empty to use 3D banner",true)}${field("Reward","")}${field("Rules","",true,"textarea")}${field("Start","09/24/2026, 3:33 AM")}${field("End","09/24/2026, 3:33 AM")}${field("CTA label","Join")}${field("CTA URL","")}</div><div class="modal-actions"><button class="primary-btn" style="width:100%" onclick="toast('Event saved in demo mode');closeModal()">Save</button></div>`)}

function adModal(){openModal(`<div class="modal-head"><div class="modal-title">New advertisement</div><button class="icon-btn" onclick="closeModal()">${icon("x")}</button></div><div class="form-grid">
${field("Advertiser","",true)}${field("Headline","",true)}${field("Description","",true,"textarea")}${field("Image URL","",true)}${field("CTA label","Open offer")}${field("CTA URL","",true)}${field("Placement","Dashboard")}${field("Status","active","select")}</div><div class="modal-actions"><button class="primary-btn" style="width:100%" onclick="toast('Ad saved in demo mode');closeModal()">Save</button></div>`)}

function announcementModal(){openModal(`<div class="modal-head"><div class="modal-title">New announcement</div><button class="icon-btn" onclick="closeModal()">${icon("x")}</button></div>${field("Title","",true)}${field("Message","",true,"textarea")}<label style="font-size:9px"><input type="checkbox"> Pin</label><div class="modal-actions"><button class="primary-btn" style="width:100%" onclick="toast('Announcement published in demo mode');closeModal()">Publish</button></div>`)}

function field(label,value="",full=false,type="input"){
  if(type==="textarea") return `<div class="field ${full?"full":""}"><label>${label}</label><textarea>${value}</textarea></div>`;
  if(type==="select") return `<div class="field ${full?"full":""}"><label>${label}</label><select><option>${value}</option><option>easy</option><option>medium</option><option>hard</option><option>social</option><option>apps</option><option>web3</option></select></div>`;
  return `<div class="field ${full?"full":""}"><label>${label}</label><input value="${escapeHtml(value)}"></div>`;
}

function openAI(){
  openModal(`<div class="modal-head"><div class="modal-title">${icon("ai")} HillsByte AI Assistant</div><button class="icon-btn" onclick="closeModal()">${icon("x")}</button></div>
  <div class="chat"><div class="chat-messages" id="chatMessages"><div class="msg ai">Hi! I’m your HillsByte assistant. Ask me about tasks, rewards, referrals, withdrawals, events, your wallet, or how the app works.</div></div>
  <div class="chat-input"><input id="aiInput" placeholder="Ask HillsByte AI..."><button class="primary-btn" id="aiSend">Send</button></div></div>`);
  $("#aiSend").onclick=sendAI;$("#aiInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendAI()});
}
async function sendAI(){
  const input=$("#aiInput");const text=input.value.trim();if(!text)return;
  const box=$("#chatMessages");box.insertAdjacentHTML("beforeend",`<div class="msg user">${escapeHtml(text)}</div>`);input.value="";box.scrollTop=box.scrollHeight;
  state.ai.push({role:"user",content:text});
  try{
    const r=await fetch("/api/ai/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:state.ai})});
    const d=await r.json();const reply=d.reply||"I couldn't reply right now.";state.ai.push({role:"assistant",content:reply});box.insertAdjacentHTML("beforeend",`<div class="msg ai">${escapeHtml(reply)}</div>`);
  }catch{box.insertAdjacentHTML("beforeend",`<div class="msg ai">I’m temporarily offline. Please try again.</div>`)}
  box.scrollTop=box.scrollHeight;
}

function toast(msg){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t)}t.textContent=msg;t.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2200)}

function openMenu(){$("#sideMenu").classList.add("open");$("#menuShade").classList.add("open")}
function closeMenu(){$("#sideMenu").classList.remove("open");$("#menuShade").classList.remove("open")}

$("#menuBtn").onclick=openMenu;$("#closeMenu").onclick=closeMenu;$("#menuShade").onclick=closeMenu;
$$(".nav-item").forEach(b=>b.onclick=()=>setPage(b.dataset.page));
$("#notifBtn").onclick=()=>setPage("notifications");
$("#aiFab").onclick=openAI;

async function telegramAuth(){
  const tg=window.Telegram?.WebApp;
  if(tg){
    tg.ready();tg.expand();
    try{ await syncBackend(); return true; }catch(e){ console.warn("HillsByte bootstrap:",e.message); }
  }
  return false;
}

setTimeout(async()=>{
  await telegramAuth();
  $("#splash").classList.add("hidden");
  $("#app").classList.remove("hidden");
  render();
},900);
