import React, {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {Wallet, ListChecks, Users, UserCircle, ShieldCheck, Clock3, Upload, Gift, Landmark, Coins, Bell, Bot, TrendingUp, History, UserPlus, Megaphone, ArrowUpRight, CheckCircle2, XCircle, Sparkles, Send, RefreshCw, Menu, X} from "lucide-react";
import "./styles.css";

const api = async (url, options={}) => {
  const initData=window.Telegram?.WebApp?.initData||"";
  const headers={"X-Telegram-Init-Data":initData,...(options.headers||{})};
  if(!(options.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"]="application/json";
  const r=await fetch(url,{...options,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
};

function tgUser(){
  return window.Telegram?.WebApp?.initDataUnsafe?.user || {};
}

const proofUrl=(submissionId,index,token)=>`/api/admin/submissions/${submissionId}/proof/${index}?token=${encodeURIComponent(token||"")}`;

function App(){
  const [me,setMe]=useState(null),[tasks,setTasks]=useState([]),[tab,setTab]=useState("home");
  const [selected,setSelected]=useState(null),[running,setRunning]=useState(null),[toast,setToast]=useState("");
  const [admin,setAdmin]=useState(false),[reviewer,setReviewer]=useState(false),[moderator,setModerator]=useState(false),[reviewerApplication,setReviewerApplication]=useState(null),[unread,setUnread]=useState(0),[broadcasts,setBroadcasts]=useState([]),[events,setEvents]=useState([]);

  const load=async()=>{
    try{
      const user=tgUser();
      if(!user.id) throw new Error("Telegram user data is missing. Close and reopen HillsByte from the bot.");
      const d=await api(`/api/bootstrap?telegramId=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username||"")}&firstName=${encodeURIComponent(user.first_name||"")}&referralCode=${encodeURIComponent(window.Telegram?.WebApp?.initDataUnsafe?.start_param||"")}`);
      setMe(d.user);setTasks(d.tasks||[]);setAdmin(!!d.admin);setReviewer(!!d.reviewer);setModerator(!!d.moderator);setReviewerApplication(d.reviewerApplication||null);setBroadcasts(d.broadcasts||[]);setEvents(d.events||[]);
      try{
        const p=await api(`/api/profile/details?telegramId=${encodeURIComponent(user.id)}`);
        setUnread((p.notifications||[]).filter(n=>!n.read_at).length);
      }catch{}
    }catch(e){setToast(e.message)}
  };

  useEffect(()=>{window.Telegram?.WebApp?.ready();window.Telegram?.WebApp?.expand();load()},[]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(t)},[toast]);

  const startTask=async task=>{
    try{
      const d=await api(`/api/tasks/${task.id}/start`,{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id)})});
      setRunning(d.attempt);setSelected(task);setTab("task");
    }catch(e){setToast(e.message)}
  };

  const nav=[
    ["home","Home",ListChecks],["wallet","Wallet",Wallet],["referrals","Referrals",Users],
    ["profile","Profile",UserCircle],["ads","Ads",Megaphone],["assistant","AI Help",Bot]
  ];

  if(!me) return <div className="splash">
    <div className="logoMark">H</div><h1>HILLSBYTE</h1>
    <p>Complete tasks. Earn rewards. Grow.</p>
    <button className="primary" onClick={()=>load()}>Open HillsByte</button>
  </div>;

  return <div className="appShell">
    <header className="topbar">
      <div><div className="brand">HILLS<span>BYTE</span></div><small>Earn. Complete. Grow.</small></div>
      <button className="topProfile" onClick={()=>setTab("profile")}>
        <span className="miniAvatar">{(me.first_name||"H")[0].toUpperCase()}</span>
        <span><b>{me.first_name||"Member"}</b><small>${Number(me.balance||0).toFixed(2)}</small></span>
      </button>
    </header>

    <main>
      {tab==="home"&&<Home me={me} tasks={tasks} broadcasts={broadcasts} events={events} onStart={startTask} setTab={setTab}/>}
      {tab==="task"&&selected&&running&&<TaskRunner task={selected} attempt={running} onDone={()=>{setRunning(null);setSelected(null);setTab("home");load()}} setToast={setToast}/>}
      {tab==="wallet"&&<WalletPage me={me} reload={load} setToast={setToast}/>}
      {tab==="referrals"&&<ReferralPage me={me}/>}
      {tab==="profile"&&<ProfilePage me={me} reload={load} setToast={setToast} setUnread={setUnread} reviewerApplication={reviewerApplication} onApplied={()=>{setReviewerApplication("pending");load()}}/>}
      {tab==="ads"&&<AdsPage setToast={setToast}/>}
      {tab==="assistant"&&<AssistantPage setToast={setToast}/>}\n      {tab==="review"&&reviewer&&<ReviewCenter setToast={setToast}/>}
      {tab==="admin"&&admin&&<AdminPage setToast={setToast}/>}
    </main>

    <nav className="bottomNav">
      {nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>
        <span className="navIconWrap"><Icon size={18}/>{id==="profile"&&unread>0&&<i className="navBadge">{unread>9?"9+":unread}</i>}</span><span>{label}</span>
      </button>)}
      {reviewer&&<button className={tab==="review"?"active":""} onClick={()=>setTab("review")}><ShieldCheck size={18}/><span>Review</span></button>}\n      {admin&&<button className={tab==="admin"?"active":""} onClick={()=>setTab("admin")}><ShieldCheck size={18}/><span>Admin</span></button>}
    </nav>
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}

function Home({me,tasks,broadcasts,events,onStart,setTab}){
  const [query,setQuery]=useState("");
  const filtered=useMemo(()=>tasks.filter(t=>{const q=query.trim().toLowerCase();return !q||String(t.title||"").toLowerCase().includes(q)||String(t.short_description||t.description||"").toLowerCase().includes(q)}),[tasks,query]);
  return <section className="homePage">
    <div className="dashboardHero">
      <div className="heroGlow"/>
      <div className="heroTop"><span className="eyebrow">AVAILABLE BALANCE</span><Coins size={20}/></div>
      <strong>${Number(me.balance||0).toFixed(2)}</strong>
      <div className="heroBottom"><span>Pending ${Number(me.pending_balance||0).toFixed(2)}</span><button onClick={()=>setTab("wallet")}>Wallet <ArrowUpRight size={14}/></button></div>
    </div>

    <div className="eventsPanel profilePanel">
      <div className="panelTitle"><div><h3>Events</h3><p>Broadcasts and upcoming events from HillsByte.</p></div><Megaphone/></div>
      <div className="eventList">
        {events.map(e=><div className="eventCard" key={`event-${e.id}`}><div><b>{e.title}</b><p>{e.description}</p><small>Upcoming · {new Date(e.starts_at.replace(" ","T")+"Z").toLocaleString()}</small></div></div>)}
        {broadcasts.map(b=><div className="eventCard" key={`broadcast-${b.id}`}><div><b>HillsByte update</b><p>{b.message||"New broadcast"}</p><small>Broadcast · {new Date(b.created_at+"Z").toLocaleString()}</small></div></div>)}
        {!events.length&&!broadcasts.length&&<div className="profileEmpty">No broadcasts or upcoming events yet.</div>}
      </div>
    </div>

    <div className="taskPanel profilePanel">
      <div className="panelTitle"><div><h3>Task Marketplace</h3><p>{tasks.length} task{tasks.length===1?"":"s"} posted · search and choose a task.</p></div><ListChecks/></div>
      <div className="taskSearch"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tasks..."/><span>{filtered.length}</span></div>
      {filtered.length===0?<div className="empty"><ListChecks size={28}/><b>No matching tasks</b><span>Try another task title or keyword.</span></div>:<div className="taskList">{filtered.map(t=><TaskCard key={t.id} task={t} onStart={()=>onStart(t)}/>)}</div>}
    </div>
  </section>;
}

