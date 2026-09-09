import React, {useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {Wallet, ListChecks, Users, UserCircle, ShieldCheck, Clock3, Upload, Gift, Landmark, Coins, Menu, X, Ban, MessageSquare, LogOut} from "lucide-react";
import "./styles.css";

const api = async (url, options={}) => {
  const initData=window.Telegram?.WebApp?.initData||"";
  const headers={
    "X-Telegram-Init-Data":initData,
    ...(options.headers||{})
  };
  if(!(options.body instanceof FormData) && !headers["Content-Type"]){
    headers["Content-Type"]="application/json";
  }
  const r=await fetch(url,{...options,headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
};

function tgUser(){
  const w=window.Telegram?.WebApp;
  console.log("INIT DATA:", w?.initData);
  console.log("TELEGRAM USER:", w?.initDataUnsafe?.user);
  return w?.initDataUnsafe?.user || {};
}

function App(){
  const [me,setMe]=useState(null), [tasks,setTasks]=useState([]), [tab,setTab]=useState("home");
  const [selected,setSelected]=useState(null), [running,setRunning]=useState(null), [toast,setToast]=useState("");
  const [admin,setAdmin]=useState(false);
  const [profile,setProfile]=useState(null);

  const load=async()=>{
    try{
      const user=tgUser(); if(!user.id) throw new Error("Telegram user data is missing. Close and reopen HillsByte from the bot.");
      const d=await api(`/api/bootstrap?telegramId=${encodeURIComponent(user.id)}&username=${encodeURIComponent(user.username||"")}&firstName=${encodeURIComponent(user.first_name||"")}&referralCode=${encodeURIComponent(window.Telegram?.WebApp?.initDataUnsafe?.start_param||"")}`);
      setMe(d.user); setTasks(d.tasks); setAdmin(d.admin); setProfile(d.user);
    }catch(e){alert(e.message.includes("Join Hillsbyte channel")?"Join the HillsByte channel first, then reopen the app.":e.message)}
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

  if(!me) return <div className="splash"><div className="logoMark">H</div><h1>HILLSBYTE</h1><p>Join the HillsByte channel to continue.</p><button className="primary" onClick={()=>window.Telegram?.WebApp?.openTelegramLink("https://t.me/hillsbyteOG")}>Join Channel</button><button onClick={()=>load()}>Verify</button></div>;

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
    files.slice(0,3).forEach(f=>fd.append("screenshots",f));
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
        <label className="uploadBox"><Upload/><span>Add 1–3 screenshots</span><input type="file" accept="image/*" multiple onChange={e=>setFiles([...e.target.files].slice(0,3))}/></label>
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

function ReferralPage({me}){return <section><div className="refHero"><Users size={34}/><h2>Invite & Earn</h2><p>When a referral completes 5 approved tasks, you earn 10% of their future earnings.</p><div className="code">{me.referral_code}</div><button onClick={()=>navigator.clipboard?.writeText(`https://t.me/${window.BOT_USERNAME || "BytesMK7_bot"}?start=ref_${me.referral_code}`)}>Copy invite</button></div><div className="info"><Gift/><div><b>20 HC Coins</b><p>You receive 20 HillsCoin when your referral completes a qualifying task.</p></div></div></section>}

function ProfilePage({me,reload,setToast}){
  const [language,setLanguage]=useState(me.language||"English");
  const [email,setEmail]=useState(me.email||"");
  const [saving,setSaving]=useState(false);
  const [code,setCode]=useState("");

  const saveProfile=async()=>{
    try{
      setSaving(true);
      await api("/api/profile",{
        method:"POST",
        body:JSON.stringify({
          telegramId:String(tgUser().id),
          language,
          email
        })
      });
      setToast("Profile updated.");
      reload();
    }catch(e){setToast(e.message)}
    finally{setSaving(false)}
  };

  const redeem=async()=>{
    try{
      const d=await api("/api/promo/redeem",{
        method:"POST",
        body:JSON.stringify({telegramId:String(tgUser().id),code})
      });
      setToast(d.message);
      setCode("");
      reload();
    }catch(e){setToast(e.message)}
  };

  return <section className="profilePage">

    <div className="profileCard profileHero">
      <div className="avatar">{(me.first_name||"H")[0].toUpperCase()}</div>
      <div className="profileIdentity">
        <h2>{me.first_name||"Member"}</h2>
        <p>@{me.username||"telegram_user"}</p>
        <span className={`status ${me.status}`}>{me.status}</span>
      </div>
    </div>

    <div className="settingsPanel">
      <div className="settingsTitle">
        <div>
          <h3>Account settings</h3>
          <p>Keep your HillsByte profile up to date.</p>
        </div>
        <UserCircle size={22}/>
      </div>

      <div className="settingRow">
        <div className="settingIcon">A</div>
        <div className="settingInfo">
          <b>Language</b>
          <small>Choose the language used in your account.</small>
        </div>
        <select value={language} onChange={e=>setLanguage(e.target.value)}>
          {["English","Nigerian Pidgin","French","Spanish","Portuguese","Arabic","German","Italian","Turkish","Hindi"].map(x=><option key={x}>{x}</option>)}
        </select>
      </div>

      <div className="settingRow settingStack">
        <div className="settingIcon">@</div>
        <div className="settingInfo">
          <b>Connect email</b>
          <small>{email ? "Email saved to your HillsByte profile." : "Add an email for account contact and future account features."}</small>
        </div>
        <input
          className="settingInput"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e=>setEmail(e.target.value)}
        />
      </div>

      <button className="primary settingsSave" onClick={saveProfile} disabled={saving}>
        {saving ? "Saving..." : "Save changes"}
      </button>
    </div>

    <div className="panel">
      <h3>Promo code</h3>
      <p>Redeem a gift code created by the HillsByte admin.</p>
      <div className="inline">
        <input placeholder="ENTER CODE" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/>
        <button onClick={redeem}>Redeem</button>
      </div>
    </div>

  </section>
}

function AdminPage({setToast}){
  const [tab,setTab]=useState("overview");
  const [tasks,setTasks]=useState([]);
  const [users,setUsers]=useState([]);
  const [withdrawals,setWithdrawals]=useState([]);
  const [submissions,setSubmissions]=useState([]);
  const [ads,setAds]=useState(null);
  const [loading,setLoading]=useState(false);
  const [editing,setEditing]=useState(null);
  const [selectedSubmission,setSelectedSubmission]=useState(null);

  const emptyForm={
    title:"",
    short_description:"",
    description:"",
    url:"",
    reward:"1",
    max_slots:"1000",
    daily_slots:"500",
    timer_seconds:"120",
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

  const load=async()=>{
    try{
      setLoading(true);
      const [td,ud,wd,sd,ad]=await Promise.all([
        api("/api/admin/tasks"),
        api("/api/admin/users"),
        api("/api/admin/withdrawals"),
        api("/api/admin/submissions"),
        api("/api/admin/ads")
      ]);
      setTasks(td.tasks||[]);
      setUsers(ud.users||[]);
      setWithdrawals(wd.withdrawals||[]);
      setSubmissions(sd.submissions||[]);
      setAds(ad.ads||null);
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
        timer_seconds:Math.max(10,Number(form.timer_seconds))
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
    ["ads","Ads"]
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

        <div className="adminTaskBoard">
          {tasks.length===0&&<div className="adminEmpty">No tasks have been created yet.</div>}
          {tasks.map(t=>{
            const pct=Math.min(100,Math.round((Number(t.total_completed||0)/Math.max(1,Number(t.max_slots||1)))*100));
            return <article className="adminTaskCard" key={t.id}>
              <div className="adminTaskMain">
                <div className="adminTaskIcon">
                  {t.logo_url?<img src={t.logo_url} alt=""/>:<ListChecks size={22}/>}
                </div>
                <div className="adminTaskInfo">
                  <div className="adminTaskTitle">{t.title}</div>
                  <div className="adminTaskMeta"><span>${Number(t.reward).toFixed(2)}</span><span>{t.total_completed}/{t.max_slots} total</span><span>{t.daily_slots}/day</span><span>{t.timer_seconds}s</span></div>
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
        <div className="adminPanelHeader"><div><h3>Proof review</h3><p>Open the user's uploaded screenshots before approving.</p></div></div>
        <div className="adminSubmissionList">
          {submissions.length===0&&<div className="adminEmpty">No submissions found.</div>}
          {submissions.map(s=><article className="adminSubmissionCard" key={s.id}>
            <div className="submissionIdentity">
              <div className="adminUserAvatar">{(s.first_name||s.username||"U").charAt(0).toUpperCase()}</div>
              <div><b>{s.title||"Task submission"}</b><small>{s.first_name||"Telegram user"} {s.username?`· @${s.username}`:""}</small><small>Reward ${Number(s.reward||0).toFixed(2)} · {s.status}</small></div>
            </div>
            <div className="proofThumbs">
              {(s.screenshots||[]).slice(0,3).map((src,i)=><button key={src} onClick={()=>setSelectedSubmission({...s,focus:i})}><img src={src} alt={`Proof ${i+1}`}/></button>)}
              {(!s.screenshots||s.screenshots.length===0)&&<span>No screenshots</span>}
            </div>
            <div className="submissionActions">
              <button onClick={()=>setSelectedSubmission(s)}>View proof</button>
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
            <div className="adminUserInfo"><b>{u.first_name||"Telegram member"}</b><small>{u.username?`@${u.username}`:"No username"} · ID {u.telegram_id}</small><small>${Number(u.balance||0).toFixed(2)} balance · {u.status}</small></div>
            <div className="adminUserActions"><button onClick={()=>messageUser(u.id)}>Message</button><button onClick={()=>act(u.id,u.status==="banned"?"unban":"ban")}>{u.status==="banned"?"Unban":"Ban"}</button></div>
          </article>)}
        </div>
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

    {selectedSubmission&&<div className="proofModal" onClick={()=>setSelectedSubmission(null)}>
      <div className="proofModalInner" onClick={e=>e.stopPropagation()}>
        <div className="proofModalHeader"><div><h3>{selectedSubmission.title||"Task proof"}</h3><p>{selectedSubmission.first_name||"Telegram user"} {selectedSubmission.username?`· @${selectedSubmission.username}`:""}</p></div><button onClick={()=>setSelectedSubmission(null)}><X/></button></div>
        {selectedSubmission.note&&<div className="proofNote"><b>User note</b><p>{selectedSubmission.note}</p></div>}
        <div className="proofGallery">
          {(selectedSubmission.screenshots||[]).map((src,i)=><a href={src} target="_blank" rel="noreferrer" key={src}><img src={src} alt={`Proof ${i+1}`}/><span>Open proof {i+1}</span></a>)}
        </div>
        {selectedSubmission.status==="pending"&&<div className="proofModalActions"><button className="approveBtn" onClick={()=>review(selectedSubmission.id,"approved")}>Approve</button><button className="dangerBtn" onClick={()=>review(selectedSubmission.id,"rejected")}>Reject</button></div>}
      </div>
    </div>}

  </section>
}
createRoot(document.getElementById("root")).render(<App/>);
