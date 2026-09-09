import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import Database from "better-sqlite3";
import multer from "multer";
import {fileURLToPath} from "url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const ROOT=__dirname;
const PORT=process.env.PORT||10000;
const ADMIN_IDS=(process.env.ADMIN_TELEGRAM_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
const BOT_TOKEN=process.env.BOT_TOKEN||"";
const CHANNEL_USERNAME=process.env.CHANNEL_USERNAME||"";

const DB_PATH=process.env.DB_PATH||path.join(ROOT,"data","hillsbyte.db");
fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});

const db=new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 telegram_id TEXT UNIQUE NOT NULL, username TEXT, first_name TEXT,
 status TEXT DEFAULT 'active', balance REAL DEFAULT 0, pending_balance REAL DEFAULT 0,
 hillscoin INTEGER DEFAULT 0, referral_code TEXT UNIQUE, referred_by TEXT,
 referral_unlocked INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks(
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, short_description TEXT,
 description TEXT NOT NULL, url TEXT, reward REAL NOT NULL, max_slots INTEGER DEFAULT 1000,
 daily_slots INTEGER DEFAULT 200, timer_seconds INTEGER DEFAULT 120, total_completed INTEGER DEFAULT 0,
 active INTEGER DEFAULT 1, logo_url TEXT, image_url TEXT, ad_enabled INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS daily_slots(task_id INTEGER, day TEXT, count INTEGER DEFAULT 0, PRIMARY KEY(task_id,day));
CREATE TABLE IF NOT EXISTS attempts(
 id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, user_id INTEGER, started_at INTEGER, expires_at INTEGER,
 status TEXT DEFAULT 'started', UNIQUE(task_id,user_id)
);
CREATE TABLE IF NOT EXISTS submissions(
 id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER UNIQUE, user_id INTEGER, task_id INTEGER,
 note TEXT, status TEXT DEFAULT 'pending', screenshots TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wallets(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,method TEXT,account_name TEXT,account_number TEXT,bank_name TEXT,
 network TEXT,address TEXT,memo TEXT
);
CREATE TABLE IF NOT EXISTS withdrawals(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount REAL,method TEXT,details TEXT,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS promos(
 id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT UNIQUE,amount REAL,coin_amount INTEGER DEFAULT 0,max_uses INTEGER DEFAULT 1,uses INTEGER DEFAULT 0,active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS promo_redemptions(user_id INTEGER,promo_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,promo_id));
`);
for(const statement of [
  "ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'English'"
]){
  try{db.exec(statement)}catch(e){if(!String(e.message).includes("duplicate column name")) throw e;}
}
db.exec(`
CREATE TABLE IF NOT EXISTS ad_settings(
 id INTEGER PRIMARY KEY CHECK(id=1),
 provider TEXT DEFAULT '',
 unit_id TEXT DEFAULT '',
 provider_secret TEXT DEFAULT '',
 reward_amount REAL DEFAULT 0,
 daily_limit INTEGER DEFAULT 5,
 cooldown INTEGER DEFAULT 30,
 enabled INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO ad_settings(id) VALUES(1);
`);

const app=express();
app.use(express.json({limit:"2mb"}));
app.use("/uploads",express.static(path.join(ROOT,"uploads")));
app.use(express.static(path.join(ROOT,"dist")));

const UPLOAD_DIR=path.join(ROOT,"uploads");
fs.mkdirSync(UPLOAD_DIR,{recursive:true});
const upload=multer({
  storage:multer.diskStorage({
    destination:(_req,_file,cb)=>cb(null,UPLOAD_DIR),
    filename:(_req,file,cb)=>{
      const ext=path.extname(file.originalname||"").toLowerCase();
      cb(null,`${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
    }
  }),
  fileFilter:(_req,file,cb)=>{
    const ok=["image/jpeg","image/png","image/webp"].includes(file.mimetype);
    cb(ok?null:new Error("Only JPG, PNG or WEBP images are allowed."),ok);
  },
  limits:{files:3,fileSize:5*1024*1024}
});