function platformName(p){return ({telegram:"Telegram",x:"X",youtube:"YouTube",instagram:"Instagram",facebook:"Facebook",general:"Social / Web"})[p]||"Social / Web"}
function actionName(a){return ({join:"Join",follow:"Follow",like:"Like",repost:"Repost",like_repost:"Like + Repost",subscribe:"Subscribe",visit:"Open",comment:"Comment"})[a]||"Open"}
function actionVerb(task){return task.action_label||actionName(task.action_type)}
function TaskCard({task,onStart}){
  const pct=Math.min(100,Math.round((Number(task.total_completed||0)/Math.max(1,Number(task.max_slots||1)))*100));
  const dailyLeft=Math.max(0,Number(task.remaining_daily??task.daily_slots??0));
  return <article className="taskCard">
    <div className="taskTop">
      <div className="taskLogo">{task.logo_url?<img src={task.logo_url} alt=""/>:<ListChecks size={21}/>}</div>
      <div className="taskMeta"><div className="taskPlatform"><span className={`platformDot ${task.platform||"general"}`}></span>{platformName(task.platform)} · {actionName(task.action_type)}</div><h4>{task.title}</h4><p>{task.short_description||task.description}</p></div>
      <strong>${Number(task.reward||0).toFixed(2)}</strong>
    </div>
    <div className="taskDetails"><span><Clock3 size={13}/> {task.timer_seconds}s</span><span>{dailyLeft} today</span><span>{Math.max(0,Number(task.max_slots)-Number(task.total_completed))} total left</span></div>
    <div className="progress"><i style={{width:`${pct}%`}}/></div>
    <div className="taskFoot"><span>{pct}% filled</span><button onClick={onStart}>View Task <ArrowUpRight size={14}/></button></div>
  </article>;
}

function TaskRunner({task,attempt,onDone,setToast}){
  const [left,setLeft]=useState(()=>Math.max(0,Math.floor((attempt.expires_at-Date.now())/1000)));
  const [files,setFiles]=useState([]),[note,setNote]=useState(""),[gate,setGate]=useState(false);
  useEffect(()=>{const i=setInterval(()=>setLeft(Math.max(0,Math.floor((attempt.expires_at-Date.now())/1000))),1000);return()=>clearInterval(i)},[attempt]);
  const submit=async()=>{
    if(left<=0)return setToast("Timer expired. Start the task again to retry.");
    if(!files.length)return setToast("Upload at least one screenshot.");
    const fd=new FormData();fd.append("telegramId",String(tgUser().id));fd.append("attemptId",attempt.id);fd.append("note",note);
    files.slice(0,3).forEach(f=>fd.append("screenshots",f));
    try{
      const r=await fetch("/api/submissions",{method:"POST",headers:{"X-Telegram-Init-Data":window.Telegram?.WebApp?.initData||""},body:fd});
      const d=await r.json();if(!r.ok)throw new Error(d.error||"Submission failed");
      setToast("Proof submitted for review.");onDone();
    }catch(e){setToast(e.message)}
  };
  return <section>
    <button className="back" onClick={onDone}>← Back to tasks</button>
    <div className="runner">
      <div className="runnerHead">{task.logo_url&&<img src={task.logo_url} alt=""/>}<div><h2>{task.title}</h2><p>${Number(task.reward).toFixed(2)} reward</p></div><div className="timer">{left}s</div></div>
      {task.image_url&&<img className="taskImage" src={task.image_url} alt=""/>}
      {!gate?<><div className="socialTaskHero"><div className={`socialBrand ${task.platform||"general"}`}>{task.platform==="telegram"?"✈":task.platform==="x"?"𝕏":task.platform==="youtube"?"▶":"◎"}</div><div><span>{platformName(task.platform)} task</span><b>{actionVerb(task)}</b><small>Complete the action, then return here and upload proof.</small></div></div>
        <div className="instructions"><h3>How to complete</h3><p>{task.description}</p>{task.url&&<a className="actionLink" href={task.url} target="_blank" rel="noreferrer">{actionVerb(task)} ↗</a>}</div>
        <label className="uploadBox"><Upload/><b>Add proof screenshots</b><span>1–3 images · JPG, PNG or WEBP</span><input type="file" accept="image/*" multiple onChange={e=>setFiles([...e.target.files].slice(0,3))}/></label>
        {files.length>0&&<div className="filePreviewRow">{files.map(f=><div key={f.name}><img src={URL.createObjectURL(f)} alt=""/><span>{f.name}</span></div>)}</div>}
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a note for the reviewer (optional)"/>
        <button className="primary" onClick={submit}>Submit for review</button>
      </>:<div className="adGate"><Sparkles size={32}/><h3>Sponsor step</h3><p>Review the instructions below and continue when you're ready.</p><button className="primary" onClick={()=>setGate(false)}>Continue to task</button></div>}
    </div>
  </section>;
}

function WalletPage({me,reload,setToast}){
  const [method,setMethod]=useState("bank"),[form,setForm]=useState({accountName:"",accountNumber:"",bankName:"",network:"BEP20",address:"",memo:""});
  const withdraw=async()=>{try{await api("/api/withdrawals",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id),method,...form})});setToast("Withdrawal request submitted.");reload()}catch(e){setToast(e.message)}};
  return <section><div className="sectionHead"><div><h2>Wallet</h2><p>Manage your payout details</p></div><span className="livePill">Min $1.00</span></div>
    <div className="walletHero"><span>Available to withdraw</span><b>${Number(me.balance||0).toFixed(2)}</b><small>Pending ${Number(me.pending_balance||0).toFixed(2)}</small></div>
    <div className="methodGrid">{[["bank","Bank account",Landmark],["crypto","USDT wallet",Wallet]].map(([id,l,I])=><button className={method===id?"selected":""} onClick={()=>setMethod(id)} key={id}><I/><span>{l}</span></button>)}</div>
    {method==="bank"?<div className="formGrid"><input placeholder="Account holder full name" value={form.accountName} onChange={e=>setForm({...form,accountName:e.target.value})}/><input placeholder="Account number" value={form.accountNumber} onChange={e=>setForm({...form,accountNumber:e.target.value})}/><input placeholder="Bank name" value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})}/></div>:
    <div className="formGrid"><select value={form.network} onChange={e=>setForm({...form,network:e.target.value})}><option>BEP20</option><option>TRC20</option><option>TON</option></select><input placeholder="USDT wallet address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input placeholder="Memo / tag (optional)" value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})}/></div>}
    <button className="primary" onClick={withdraw}>Request ${Number(me.balance||0).toFixed(2)} payout</button>
  </section>;
}

