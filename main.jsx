import React, {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {Wallet, ListChecks, Users, UserCircle, ShieldCheck, Clock3, Upload, Gift, Landmark, Coins, Menu, X, Ban, MessageSquare, LogOut} from "lucide-react";
import "./styles.css";

const api = async (url, options={}) => {
  const initData=window.Telegram?.WebApp?.initData||""; const r = await fetch(url, {headers: {"Content-Type":"application/json","X-Telegram-Init-Data":initData, ...(options.headers||{})}, ...options});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || "Request failed");
  return data;
};

function tgUser(){
  const w = window.Telegram?.WebApp;
  return w?.initDataUnsafe?.user;
}

function App(){
  const [me,setMe]=useState(null), [tasks,setTasks]=useState([]), [tab,setTab]=useState("home");
  const [selected,setSelected]=useState(null), [running,setRunning]=useState(null), [toast,setToast]=useState("");
  const [admin,setAdmin]=useState(false);
  const [profile,setProfile]=useState(null);

  const load=async()=>{
    try{
      const user=tgUser();
      const d=await api(`/api/bootstrap?telegramId=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username||"")}&firstName=${encodeURIComponent(user.first_name||"")}`);
      setMe(d.user); setTasks(d.tasks); setAdmin(d.admin); setProfile(d.user);
    }catch(e){setToast(e.message)}
  };
  useEffect(()=>{ window.Telegram?.WebApp?.ready(); window.Telegram?.WebApp?.expand(); load(); },[]);
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(""),3000); return()=>clearTimeout(t)},[toast]);

  const startTask=async(task)=>{
    try{
      // The server enforces the daily slot cap. The UI presents the configured ad/sponsor gate.
      const d=await api(`/api/tasks/${task.id}/start`,{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id)})});
      setRunning(d.attempt); setSelected(task);
      setTab("task");
    }catch(e){setToast(e.message)}
  };

  const nav=[
    ["home","Home",ListChecks],["wallet","Wallet",Wallet],["referrals","Referrals",Users],["profile","Profile",UserCircle]
  ];

  if(!me) return <div className="splash"><div className="logoMark">H</div><h1>HILLSBYTE</h1><p>Loading your workspace…</p></div>;

  return <div className="appShell">
    <header className="topbar"><div><div className="brand">HILLS<span>BYTE</span></div><small>Earn. Complete. Grow.</small></div><div className="balance">${Number(me.balance||0).toFixed(2)}</div></header>

    <main>
      {tab==="home" && <Home me={me} tasks={tasks} onStart={startTask} />}
      {tab==="task" && <TaskRunner task={selected} attempt={running} onDone={()=>{setRunning(null);setSelected(null);setTab("home");load();}} setToast={setToast}/>}
      {tab==="wallet" && <WalletPage me={me} reload={load} setToast={setToast}/>}
      {tab==="referrals" && <ReferralPage me={me}/>}
      {tab==="profile" && <ProfilePage me={me} reload={load} setToast={setToast}/>}
      {tab==="admin" && admin && <AdminPage setToast={setToast}/>}
    </main>

    <nav className="bottomNav">
      {nav.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={19}/><span>{label}</span></button>)}
      {admin && <button className={tab==="admin"?"active":""} onClick={()=>setTab("admin")}><ShieldCheck size={19}/><span>Admin</span></button>}
    </nav>
    {toast && <div className="toast">{toast}</div>}
  </div>
}

function Home({me,tasks,onStart}){
  return <section>
    <div className="heroCard">
      <div><p className="eyebrow">AVAILABLE BALANCE</p><h2>${Number(me.balance||0).toFixed(2)}</h2><p className="muted">Pending ${Number(me.pending_balance||0).toFixed(2)}</p></div>
      <div className="coin"><Coins/></div>
    </div>
    <div className="stats"><div><b>{me.completed_count||0}</b><span>Completed</span></div><div><b>{me.referral_count||0}</b><span>Referrals</span></div><div><b>{me.hillscoin||0}</b><span>HC Coins</span></div></div>
    <div className="sectionHead"><h3>Task Marketplace</h3><span>{tasks.length} live</span></div>
    {tasks.length===0 && <div className="empty">No tasks are open right now. Check back tomorrow.</div>}
    <div className="taskList">{tasks.map(t=><TaskCard key={t.id} task={t} onStart={()=>onStart(t)}/>)}</div>
  </section>
}

function TaskCard({task,onStart}){
  const pct=Math.min(100,Math.round((task.total_completed/task.max_slots)*100));
  return <article className="taskCard">
    <div className="taskTop"><div className="taskLogo">{task.logo_url?<img src={task.logo_url}/>:<ListChecks size={22}/>}</div><div className="taskMeta"><h4>{task.title}</h4><p>{task.short_description||task.description}</p></div><strong>${Number(task.reward).toFixed(2)}</strong></div>
    <div className="progress"><i style={{width:`${pct}%`}}/></div>
    <div className="taskFoot"><span>{Math.max(0,task.max_slots-task.total_completed)} slots left</span><span><Clock3 size={14}/> {task.timer_seconds}s</span><button onClick={onStart}>Start</button></div>
  </article>
}