function day(){return new Date().toISOString().slice(0,10)}
function ref(){return crypto.randomBytes(4).toString("hex").toUpperCase()}
function getUser(tid,username,firstName,referralCode){
 let u=db.prepare("SELECT * FROM users WHERE telegram_id=?").get(String(tid));
if(!u){
 const referredBy=referralCode?.replace(/^ref_/,"")||null;
 const code=ref();
   const validReferrer=referredBy&&db.prepare("SELECT id FROM users WHERE referral_code=?").get(referredBy);
   db.prepare("INSERT INTO users(telegram_id,username,first_name,referral_code,referred_by) VALUES(?,?,?,?,?)").run(String(tid),username||"",firstName||"",code,validReferrer?referredBy:null);
   u=db.prepare("SELECT * FROM users WHERE telegram_id=?").get(String(tid));
}
 if(username!==undefined || firstName!==undefined) db.prepare("UPDATE users SET username=COALESCE(?,username),first_name=COALESCE(?,first_name) WHERE id=?").run(username||null,firstName||null,u.id);
 return db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
}
function isAdmin(tid){return ADMIN_IDS.includes(String(tid))}
function verifyTelegramInitData(initData){
  if(!BOT_TOKEN || !initData) return false;
  const params=new URLSearchParams(initData);
  const hash=params.get("hash"); if(!hash)return false;
  params.delete("hash");
  const dataCheck=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
  const secret=crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
  const calc=crypto.createHmac("sha256",secret).update(dataCheck).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(calc),Buffer.from(hash));
}
async function telegramMemberStatus(tid){
  if(!BOT_TOKEN || !CHANNEL_USERNAME) return true;
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_USERNAME)}&user_id=${encodeURIComponent(tid)}`);
  const d=await r.json();
  if(!d.ok) return false;
  return ["member","administrator","creator"].includes(d.result?.status);
}
function requireActive(u){if(!u)throw new Error("User not found");if(u.status==="banned")throw new Error("Your account is banned.");if(u.status==="suspended")throw new Error("Your account is suspended.");}
function publicUser(u){return {...u,completed_count:db.prepare("SELECT count(*) c FROM submissions WHERE user_id=? AND status='approved'").get(u.id).c,referral_count:db.prepare("SELECT count(*) c FROM users WHERE referred_by=?").get(u.referral_code).c}}

app.get("/api/bootstrap",async(req,res)=>{
 try{
  const initData=req.headers["x-telegram-init-data"]||"";
  const tid=String(req.query.telegramId||"");
  if(tid!=="demo-user" && BOT_TOKEN){
    if(!verifyTelegramInitData(initData)) return res.status(401).json({error:"Invalid Telegram session. Open HillsByte from Telegram."});
  }
  if(tid!=="demo-user" && BOT_TOKEN && CHANNEL_USERNAME){
    const joined=await telegramMemberStatus(tid);
    if(!joined) return res.status(403).json({error:`Join ${CHANNEL_USERNAME} on Telegram before using HillsByte.`,requiresChannel:true,channel:CHANNEL_USERNAME});
  }
  const u=getUser(tid,req.query.username,req.query.firstName,req.query.referralCode); requireActive(u);
  const tasks=db.prepare("SELECT * FROM tasks WHERE active=1 AND total_completed<max_slots ORDER BY id DESC").all().map(t=>{
    const s=db.prepare("SELECT count FROM daily_slots WHERE task_id=? AND day=?").get(t.id,day());
    return {...t,daily_completed:s?.count||0,remaining_daily:Math.max(0,t.daily_slots-(s?.count||0))};
  }).filter(t=>t.remaining_daily>0);
  res.json({user:publicUser(u),tasks,admin:isAdmin(tid),channel:CHANNEL_USERNAME});
 }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/tasks/:id/start",(req,res)=>{
 try{
  const u=getUser(req.body.telegramId); requireActive(u);
  const t=db.prepare("SELECT * FROM tasks WHERE id=? AND active=1").get(req.params.id);
  if(!t)throw new Error("Task unavailable.");
  if(db.prepare("SELECT 1 FROM submissions WHERE user_id=? AND task_id=?").get(u.id,t.id))throw new Error("You have already submitted this task.");
  const s=db.prepare("SELECT count FROM daily_slots WHERE task_id=? AND day=?").get(t.id,day());
  if((s?.count||0)>=t.daily_slots)throw new Error("Today's slots are full. Try again tomorrow.");
  if(t.total_completed>=t.max_slots)throw new Error("All task slots have been completed.");
  const now=Date.now(), expires=now+t.timer_seconds*1000;
  const info=db.prepare("INSERT INTO attempts(task_id,user_id,started_at,expires_at) VALUES(?,?,?,?)").run(t.id,u.id,now,expires);
  db.prepare("INSERT INTO daily_slots(task_id,day,count) VALUES(?,?,1) ON CONFLICT(task_id,day) DO UPDATE SET count=count+1").run(t.id,day());
  res.json({attempt:{id:info.lastInsertRowid,expires_at:expires}});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/submissions",upload.array("screenshots",3),(req,res)=>{
 try{
  const u=getUser(req.body.telegramId);requireActive(u);
  const a=db.prepare("SELECT * FROM attempts WHERE id=? AND user_id=?").get(req.body.attemptId,u.id);
  if(!a||a.status!=="started")throw new Error("Invalid or already submitted attempt.");
  if(Date.now()>a.expires_at){db.prepare("UPDATE attempts SET status='expired' WHERE id=?").run(a.id);throw new Error("Timer expired.");}
  const exists=db.prepare("SELECT 1 FROM submissions WHERE user_id=? AND task_id=?").get(u.id,a.task_id);
  if(exists)throw new Error("You have already submitted this task.");
  const shots=(req.files||[]).map(f=>"/uploads/"+path.basename(f.path));
  db.prepare("INSERT INTO submissions(attempt_id,user_id,task_id,note,screenshots) VALUES(?,?,?,?,?)").run(a.id,u.id,a.task_id,req.body.note||"",JSON.stringify(shots));
  db.prepare("UPDATE attempts SET status='submitted' WHERE id=?").run(a.id);
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/withdrawals",(req,res)=>{
 try{
  const u=getUser(req.body.telegramId);requireActive(u);
  if(Number(u.balance)<1)throw new Error("Minimum withdrawal is $1.00.");
  const method=req.body.method==="crypto"?"USDT":"Bank";
  const details={...req.body};delete details.telegramId;delete details.method;
  db.prepare("INSERT INTO withdrawals(user_id,amount,method,details) VALUES(?,?,?,?)").run(u.id,u.balance,method,JSON.stringify(details));
  db.prepare("UPDATE users SET balance=0,pending_balance=pending_balance+? WHERE id=?").run(u.balance,u.id);
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/profile",(req,res)=>{
 try{
  const u=getUser(req.body.telegramId);requireActive(u);
  const language=String(req.body.language||"English").slice(0,50);
  const email=String(req.body.email||"").trim().slice(0,160);
  if(email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  db.prepare("UPDATE users SET language=?,email=? WHERE id=?").run(language,email,u.id);
  res.json({user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(u.id))});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/promo/redeem",(req,res)=>{
 try{
  const u=getUser(req.body.telegramId);requireActive(u);
  const p=db.prepare("SELECT * FROM promos WHERE code=? AND active=1").get(String(req.body.code||"").toUpperCase());
  if(!p||p.uses>=p.max_uses)throw new Error("Invalid or exhausted promo code.");
  if(db.prepare("SELECT 1 FROM promo_redemptions WHERE user_id=? AND promo_id=?").get(u.id,p.id))throw new Error("You already redeemed this code.");
  db.prepare("INSERT INTO promo_redemptions(user_id,promo_id) VALUES(?,?)").run(u.id,p.id);
  db.prepare("UPDATE promos SET uses=uses+1 WHERE id=?").run(p.id);
  db.prepare("UPDATE users SET balance=balance+?,hillscoin=hillscoin+? WHERE id=?").run(p.amount,p.coin_amount,u.id);
  res.json({message:`Gift applied: $${p.amount.toFixed(2)} + ${p.coin_amount} HC.`});
 }catch(e){res.status(400).json({error:e.message})}
});

function admin(req,res,next){
  const initData=req.headers["x-telegram-init-data"]||"";
  if(BOT_TOKEN && !verifyTelegramInitData(initData)){
    return res.status(403).json({error:"Invalid admin session"});
  }
  const params=new URLSearchParams(initData);
  let tid="";
  try{
    const userJson=params.get("user");
    tid=userJson?String(JSON.parse(userJson).id):"";
  }catch{}
  if(!tid || !isAdmin(tid)) return res.status(403).json({error:"Admin only"});
  req.adminTelegramId=tid;
  next();
}
app.get("/api/admin/tasks",admin,(req,res)=>{
  res.json({tasks:db.prepare("SELECT * FROM tasks ORDER BY id DESC").all()});
});

app.post("/api/admin/tasks",admin,(req,res)=>{
 try{
  const b=req.body||{};
  if(!String(b.title||"").trim()||!String(b.description||"").trim()) throw new Error("Task title and description are required.");
  const max=Math.min(1000,Math.max(1,Number(b.max_slots||1000)));
  const daily=Math.min(200,Math.max(1,Number(b.daily_slots||200)));
  const timer=Math.max(10,Number(b.timer_seconds||120));
  const info=db.prepare("INSERT INTO tasks(title,short_description,description,url,reward,max_slots,daily_slots,timer_seconds,logo_url,image_url,ad_enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .run(String(b.title).trim(),String(b.short_description||"").trim(),String(b.description).trim(),String(b.url||"").trim(),Number(b.reward||0),max,daily,timer,"","",b.ad_enabled?1:0);
  res.json({id:info.lastInsertRowid});
 }catch(e){res.status(400).json({error:e.message})}
});

app.put("/api/admin/tasks/:id",admin,(req,res)=>{
 try{
  const b=req.body||{};
  const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(req.params.id);
  if(!t) return res.status(404).json({error:"Task not found"});
  if(!String(b.title||"").trim()||!String(b.description||"").trim()) throw new Error("Task title and description are required.");
  db.prepare(`UPDATE tasks SET title=?,short_description=?,description=?,url=?,reward=?,max_slots=?,daily_slots=?,timer_seconds=?,ad_enabled=? WHERE id=?`)
   .run(String(b.title).trim(),String(b.short_description||"").trim(),String(b.description).trim(),String(b.url||"").trim(),Number(b.reward||0),Math.min(1000,Math.max(1,Number(b.max_slots||1000))),Math.min(200,Math.max(1,Number(b.daily_slots||200))),Math.max(10,Number(b.timer_seconds||120)),b.ad_enabled?1:0,t.id);
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.delete("/api/admin/tasks/:id",admin,(req,res)=>{
 try{
  const t=db.prepare("SELECT id FROM tasks WHERE id=?").get(req.params.id);
  if(!t) return res.status(404).json({error:"Task not found"});
  db.prepare("DELETE FROM daily_slots WHERE task_id=?").run(t.id);
  db.prepare("DELETE FROM attempts WHERE task_id=? AND status IN ('started','expired')").run(t.id);
  db.prepare("DELETE FROM tasks WHERE id=?").run(t.id);
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/admin/tasks/:id/status",admin,(req,res)=>{
 try{
  const active=Number(req.body.active)?1:0;
  const info=db.prepare("UPDATE tasks SET active=? WHERE id=?").run(active,req.params.id);
  if(!info.changes) return res.status(404).json({error:"Task not found"});
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/admin/tasks/:id/media",admin,upload.fields([{name:"logo",maxCount:1},{name:"image",maxCount:1}]),(req,res)=>{
 try{
  const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(req.params.id);
  if(!t) return res.status(404).json({error:"Task not found"});
  const logo=req.files?.logo?.[0];
  const image=req.files?.image?.[0];
  if(!logo&&!image) throw new Error("No image selected.");
  const logoUrl=logo?"/uploads/"+path.basename(logo.path):t.logo_url;
  const imageUrl=image?"/uploads/"+path.basename(image.path):t.image_url;
  db.prepare("UPDATE tasks SET logo_url=?,image_url=? WHERE id=?").run(logoUrl,imageUrl,t.id);
  res.json({ok:true,logo_url:logoUrl,image_url:imageUrl});
 }catch(e){res.status(400).json({error:e.message})}
});

app.get("/api/admin/users",admin,(req,res)=>res.json({users:db.prepare("SELECT * FROM users ORDER BY id DESC LIMIT 500").all()}));
app.post("/api/admin/users/:id/ban",admin,(req,res)=>{db.prepare("UPDATE users SET status='banned' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/users/:id/unban",admin,(req,res)=>{db.prepare("UPDATE users SET status='active' WHERE id=?").run(req.params.id);res.json({ok:true})});
app.post("/api/admin/users/:id/message",admin,async(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id);
 if(BOT_TOKEN&&u){await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:u.telegram_id,text:req.body.message||"You have a new message from HillsByte admin."})}).catch(()=>{})}
 res.json({ok:true});
});
app.get("/api/admin/withdrawals",admin,(req,res)=>res.json({withdrawals:db.prepare("SELECT w.*,u.username,u.telegram_id FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT 500").all()}));
app.post("/api/admin/withdrawals/:id",admin,(req,res)=>{
 const w=db.prepare("SELECT * FROM withdrawals WHERE id=?").get(req.params.id); if(!w) return res.status(404).json({error:"Not found"});
 const status=req.body.status;
 if(status==="rejected") db.prepare("UPDATE users SET balance=balance+?,pending_balance=MAX(0,pending_balance-?) WHERE id=?").run(w.amount,w.amount,w.user_id);
 if(status==="approved") db.prepare("UPDATE users SET pending_balance=MAX(0,pending_balance-?) WHERE id=?").run(w.amount,w.user_id);
 db.prepare("UPDATE withdrawals SET status=? WHERE id=?").run(status,w.id);res.json({ok:true});
});
app.post("/api/admin/submissions/:id",admin,(req,res)=>{
 const s=db.prepare("SELECT * FROM submissions WHERE id=?").get(req.params.id);if(!s)return res.status(404).json({error:"Not found"});
 if(s.status!=="pending")return res.json({ok:true});
 if(req.body.status==="approved"){
  const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(s.task_id);
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(s.user_id);
  const tx=db.transaction(()=>{
   db.prepare("UPDATE submissions SET status='approved' WHERE id=?").run(s.id);
   db.prepare("UPDATE tasks SET total_completed=total_completed+1 WHERE id=?").run(t.id);
   db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(t.reward,u.id);
   const count=db.prepare("SELECT count(*) c FROM submissions WHERE user_id=? AND status='approved'").get(u.id).c;
   if(u.referred_by && count===5) db.prepare("UPDATE users SET hillscoin=hillscoin+20 WHERE referral_code=?").run(u.referred_by);
   if(u.referred_by && count>5){
     const parent=db.prepare("SELECT * FROM users WHERE referral_code=?").get(u.referred_by);
     if(parent) db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(t.reward*0.10,parent.id);
   }
  });tx();
 }else db.prepare("UPDATE submissions SET status='rejected' WHERE id=?").run(s.id);
 res.json({ok:true});
});

app.get("/api/admin/submissions",admin,(req,res)=>{
  const rows=db.prepare(`SELECT s.*,u.username,u.first_name,u.telegram_id,t.title,t.reward
    FROM submissions s
    JOIN users u ON u.id=s.user_id
    JOIN tasks t ON t.id=s.task_id
    ORDER BY s.id DESC LIMIT 500`).all();
  res.json({submissions:rows.map(s=>({...s,s.screenshots:parseScreenshots(s.screenshots)}))});
});

function parseScreenshots(value){
  try{
    const arr=typeof value==="string"?JSON.parse(value||"[]"):(value||[]);
    return Array.isArray(arr)?arr:[];
  }catch{return []}
}

app.get("/api/admin/ads",admin,(req,res)=>{
  const a=db.prepare("SELECT provider,unit_id,reward_amount,daily_limit,cooldown,enabled,CASE WHEN provider_secret<>'' THEN 1 ELSE 0 END AS secret_set FROM ad_settings WHERE id=1").get();
  res.json({ads:a});
});

app.put("/api/admin/ads",admin,(req,res)=>{
 try{
  const b=req.body||{};
  const current=db.prepare("SELECT * FROM ad_settings WHERE id=1").get();
  const secret=String(b.provider_secret||"") || current.provider_secret || "";
  db.prepare(`UPDATE ad_settings SET provider=?,unit_id=?,provider_secret=?,reward_amount=?,daily_limit=?,cooldown=?,enabled=? WHERE id=1`)
   .run(String(b.provider||"").trim(),String(b.unit_id||"").trim(),secret,Number(b.reward_amount||0),Math.max(0,Number(b.daily_limit||5)),Math.max(0,Number(b.cooldown||30)),b.enabled?1:0);
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.get("/api/admin/promos",admin,(req,res)=>res.json({promos:db.prepare("SELECT * FROM promos ORDER BY id DESC").all()}));
app.post("/api/admin/promos",admin,(req,res)=>{const b=req.body;const code=String(b.code||ref()).toUpperCase();db.prepare("INSERT INTO promos(code,amount,coin_amount,max_uses) VALUES(?,?,?,?)").run(code,Number(b.amount||0),Number(b.coin_amount||0),Number(b.max_uses||1));res.json({code})});

app.use((req,res,next)=>{ if(req.method==="GET" && !req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) return res.sendFile(path.join(ROOT,"dist","index.html")); next(); });
app.listen(PORT,()=>console.log(`HillsByte listening on ${PORT}`));