function ReferralPage({me}){
  const link=`https://t.me/${window.BOT_USERNAME||"BytesMK7_bot"}?start=ref_${me.referral_code}`;
  return <section><div className="refHero"><div className="refIcon"><Users size={27}/></div><span className="eyebrow">REFERRAL PROGRAM</span><h2>Invite friends. Earn more.</h2><p>Share your invite link and earn according to the HillsByte referral program.</p><div className="code">{me.referral_code}</div><button onClick={()=>navigator.clipboard?.writeText(link)}>Copy invite link</button></div><div className="info"><Gift/><div><b>Referral rewards</b><p>Qualification and rewards are tracked automatically after approved task activity.</p></div></div></section>;
}

function ProfilePage({me,reload,setToast,setUnread,reviewerApplication,onApplied}){
  const [data,setData]=useState(null),[language,setLanguage]=useState(me.language||"English"),[email,setEmail]=useState(me.email||""),[saving,setSaving]=useState(false),[code,setCode]=useState("");
  const loadProfile=async()=>{try{const d=await api(`/api/profile/details?telegramId=${encodeURIComponent(tgUser().id)}`);setData(d);setUnread((d.notifications||[]).filter(n=>!n.read_at).length)}catch(e){setToast(e.message)}};
  useEffect(()=>{loadProfile()},[]);
  const saveProfile=async()=>{try{setSaving(true);await api("/api/profile",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id),language,email})});setToast("Profile updated.");reload();loadProfile()}catch(e){setToast(e.message)}finally{setSaving(false)}};
  const redeem=async()=>{try{const d=await api("/api/promo/redeem",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id),code})});setToast(d.message);setCode("");reload()}catch(e){setToast(e.message)}};
  const markRead=async()=>{try{await api("/api/notifications/read",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id)})});setUnread(0);loadProfile()}catch{}};
  const chart=data?.chart||[];
  const max=Math.max(1,...chart.map(x=>Number(x.completed||0)));
  return <section className="profilePage">
    <div className="profileHeroNew">
      <div className="avatar">{(me.first_name||"H")[0].toUpperCase()}</div>
      <div><span className="eyebrow">HILLSBYTE MEMBER</span><h2>{me.first_name||"Member"}</h2><p>@{me.username||"telegram_user"}</p><small>Telegram ID: {me.telegram_id}</small></div>
      <span className={`status ${me.status}`}>{me.status}</span>
    </div>

    <div className="profileStats">
      <div><CheckCircle2/><b>{me.completed_count||0}</b><span>Tasks completed</span></div>
      <div><UserPlus/><b>{me.referral_count||0}</b><span>Friends invited</span></div>
      <div><Coins/><b>{me.hillscoin||0}</b><span>HillsCoin</span></div>
    </div>

    <div className="profilePanel activityPanel">
      <div className="panelTitle"><div><h3>Activity</h3><p>Your approved-task activity over the last 7 days.</p></div><TrendingUp/></div>
      <div className="activityChart">{Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));const key=d.toISOString().slice(0,10);const item=chart.find(x=>x.day===key);const n=Number(item?.completed||0);return <div className="chartBar" key={key}><div className="barTrack"><i style={{height:`${Math.max(6,(n/max)*100)}%`}} title={`${n} completed`}/></div><small>{d.toLocaleDateString(undefined,{weekday:"short"}).slice(0,3)}</small></div>})}</div>
    </div>

    <div className="profilePanel">
      <div className="panelTitle"><div><h3>Notifications</h3><p>Updates about your account and tasks.</p></div><Bell/></div>
      {(data?.notifications||[]).length===0?<div className="profileEmpty">No notifications yet.</div>:
      <div className="notificationList">{(data.notifications||[]).slice(0,8).map(n=><div className={`notification ${n.read_at?"":"unread"}`} key={n.id}><span><Bell size={15}/></span><div><b>{n.title}</b><p>{n.message}</p><small>{new Date(n.created_at+"Z").toLocaleString()}</small></div></div>)}</div>}
      {(data?.notifications||[]).some(n=>!n.read_at)&&<button className="secondaryBtn fullBtn" onClick={markRead}>Mark all as read</button>}
    </div>

    <div className="profilePanel">
      <div className="panelTitle"><div><h3>Task history</h3><p>Your latest submissions and decisions.</p></div><History/></div>
      {(data?.history||[]).length===0?<div className="profileEmpty">Your task history will appear here.</div>:
      <div className="historyList">{data.history.map(h=><div className="historyRow" key={h.id}><span className={`historyIcon ${h.status}`} >{h.status==="approved"?<CheckCircle2/>:<XCircle/>}</span><div><b>{h.title}</b><small>{h.status} · {new Date(h.created_at+"Z").toLocaleDateString()}</small></div><strong>${Number(h.reward||0).toFixed(2)}</strong></div>)}</div>}
    </div>

    <div className="profilePanel">
      <div className="panelTitle"><div><h3>Account settings</h3><p>Keep your profile information up to date.</p></div><UserCircle/></div>
      <div className="formGrid"><select value={language} onChange={e=>setLanguage(e.target.value)}>{["English","Nigerian Pidgin","French","Spanish","Portuguese","Arabic","German","Italian","Turkish","Hindi"].map(x=><option key={x}>{x}</option>)}</select><input type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/></div>
      <button className="primary" onClick={saveProfile} disabled={saving}>{saving?"Saving...":"Save profile"}</button>
    </div>

    <div className="profilePanel reviewerApplyPanel"><div className="panelTitle"><div><h3>Reviewer Program</h3><p>Review task proofs as a separate HillsByte role. Reviewer access never gives you owner or bot controls.</p></div><ShieldCheck/></div>
      {!reviewerApplication&&<ReviewerApplication onApplied={onApplied} setToast={setToast}/>}
      {reviewerApplication==="pending"&&<div className="roleStatus pending"><b>Application pending</b><span>The HillsByte team will review your application.</span></div>}
      {reviewerApplication==="approved"&&<div className="roleStatus approved"><b>Reviewer access active</b><span>Your Review Center is available in the bottom navigation.</span></div>}
      {reviewerApplication==="rejected"&&<ReviewerApplication onApplied={onApplied} setToast={setToast} retry/>}
    </div>

    <div className="profilePanel"><div className="panelTitle"><div><h3>Promo code</h3><p>Redeem a code from HillsByte.</p></div><Gift/></div><div className="inline"><input placeholder="ENTER CODE" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button onClick={redeem}>Redeem</button></div></div>
  </section>;
}