function TaskRunner({task,attempt,onDone,setToast}){
  const [left,setLeft]=useState(()=>Math.max(0,Math.floor((attempt.expires_at-Date.now())/1000)));
  const [files,setFiles]=useState([]);
  const [note,setNote]=useState("");
  const [gate,setGate]=useState(true);
  useEffect(()=>{const i=setInterval(()=>setLeft(Math.max(0,Math.floor((attempt.expires_at-Date.now())/1000))),1000);return()=>clearInterval(i)},[attempt]);
  const submit=async()=>{
    if(left<=0)return setToast("Timer expired. This attempt can no longer be submitted.");
    if(!files.length)return setToast("Upload at least one screenshot.");
    const fd=new FormData(); fd.append("telegramId",String(tgUser().id)); fd.append("attemptId",attempt.id); fd.append("note",note);
    files.slice(0,4).forEach(f=>fd.append("screenshots",f));
    try{
      const r=await fetch("/api/submissions",{method:"POST",body:fd}); const d=await r.json(); if(!r.ok)throw new Error(d.error);
      setToast("Submitted for review."); onDone();
    }catch(e){setToast(e.message)}
  };
  return <section>
    <button className="back" onClick={onDone}>← Back to tasks</button>
    <div className="runner">
      <div className="runnerHead">{task.logo_url&&<img src={task.logo_url}/>}<div><h2>{task.title}</h2><p>${Number(task.reward).toFixed(2)} reward</p></div><div className="timer">{left}s</div></div>
      {task.image_url&&<img className="taskImage" src={task.image_url}/>}
      {gate ? <div className="adGate"><ShieldCheck size={30}/><h3>Start gate</h3><p>{task.ad_enabled?"Complete the sponsor/ad gate configured by the administrator, then continue.":"Review the task instructions before continuing."}</p><button onClick={()=>setGate(false)}>{task.ad_enabled?"Continue after gate":"Start task"}</button></div> :
      <>
        <div className="instructions"><h3>Instructions</h3><p>{task.description}</p>{task.url&&<a href={task.url} target="_blank" rel="noreferrer">Open task ↗</a>}</div>
        <label className="uploadBox"><Upload/><span>Add up to 4 screenshots</span><input type="file" accept="image/*" multiple onChange={e=>setFiles([...e.target.files].slice(0,4))}/></label>
        <div className="fileChips">{files.map(f=><span key={f.name}>{f.name}</span>)}</div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note for the reviewer"/>
        <button className="primary" onClick={submit}>Submit for review</button>
      </>}
    </div>
  </section>
}

function WalletPage({me,reload,setToast}){
  const [method,setMethod]=useState("bank"), [form,setForm]=useState({accountName:"",accountNumber:"",bankName:"",network:"BEP20",address:"",memo:""});
  const withdraw=async()=>{try{await api("/api/withdrawals",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id),method,...form})});setToast("Withdrawal request submitted.");reload()}catch(e){setToast(e.message)}};
  return <section><div className="sectionHead"><h2>Wallet</h2><span>Minimum $1.00</span></div>
    <div className="walletHero"><span>Available</span><b>${Number(me.balance).toFixed(2)}</b></div>
    <div className="methodGrid">{[["bank","Bank account",Landmark],["crypto","USDT wallet",Wallet]].map(([id,l,I])=><button className={method===id?"selected":""} onClick={()=>setMethod(id)} key={id}><I/><span>{l}</span></button>)}</div>
    {method==="bank"?<div className="formGrid"><input placeholder="Account holder full name" value={form.accountName} onChange={e=>setForm({...form,accountName:e.target.value})}/><input placeholder="Account number" value={form.accountNumber} onChange={e=>setForm({...form,accountNumber:e.target.value})}/><input placeholder="Bank name" value={form.bankName} onChange={e=>setForm({...form,bankName:e.target.value})}/></div>:
    <div className="formGrid"><select value={form.network} onChange={e=>setForm({...form,network:e.target.value})}><option>BEP20</option><option>TRC20</option><option>TON</option></select><input placeholder="USDT wallet address" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/><input placeholder="Memo / tag (optional)" value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})}/></div>}
    <button className="primary" onClick={withdraw}>Request ${Number(me.balance).toFixed(2)} payout</button>
  </section>
}

function ReferralPage({me}){return <section><div className="refHero"><Users size={34}/><h2>Invite & Earn</h2><p>When a referral completes 5 approved tasks, you earn 10% of their future earnings.</p><div className="code">{me.referral_code}</div><button onClick={()=>navigator.clipboard?.writeText(`https://t.me/${window.BOT_USERNAME||"CPAbyte_bot"}?start=ref_${me.referral_code}`)}>Copy invite</button></div><div className="info"><Gift/><div><b>20 HC Coins</b><p>You receive 20 HillsCoin when your referral completes a qualifying task.</p></div></div></section>}