function ReviewerApplication({onApplied,setToast,retry=false}){
  const [reason,setReason]=useState("");
  const submit=async()=>{if(reason.trim().length<20)return setToast("Tell us a little more about why you want to review proofs (at least 20 characters).");try{await api("/api/reviewer/apply",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id),reason})});setToast("Reviewer application submitted.");onApplied()}catch(e){setToast(e.message)}};
  return <div className="reviewerApply"><textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why would you be a good proof reviewer? Mention your experience, availability, or attention to detail."/><button className="primary" onClick={submit}>{retry?"Apply again":"Apply to become a reviewer"}</button></div>;
}
function ReviewCenter({setToast}){
  const [items,setItems]=useState([]),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false);
  const load=async()=>{try{setBusy(true);const d=await api("/api/reviewer/queue");setItems(d.submissions||[])}catch(e){setToast(e.message)}finally{setBusy(false)}};
  useEffect(()=>{load()},[]);
  const decide=async(id,status)=>{try{await api(`/api/reviewer/submissions/${id}`,{method:"POST",body:JSON.stringify({status})});setSelected(null);setToast(status==="approved"?"Proof approved.":"Proof rejected.");load()}catch(e){setToast(e.message)}};
  return <section className="reviewCenter">
    <div className="reviewHero"><div className="reviewHeroIcon"><ShieldCheck/></div><div><span className="eyebrow">TRUSTED ROLE</span><h2>Reviewer Center</h2><p>Review member proof only. No withdrawals, bot settings, or owner controls.</p></div><span className="reviewCount">{items.length}</span></div>
    <div className="reviewQueueHead"><div><h3>Proof queue</h3><p>{busy?"Refreshing…":"Pending submissions waiting for review."}</p></div><button className="secondaryBtn" onClick={load}>Refresh</button></div>
    <div className="reviewQueue">{items.map(s=><article className="reviewCard" key={s.id}>
      <div className="reviewIdentity"><div className={`socialBrand ${s.platform||"general"}`}>{s.platform==="telegram"?"✈":s.platform==="x"?"𝕏":s.platform==="youtube"?"▶":"◎"}</div><div><b>{s.title}</b><small>{s.first_name||"Member"} {s.username?`· @${s.username}`:""} · ${Number(s.reward||0).toFixed(2)}</small><span>{platformName(s.platform)} · {actionName(s.action_type)}</span></div></div>
      <button className="reviewOpen" onClick={()=>setSelected(s)}>Inspect proof</button>
    </article>)}
    {!items.length&&<div className="profileEmpty"><ShieldCheck size={28}/><b>Queue is clear</b><span>New submissions will appear here.</span></div>}</div>
    {selected&&<div className="reviewModal" onClick={()=>setSelected(null)}><div className="reviewModalInner" onClick={e=>e.stopPropagation()}><div className="proofModalHeader"><div><h3>{selected.title}</h3><p>{selected.first_name||"Member"} · {platformName(selected.platform)} · {actionName(selected.action_type)}</p></div><button onClick={()=>setSelected(null)}><X/></button></div><div className="reviewProofGrid">{(selected.screenshots||[]).map((src,i)=><img key={i} src={src} alt={`Proof ${i+1}`}/>)}</div><div className="reviewDecision"><button className="dangerBtn" onClick={()=>decide(selected.id,"rejected")}>Reject proof</button><button className="approveBtn" onClick={()=>decide(selected.id,"approved")}>Approve proof</button></div></div></div>}
  </section>;
}

function AdsPage({setToast}){
  const [ads,setAds]=useState(null),[loading,setLoading]=useState(true);
  useEffect(()=>{api("/api/ads").then(d=>setAds(d.ads)).catch(e=>setToast(e.message)).finally(()=>setLoading(false))},[]);
  return <section className="adsPage">
    <div className="adsHero"><div className="adsIcon"><Megaphone/></div><div><span className="eyebrow">REWARDS CENTER</span><h2>Ads & Sponsors</h2><p>Sponsored activities can provide extra earning opportunities.</p></div></div>
    <div className="adStatusCard"><div><span className="muted">Ad service</span><b>{loading?"Checking…":ads?.enabled?"Available":"Currently unavailable"}</b></div><span className={`status ${ads?.enabled?"active":"off"}`}>{ads?.enabled?"ON":"OFF"}</span></div>
    <div className="adInfoGrid"><div><Coins/><b>${Number(ads?.reward_amount||0).toFixed(2)}</b><span>Reward / ad</span></div><div><Clock3/><b>{Number(ads?.cooldown||0)}s</b><span>Cooldown</span></div><div><ListChecks/><b>{Number(ads?.daily_limit||0)}</b><span>Daily limit</span></div></div>
    <div className="profilePanel"><div className="panelTitle"><div><h3>How ads work</h3><p>When an approved sponsor provider is connected, eligible ad activities will appear here.</p></div><Sparkles/></div><div className="adSteps"><span>01 <b>Open a sponsor activity</b></span><span>02 <b>Complete it normally</b></span><span>03 <b>Verified reward is credited</b></span></div></div>
    {!ads?.enabled&&<div className="profileEmpty">The administrator has not enabled a verified ad provider yet.</div>}
  </section>;
}

function AssistantPage({setToast}){
  const [question,setQuestion]=useState(""),[messages,setMessages]=useState([{role:"assistant",text:"Hi! I'm the HillsByte assistant. Ask me about tasks, submissions, withdrawals, referrals, ads, or your profile."}]),[busy,setBusy]=useState(false);
  const ask=async()=>{
    const q=question.trim();if(!q||busy)return;
    setMessages(m=>[...m,{role:"user",text:q}]);setQuestion("");setBusy(true);
    try{const d=await api("/api/assistant",{method:"POST",body:JSON.stringify({question:q,telegramId:String(tgUser().id)})});setMessages(m=>[...m,{role:"assistant",text:d.answer}])}catch(e){setToast(e.message)}finally{setBusy(false)}
  };
  return <section className="assistantPage">
    <div className="assistantHero"><div className="assistantIcon"><Bot/></div><div><span className="eyebrow">HILLSBYTE AI</span><h2>Assistant</h2><p>Quick help whenever you need it.</p></div></div>
    <div className="assistantChat">{messages.map((m,i)=><div className={`chatBubble ${m.role}`} key={i}><span>{m.role==="assistant"?<Bot size={15}/>:<UserCircle size={15}/>}</span><p>{m.text}</p></div>)}{busy&&<div className="chatBubble assistant"><span><Bot size={15}/></span><p>Thinking…</p></div>}</div>
    <div className="assistantInput"><textarea rows="2" placeholder="Ask something about HillsByte…" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask()}}}/><button onClick={ask} disabled={busy}><Send size={17}/></button></div>
    <div className="quickQuestions">{["How do I complete a task?","Why was my proof rejected?","How do withdrawals work?","How do referrals work?"].map(q=><button key={q} onClick={()=>setQuestion(q)}>{q}</button>)}</div>
  </section>;
}

function AdminPage({setToast}){
  const [tab,setTab]=useState("overview");
  const [tasks,setTasks]=useState([]);
  const [users,setUsers]=useState([]);
  const [withdrawals,setWithdrawals]=useState([]);
  const [submissions,setSubmissions]=useState([]);
  const [ads,setAds]=useState(null),[applications,setApplications]=useState([]),[roles,setRoles]=useState({reviewers:[],moderators:[]});
  const [loading,setLoading]=useState(false);
  const [editing,setEditing]=useState(null);
  const [selectedSubmission,setSelectedSubmission]=useState(null);
  const [selectedProofIndex,setSelectedProofIndex]=useState(0),[proofZoom,setProofZoom]=useState(false);
  const [proofSearch,setProofSearch]=useState(""),[proofSort,setProofSort]=useState("newest"),[selectedProofs,setSelectedProofs]=useState(new Set());
  const [taskSearch,setTaskSearch]=useState(""),[selectedUser,setSelectedUser]=useState(null),[userProfile,setUserProfile]=useState(null);

  const emptyForm={
    title:"",
    short_description:"",
    description:"",
    url:"",
    reward:"1",
    max_slots:"1000",
    daily_slots:"500",
    timer_seconds:"120",
    platform:"telegram", action_type:"join", action_label:"Join on Telegram",
    ad_enabled:true
  };

  const [form,setForm]=useState(emptyForm);
  const [logoFile,setLogoFile]=useState(null);
  const [imageFile,setImageFile]=useState(null);

  const [adForm,setAdForm]=useState({
    provider:"",
    unit_id:"",
    provider_secret:"",
    reward_amount:"0",
    daily_limit:"5",
    cooldown:"30",
    enabled:true
  });
  const [eventForm,setEventForm]=useState({title:"",description:"",starts_at:""});

  const load=async()=>{
    try{
      setLoading(true);
      const [td,ud,wd,sd,ad,apps,roleData]=await Promise.all([
        api("/api/admin/tasks"),api("/api/admin/users"),api("/api/admin/withdrawals"),
        api("/api/admin/submissions"),api("/api/admin/ads"),api("/api/admin/reviewer-applications"),api("/api/admin/roles")
      ]);
      setTasks(td.tasks||[]);
      setUsers(ud.users||[]);
      setWithdrawals(wd.withdrawals||[]);
      setSubmissions(sd.submissions||[]);setSelectedProofs(new Set());
      setAds(ad.ads||null);setApplications(apps.applications||[]);setRoles(roleData||{reviewers:[],moderators:[]});
      if(ad.ads){
        setAdForm({
          provider:ad.ads.provider||"",
          unit_id:ad.ads.unit_id||"",
          provider_secret:"",
          reward_amount:String(ad.ads.reward_amount??"0"),
          daily_limit:String(ad.ads.daily_limit??"5"),
          cooldown:String(ad.ads.cooldown??"30"),
          enabled:!!ad.ads.enabled
        });
      }
    }catch(e){setToast(e.message)}
    finally{setLoading(false)}
  };

  useEffect(()=>{load()},[]);

  const resetTaskForm=()=>{
    setEditing(null);
    setForm(emptyForm);
    setLogoFile(null);
    setImageFile(null);
  };

  const createOrUpdate=async()=>{
    try{
      if(!form.title.trim()||!form.description.trim()) throw new Error("Task title and description are required.");

      const payload={
        ...form,
        reward:Number(form.reward),
        max_slots:Math.min(1000,Math.max(1,Number(form.max_slots))),
        daily_slots:Math.min(200,Math.max(1,Number(form.daily_slots))),
        timer_seconds:Math.max(10,Number(form.timer_seconds)), platform:form.platform, action_type:form.action_type, action_label:form.action_label
      };

      const data=await api(editing ? `/api/admin/tasks/${editing.id}` : "/api/admin/tasks",{
        method:editing?"PUT":"POST",
        body:JSON.stringify(payload)
      });

      const taskId=editing?.id||data.id;

      if(logoFile||imageFile){
        const fd=new FormData();
        if(logoFile) fd.append("logo",logoFile);
        if(imageFile) fd.append("image",imageFile);
        await api(`/api/admin/tasks/${taskId}/media`,{
          method:"POST",
          body:fd
        });
      }

      setToast(editing ? "Task updated." : "Task published.");
      resetTaskForm();
      await load();
    }catch(e){setToast(e.message)}
  };

  const editTask=(t)=>{
    setEditing(t);
    setForm({
      title:t.title||"",
      short_description:t.short_description||"",
      description:t.description||"",
      url:t.url||"",
      reward:String(t.reward??"1"),
      max_slots:String(t.max_slots??"1000"),
      daily_slots:String(t.daily_slots??"200"),
      timer_seconds:String(t.timer_seconds??"120"),
      platform:t.platform||"general", action_type:t.action_type||"visit", action_label:t.action_label||"Open task",
      ad_enabled:!!t.ad_enabled
    });
    setLogoFile(null);
    setImageFile(null);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const deleteTask=async(id)=>{
    if(!confirm("Delete this task? Existing submissions will remain for record keeping.")) return;
    try{
      await api(`/api/admin/tasks/${id}`,{method:"DELETE"});
      setToast("Task deleted.");
      await load();
    }catch(e){setToast(e.message)}
  };

  const toggleTask=async(t)=>{
    try{
      await api(`/api/admin/tasks/${t.id}/status`,{
        method:"POST",
        body:JSON.stringify({active:t.active?0:1})
      });
      setToast(t.active?"Task deactivated.":"Task activated.");
      await load();
    }catch(e){setToast(e.message)}
  };

  const act=async(id,action)=>{
    try{
      await api(`/api/admin/users/${id}/${action}`,{method:"POST"});
      setToast("User updated.");
      await load();
    }catch(e){setToast(e.message)}
  };

  const messageUser=async(id)=>{
    const message=prompt("Message to send to this user:");
    if(!message?.trim()) return;
    try{
      await api(`/api/admin/users/${id}/message`,{
        method:"POST",
        body:JSON.stringify({message})
      });
      setToast("Message sent.");
    }catch(e){setToast(e.message)}
  };

  const pay=async(id,status)=>{
    try{
      await api(`/api/admin/withdrawals/${id}`,{
        method:"POST",
        body:JSON.stringify({status})
      });
      setToast(`Withdrawal ${status}.`);
      await load();
    }catch(e){setToast(e.message)}
  };

  const review=async(id,status)=>{
    try{
      await api(`/api/admin/submissions/${id}`,{
        method:"POST",
        body:JSON.stringify({status})
      });
      setSelectedSubmission(null);
      setToast(`Submission ${status}.`);
      await load();
    }catch(e){setToast(e.message)}
  };

  const filteredTasks=tasks.filter(t=>{const q=taskSearch.trim().toLowerCase();return !q||String(t.title||"").toLowerCase().includes(q)||String(t.short_description||"").toLowerCase().includes(q)});
  const filteredProofs=submissions.filter(s=>{const q=proofSearch.trim().toLowerCase();return !q||String(s.title||"").toLowerCase().includes(q)||String(s.first_name||s.username||"").toLowerCase().includes(q)}).sort((a,b)=>proofSort==="oldest"?a.id-b.id:proofSort==="member"?String(a.username||a.first_name||"").localeCompare(String(b.username||b.first_name||"")):b.id-a.id);
  const toggleProof=(id)=>setSelectedProofs(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n});
  const deleteSelectedProofs=async()=>{const ids=[...selectedProofs];if(!ids.length)return; if(!confirm(`Delete ${ids.length} rejected proof record${ids.length===1?"":"s"}?`))return;try{await api("/api/admin/submissions/bulk-delete",{method:"POST",body:JSON.stringify({ids})});setToast("Selected rejected proofs deleted.");await load()}catch(e){setToast(e.message)}};
  const openUserProfile=async(u)=>{setSelectedUser(u);try{const d=await api(`/api/admin/users/${u.id}/profile`);setUserProfile(d)}catch(e){setToast(e.message)}};

  const saveAds=async()=>{
    try{
      await api("/api/admin/ads",{
        method:"PUT",
        body:JSON.stringify(adForm)
      });
      setToast("Ad settings saved.");
      await load();
    }catch(e){setToast(e.message)}
  };

  const pendingSubmissions=submissions.filter(s=>s.status==="pending").length;
  const pendingWithdrawals=withdrawals.filter(w=>w.status==="pending").length;
  const activeTasks=tasks.filter(t=>Number(t.active)===1).length;

const nav=[
  ["overview","Overview"],
  ["tasks","Tasks"],
  ["submissions","Proofs"],
  ["users","Users"],
  ["withdrawals","Withdrawals"],
  ["ads","Ads"],
  ["roles","Roles"],
  ["broadcast","Broadcast"]
];

  return <section className="adminShell">

    <div className="adminHeader">
      <div>
        <span className="adminEyebrow">HILLSBYTE CONTROL CENTER</span>
        <h2>Administration</h2>
        <p>Manage the earning platform from one stable workspace.</p>
      </div>
      <button className="adminRefresh" onClick={load} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>

    <div className="adminNavigation">
      {nav.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>
        <span>{label}</span>
        {key==="submissions"&&pendingSubmissions>0&&<em>{pendingSubmissions}</em>}
        {key==="withdrawals"&&pendingWithdrawals>0&&<em>{pendingWithdrawals}</em>}
      </button>)}
    </div>

    {tab==="overview"&&<div className="adminContent">
      <div className="adminStats">
        <div className="adminStatCard"><span>Total users</span><strong>{users.length}</strong><small>Registered accounts</small></div>
        <div className="adminStatCard"><span>Active tasks</span><strong>{activeTasks}</strong><small>Published campaigns</small></div>
        <div className="adminStatCard"><span>Pending proofs</span><strong>{pendingSubmissions}</strong><small>Need review</small></div>
        <div className="adminStatCard"><span>Pending payouts</span><strong>{pendingWithdrawals}</strong><small>Need action</small></div>
      </div>

      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>Quick actions</h3><p>Jump directly to the area you need.</p></div></div>
        <div className="adminQuickGrid">
          <button onClick={()=>setTab("tasks")}><b>Task board</b><span>Create, edit and control campaigns</span></button>
          <button onClick={()=>setTab("submissions")}><b>Proof review</b><span>Open screenshots and approve work</span></button>
          <button onClick={()=>setTab("users")}><b>User management</b><span>Accounts, balances and moderation</span></button>
          <button onClick={()=>setTab("ads")}><b>Ad center</b><span>Configure provider and reward settings</span></button>
        </div>
      </div>
    </div>}
{tab==="broadcast"&&<div className="adminContent">
  <div className="adminPanel">
    <div className="adminPanelHeader">
      <div>
        <h3>📢 Broadcast Message</h3>
        <p>Send a notification to all active HillsByte users.</p>
      </div>
    </div>

    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      id="broadcastImage"
    />

    <textarea
      placeholder="Write your message here..."
      rows="7"
      id="broadcastMessage"
    />

    <button
      className="primaryBtn"
      onClick={async()=>{
        const message=document.getElementById("broadcastMessage").value.trim();
        const image=document.getElementById("broadcastImage").files?.[0];

        if(!message&&!image){
          setToast("Enter a message or select a picture.");
          return;
        }

        if(!confirm("Send this broadcast to all active users?")) return;

        try{
          let imageUrl="";

          if(image){
            const fd=new FormData();
            fd.append("image",image);

            const upload=await api("/api/admin/broadcast/upload",{
              method:"POST",
              body:fd
            });

            imageUrl=upload.url;
          }

          const d=await api("/api/admin/broadcast",{
            method:"POST",
            body:JSON.stringify({message,imageUrl})
          });

          setToast(`Broadcast sent to ${d.sent} of ${d.total} users.`);

          document.getElementById("broadcastMessage").value="";
          document.getElementById("broadcastImage").value="";
        }catch(e){
          setToast(e.message);
        }
      }}
    >
      Send to All Users
    </button>
  </div>
</div>}

    {tab==="tasks"&&<div className="adminContent">
      <div className="adminPanel">
        <div className="adminPanelHeader">
          <div>
            <h3>{editing?"Edit task":"Create task"}</h3>
            <p>{editing?"Update this campaign and its media.":"Publish a professional earning campaign."}</p>
          </div>
          {editing&&<button className="secondaryBtn" onClick={resetTaskForm}>Cancel edit</button>}
        </div>

        <div className="adminFormGrid">
          <input placeholder="Task title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
          <input placeholder="Short description" value={form.short_description} onChange={e=>setForm({...form,short_description:e.target.value})}/>
          <select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}><option value="telegram">Telegram</option><option value="x">X</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="general">Social / Web</option></select>
          <select value={form.action_type} onChange={e=>setForm({...form,action_type:e.target.value})}>{({telegram:["join","follow"],x:["follow","like","repost","like_repost"],youtube:["subscribe","like"],instagram:["follow","like"],facebook:["follow","like"],general:["visit","comment"]}[form.platform]||["visit"]).map(x=><option key={x} value={x}>{actionName(x)}</option>)}</select>
          <input placeholder="Button label e.g. Subscribe on YouTube" value={form.action_label} onChange={e=>setForm({...form,action_label:e.target.value})}/>
          <textarea className="wideField" placeholder="Full task instructions" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
          <input placeholder="Task URL" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/>
          <input type="number" min="0" step="0.01" placeholder="Reward in USD" value={form.reward} onChange={e=>setForm({...form,reward:e.target.value})}/>
          <input type="number" min="1" max="1000" placeholder="Total slots (max 1000)" value={form.max_slots} onChange={e=>setForm({...form,max_slots:e.target.value})}/>
          <input type="number" min="1" max="200" placeholder="Daily slots (max 200)" value={form.daily_slots} onChange={e=>setForm({...form,daily_slots:e.target.value})}/>
          <input type="number" min="10" placeholder="Completion timer (seconds)" value={form.timer_seconds} onChange={e=>setForm({...form,timer_seconds:e.target.value})}/>
        </div>

        <div className="mediaUploadGrid">
          <label className="mediaDrop">
            <Upload size={22}/>
            <b>{logoFile?"Logo selected":"Upload task logo"}</b>
            <small>PNG, JPG or WEBP</small>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setLogoFile(e.target.files?.[0]||null)}/>
          </label>
          <label className="mediaDrop">
            <Upload size={22}/>
            <b>{imageFile?"Task image selected":"Upload task image"}</b>
            <small>PNG, JPG or WEBP</small>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setImageFile(e.target.files?.[0]||null)}/>
          </label>
        </div>

        <label className="adminCheck">
          <input type="checkbox" checked={form.ad_enabled} onChange={e=>setForm({...form,ad_enabled:e.target.checked})}/>
          <span><b>Enable sponsor / ad gate</b><small>Show the configured ad step before task instructions.</small></span>
        </label>

        <button className="primary adminPublish" onClick={createOrUpdate}>
          {editing?"Save task changes":"Publish task"}
        </button>
      </div>

      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>Task board</h3><p>{tasks.length} campaign{tasks.length===1?"":"s"} in the system.</p></div></div>
        <div className="adminToolbar"><input placeholder="Search tasks..." value={taskSearch} onChange={e=>setTaskSearch(e.target.value)}/><span>{filteredTasks.length} shown</span></div>
        <div className="adminTaskBoard">
          {tasks.length===0&&<div className="adminEmpty">No tasks have been created yet.</div>}
          {filteredTasks.map(t=>{
            const pct=Math.min(100,Math.round((Number(t.total_completed||0)/Math.max(1,Number(t.max_slots||1)))*100));
            return <article className="adminTaskCard" key={t.id}>
              <div className="adminTaskMain">
                <div className="adminTaskIcon">
                  {t.logo_url?<img src={t.logo_url} alt=""/>:<ListChecks size={22}/>}
                </div>
                <div className="adminTaskInfo">
                  <div className="adminTaskTitle">{t.title}</div>
                  <div className="adminTaskMeta"><span>${Number(t.reward).toFixed(2)}</span><span>{t.total_completed}/{t.max_slots} total</span><span>{t.daily_slots}/day</span><span>{t.timer_seconds}s</span><span>{platformName(t.platform)} · {actionName(t.action_type)}</span></div>
                  <div className="adminProgress"><i style={{width:`${pct}%`}}/></div>
                </div>
              </div>
              <div className="adminTaskActions">
                <span className={Number(t.active)===1?"statusActive":"statusOff"}>{Number(t.active)===1?"ACTIVE":"OFF"}</span>
                <button onClick={()=>toggleTask(t)}>{Number(t.active)===1?"Deactivate":"Activate"}</button>
                <button onClick={()=>editTask(t)}>Edit</button>
                <button className="dangerBtn" onClick={()=>deleteTask(t.id)}>Delete</button>
              </div>
            </article>
          })}
        </div>
      </div>
    </div>}

    {tab==="submissions"&&<div className="adminContent">
      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>Proof review</h3><p>Open uploaded screenshots inside the app before approving.</p></div></div>
        <div className="adminToolbar proofToolbar"><input placeholder="Search proof or member..." value={proofSearch} onChange={e=>setProofSearch(e.target.value)}/><select value={proofSort} onChange={e=>setProofSort(e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="member">Member</option></select><button onClick={()=>setSelectedProofs(new Set(filteredProofs.filter(s=>s.status!=="pending").map(s=>s.id)))}>Select all reviewed</button><button onClick={()=>setSelectedProofs(new Set())}>Clear</button><button className="dangerBtn" onClick={deleteSelectedProofs}>Delete reviewed proofs</button></div>
        <div className="adminSubmissionList">
          {submissions.length===0&&<div className="adminEmpty">No submissions found.</div>}
          {filteredProofs.map(s=><article className="adminSubmissionCard" key={s.id}>
            <div className="submissionIdentity"><label className="proofSelect"><input type="checkbox" checked={selectedProofs.has(s.id)} onChange={()=>toggleProof(s.id)}/></label>
              <div className="adminUserAvatar">{(s.first_name||s.username||"U").charAt(0).toUpperCase()}</div>
              <div><b>{s.title||"Task submission"}</b><small>{s.first_name||"Telegram user"} {s.username?`· @${s.username}`:""}</small><small>Reward ${Number(s.reward||0).toFixed(2)} · {s.status}</small></div>
            </div>
            <div className="proofThumbs">
              {(s.screenshots||[]).slice(0,3).map((src,i)=><button key={`${s.id}-${i}`} onClick={()=>{setSelectedSubmission(s);setSelectedProofIndex(i);setProofZoom(false)}}><img src={proofUrl(s.id,i,(s.proofTokens||[])[i])} alt={`Proof ${i+1}`} onError={e=>{e.currentTarget.style.visibility="hidden"}}/></button>)}
              {(!s.screenshots||s.screenshots.length===0)&&<span>No screenshots</span>}
            </div>
            <div className="submissionActions">
              <button onClick={()=>{setSelectedSubmission(s);setSelectedProofIndex(0);setProofZoom(false)}}>View proof</button>
              {s.status==="pending"&&<><button className="approveBtn" onClick={()=>review(s.id,"approved")}>Approve</button><button className="dangerBtn" onClick={()=>review(s.id,"rejected")}>Reject</button></>}
            </div>
          </article>)}
        </div>
      </div>
    </div>}

    {tab==="users"&&<div className="adminContent">
      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>User management</h3><p>Recent HillsByte accounts and moderation controls.</p></div></div>
        <div className="adminUserList">
          {users.length===0&&<div className="adminEmpty">No users found.</div>}
          {users.map(u=><article className="adminUserCard" key={u.id}>
            <div className="adminUserAvatar">{(u.first_name||u.username||"U").charAt(0).toUpperCase()}</div>
            <button className="adminUserInfo userOpen" onClick={()=>openUserProfile(u)}><b>{u.first_name||"Telegram member"}</b><small>{u.username?`@${u.username}`:"No username"} · ID {u.telegram_id}</small><small>${Number(u.balance||0).toFixed(2)} balance · {u.status}</small></button>
            <div className="adminUserActions"><button onClick={()=>messageUser(u.id)}>Message</button><button onClick={()=>act(u.id,u.status==="banned"?"unban":"ban")}>{u.status==="banned"?"Unban":"Ban"}</button></div>
          </article>)}
        </div>
      </div>
    </div>}

    {tab==="roles"&&<div className="adminContent">
      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>🛡️ Roles & access</h3><p>Reviewers and moderators are separate from your owner account.</p></div></div>
        <div className="roleSection"><h4>Reviewer applications</h4>{applications.filter(a=>a.status==="pending").map(a=><article className="roleCard" key={a.id}><div><b>{a.first_name||"Member"} {a.username?`· @${a.username}`:""}</b><small>{a.reason||"No reason provided"}</small></div><div className="rowBtns"><button className="approveBtn" onClick={async()=>{await api(`/api/admin/reviewer-applications/${a.id}`,{method:"POST",body:JSON.stringify({status:"approved"})});setToast("Reviewer approved.");load()}}>Approve</button><button className="dangerBtn" onClick={async()=>{await api(`/api/admin/reviewer-applications/${a.id}`,{method:"POST",body:JSON.stringify({status:"rejected"})});setToast("Application rejected.");load()}}>Reject</button></div></article>)}{!applications.filter(a=>a.status==="pending").length&&<div className="profileEmpty">No pending reviewer applications.</div>}</div>
        <div className="roleSection"><h4>Assign moderators manually</h4><div className="moderatorPicker">{users.map(u=><article className="roleCard" key={u.id}><div><b>{u.first_name||"Member"}</b><small>{u.username?`@${u.username}`:"Telegram user"} · ID {u.telegram_id}</small></div><button onClick={async()=>{try{await api(`/api/admin/roles/moderator/${u.id}`,{method:"POST"});setToast("Moderator added.");load()}catch(e){setToast(e.message)}}}>{roles.moderators.some(m=>m.user_id===u.id)?"Moderator":"Add moderator"}</button></article>)}</div></div>
        <div className="roleSection"><h4>Current reviewers</h4>{roles.reviewers.map(r=><div className="roleLine" key={r.user_id}><span>{r.first_name||"Member"} {r.username?`· @${r.username}`:""}</span><button onClick={async()=>{await api(`/api/admin/roles/reviewer/${r.user_id}`,{method:"DELETE"});load()}}>Remove</button></div>)}</div>
        <div className="roleSection"><h4>Current moderators</h4>{roles.moderators.map(r=><div className="roleLine" key={r.user_id}><span>{r.first_name||"Member"} {r.username?`· @${r.username}`:""}</span><button onClick={async()=>{await api(`/api/admin/roles/moderator/${r.user_id}`,{method:"DELETE"});load()}}>Remove</button></div>)}</div>
      </div>
    </div>}

    {tab==="withdrawals"&&<div className="adminContent">
      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>Withdrawals</h3><p>Review complete payout details before processing.</p></div></div>
        <div className="adminWithdrawalList">
          {withdrawals.length===0&&<div className="adminEmpty">No withdrawal requests found.</div>}
          {withdrawals.map(w=>{
            let details={}; try{details=typeof w.details==="string"?JSON.parse(w.details):w.details||{}}catch{}
            return <article className="adminWithdrawalCard" key={w.id}>
              <div><b>${Number(w.amount||0).toFixed(2)} · {w.method}</b><small>{w.username?`@${w.username}`:"Telegram user"} · {w.telegram_id}</small><small>Status: {w.status}</small>
                <div className="withdrawalDetails">{Object.entries(details).filter(([k])=>!["telegramId","method"].includes(k)).map(([k,v])=><span key={k}><b>{k}</b>: {String(v)}</span>)}</div>
              </div>
              {w.status==="pending"&&<div className="rowBtns"><button className="approveBtn" onClick={()=>pay(w.id,"approved")}>Approve</button><button className="dangerBtn" onClick={()=>pay(w.id,"rejected")}>Reject</button></div>}
            </article>
          })}
        </div>
      </div>
    </div>}

    {tab==="ads"&&<div className="adminContent">
      <div className="adminPanel">
        <div className="adminPanelHeader"><div><h3>Ads & sponsor center</h3><p>Configure the provider used by your sponsor/ad gate.</p></div></div>
        <div className="adSettingsGrid">
          <label><span>Provider</span><input placeholder="e.g. Monetag" value={adForm.provider} onChange={e=>setAdForm({...adForm,provider:e.target.value})}/></label>
          <label><span>Ad unit / placement ID</span><input value={adForm.unit_id} onChange={e=>setAdForm({...adForm,unit_id:e.target.value})}/></label>
          <label><span>Provider secret</span><input type="password" placeholder={ads?.secret_set?"Saved — enter a new one to replace it":"Provider secret"} value={adForm.provider_secret} onChange={e=>setAdForm({...adForm,provider_secret:e.target.value})}/></label>
          <label><span>Reward per ad</span><input type="number" step="0.01" value={adForm.reward_amount} onChange={e=>setAdForm({...adForm,reward_amount:e.target.value})}/></label>
          <label><span>Daily ad limit</span><input type="number" value={adForm.daily_limit} onChange={e=>setAdForm({...adForm,daily_limit:e.target.value})}/></label>
          <label><span>Cooldown seconds</span><input type="number" value={adForm.cooldown} onChange={e=>setAdForm({...adForm,cooldown:e.target.value})}/></label>
        </div>
        <label className="adminCheck"><input type="checkbox" checked={adForm.enabled} onChange={e=>setAdForm({...adForm,enabled:e.target.checked})}/><span><b>Ads enabled</b><small>Allow tasks with the sponsor gate to use this configuration.</small></span></label>
        <button className="primary adminPublish" onClick={saveAds}>Save ad settings</button>
      </div>
    </div>}



{selectedUser&&userProfile&&<div className="proofModal" onClick={()=>{setSelectedUser(null);setUserProfile(null)}}><div className="proofModalInner userProfileModal" onClick={e=>e.stopPropagation()}><div className="proofModalHeader"><div><h3>{userProfile.user.first_name||"Member"}</h3><p>@{userProfile.user.username||"telegram_user"} · {userProfile.user.telegram_id}</p></div><button onClick={()=>{setSelectedUser(null);setUserProfile(null)}}><X/></button></div><div className="profileStats"><div><Coins/><b>${Number(userProfile.user.balance||0).toFixed(2)}</b><span>Balance</span></div><div><CheckCircle2/><b>{userProfile.user.completed_count||0}</b><span>Completed</span></div><div><History/><b>{userProfile.activity?.length||0}</b><span>Activities</span></div></div><div className="profilePanel"><div className="panelTitle"><div><h3>30-day activity</h3><p>Every recorded account action.</p></div><TrendingUp/></div><div className="activityChart">{Array.from({length:30},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(29-i));const key=d.toISOString().slice(0,10);const n=Number(userProfile.chart?.find(x=>x.day===key)?.count||0);const max=Math.max(1,...(userProfile.chart||[]).map(x=>Number(x.count||0)));return <div className="chartBar" key={key}><div className="barTrack"><i style={{height:`${Math.max(4,n/max*100)}%`}}/></div><small>{i%5===0?d.getDate():""}</small></div>})}</div></div><div className="profilePanel"><div className="panelTitle"><div><h3>Activity & task history</h3><p>Recent actions, submissions and task decisions.</p></div><History/></div><div className="historyList">{(userProfile.activity||[]).map(a=><div className="historyRow" key={`a-${a.id}`}><span className="historyIcon"><History/></span><div><b>{a.kind}{a.title?` · ${a.title}`:""}</b><small>{new Date(a.created_at+"Z").toLocaleString()}</small></div><strong>{Number(a.amount||0)?`$${Number(a.amount).toFixed(2)}`:""}</strong></div>)}{(userProfile.history||[]).map(h=><div className="historyRow" key={`h-${h.id}`}><span className={`historyIcon ${h.status}`}>{h.status==="approved"?<CheckCircle2/>:<XCircle/>}</span><div><b>{h.title}</b><small>{h.status} · {new Date(h.created_at+"Z").toLocaleString()}</small></div><strong>${Number(h.reward||0).toFixed(2)}</strong></div>)}</div></div></div></div>}