function ProfilePage({me,reload,setToast}){
  const [code,setCode]=useState("");
  const redeem=async()=>{try{const d=await api("/api/promo/redeem",{method:"POST",body:JSON.stringify({telegramId:String(tgUser().id),code})});setToast(d.message);reload()}catch(e){setToast(e.message)}};
  return <section><div className="profileCard"><div className="avatar">{(me.first_name||"H")[0]}</div><h2>{me.first_name||"Member"}</h2><p>@{me.username||"telegram_user"}</p><span className={`status ${me.status}`}>{me.status}</span></div>
    <div className="panel"><h3>Promo code</h3><p>Redeem a gift code created by the admin.</p><div className="inline"><input placeholder="ENTER CODE" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/><button onClick={redeem}>Redeem</button></div></div>
  </section>
}

function AdminPage({setToast}){
  const [tab,setTab]=useState("tasks"), [tasks,setTasks]=useState([]), [users,setUsers]=useState([]), [withdrawals,setWithdrawals]=useState([]), [submissions,setSubmissions]=useState([]);
  const [form,setForm]=useState({title:"",description:"",url:"",reward:"1",max_slots:"1000",daily_slots:"200",timer_seconds:"120",logo_url:"",image_url:"",ad_enabled:true});
  const load=async()=>{setTasks((await api("/api/admin/tasks")).tasks);setUsers((await api("/api/admin/users")).users);setWithdrawals((await api("/api/admin/withdrawals")).withdrawals);setSubmissions((await api("/api/admin/submissions")).submissions)};
  useEffect(()=>{load()},[]);
  const create=async()=>{try{await api("/api/admin/tasks",{method:"POST",body:JSON.stringify({...form,reward:Number(form.reward),max_slots:Number(form.max_slots),daily_slots:Number(form.daily_slots),timer_seconds:Number(form.timer_seconds)})});setToast("Task created.");load()}catch(e){setToast(e.message)}};
  const act=async(id,action)=>{try{await api(`/api/admin/users/${id}/${action}`,{method:"POST"});load();setToast("User updated.")}catch(e){setToast(e.message)}};
  const pay=async(id,status)=>{try{await api(`/api/admin/withdrawals/${id}`,{method:"POST",body:JSON.stringify({status})});load();setToast("Withdrawal updated.")}catch(e){setToast(e.message)}};
  return <section><div className="adminTabs">{["tasks","submissions","users","withdrawals"].map(x=><button className={tab===x?"selected":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>
    {tab==="tasks"&&<><div className="panel"><h3>Create task</h3><div className="formGrid">{["title","description","url","reward","max_slots","daily_slots","timer_seconds","logo_url","image_url"].map(k=><input key={k} placeholder={k.replaceAll("_"," ")} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}<label className="check"><input type="checkbox" checked={form.ad_enabled} onChange={e=>setForm({...form,ad_enabled:e.target.checked})}/> Sponsor/ad gate enabled</label></div><button className="primary" onClick={create}>Publish task</button></div><div className="adminList">{tasks.map(t=><div className="adminRow" key={t.id}><div><b>{t.title}</b><small>{t.total_completed}/{t.max_slots} total · {t.daily_slots}/day</small></div><span>${t.reward}</span></div>)}</div></>}
    {tab==="submissions"&&<div className="adminList">{submissions.map(s=><div className="adminRow" key={s.id}><div><b>{s.title}</b><small>User: {s.first_name||s.username||"Telegram"} · ID: {s.user_id} · @{s.username||""}</small><small>Reward ${s.reward} · Submitted {s.created_at}</small></div><div className="rowBtns"><button onClick={async()=>{await api(`/api/admin/submissions/${s.id}`,{method:"POST",body:JSON.stringify({status:"approved"})});load();setToast("Submission approved.")}}>Approve</button><button onClick={async()=>{await api(`/api/admin/submissions/${s.id}`,{method:"POST",body:JSON.stringify({status:"rejected"})});load();setToast("Submission rejected.")}}>Reject</button></div></div>)}</div>}
    {tab==="users"&&<div className="adminList">{users.map(u=><div className="adminRow" key={u.id}><div><b>{u.first_name||u.username||u.telegram_id}</b><small>{u.status} · ${Number(u.balance).toFixed(2)}</small></div><div className="rowBtns"><button onClick={()=>act(u.id,u.status==="banned"?"unban":"ban")}><Ban size={15}/></button><button onClick={()=>act(u.id,"message")}><MessageSquare size={15}/></button></div></div>)}</div>}
    {tab==="withdrawals"&&<div className="adminList">{withdrawals.map(w=><div className="adminRow" key={w.id}><div><b>${w.amount} · {w.method}</b><small>{w.username||w.telegram_id} · {w.status}</small></div><div className="rowBtns"><button onClick={()=>pay(w.id,"approved")}>Pay</button><button onClick={()=>pay(w.id,"rejected")}>Reject</button></div></div>)}</div>}
  </section>
}

createRoot(document.getElementById("root")).render(<App/>);