{selectedSubmission&&<div className="proofModal" onClick={()=>setSelectedSubmission(null)}>
      <div className="proofModalInner" onClick={e=>e.stopPropagation()}>
        <div className="proofModalHeader"><div><h3>{selectedSubmission.title||"Task proof"}</h3><p>{selectedSubmission.first_name||"Telegram user"} {selectedSubmission.username?`· @${selectedSubmission.username}`:""}</p></div><button onClick={()=>setSelectedSubmission(null)}><X/></button></div>
        {selectedSubmission.note&&<div className="proofNote"><b>User note</b><p>{selectedSubmission.note}</p></div>}
        <div className="proofViewer">
          <div className={`proofFullImage ${proofZoom?"zoomed":""}`}><img src={proofUrl(selectedSubmission.id,selectedProofIndex,(selectedSubmission.proofTokens||[])[selectedProofIndex])} alt={`Proof ${selectedProofIndex+1}`} onError={e=>{e.currentTarget.style.display="none"}}/></div>
          <div className="proofViewerTools"><button onClick={()=>setProofZoom(v=>!v)}>{proofZoom?"Fit":"Zoom"}</button><button onClick={()=>setSelectedProofIndex(i=>Math.max(0,i-1))}>Previous</button><span>{selectedProofIndex+1} / {(selectedSubmission.screenshots||[]).length}</span><button onClick={()=>setSelectedProofIndex(i=>Math.min((selectedSubmission.screenshots||[]).length-1,i+1))}>Next</button></div>
          <div className="proofThumbs large">{(selectedSubmission.screenshots||[]).map((src,i)=><button className={i===selectedProofIndex?"selected":""} key={`${selectedSubmission.id}-${i}`} onClick={()=>{setSelectedProofIndex(i);setProofZoom(false)}}><img src={proofUrl(selectedSubmission.id,i,(selectedSubmission.proofTokens||[])[i])} alt={`Proof ${i+1}`} onError={e=>{e.currentTarget.style.visibility="hidden"}}/></button>)}</div>
        </div>
        {selectedSubmission.status==="pending"&&<div className="proofModalActions"><button className="approveBtn" onClick={()=>review(selectedSubmission.id,"approved")}>Approve</button><button className="dangerBtn" onClick={()=>review(selectedSubmission.id,"rejected")}>Reject</button></div>}
      </div>
    </div>}

  </section>
}
createRoot(document.getElementById("root")).render(<App/>);
