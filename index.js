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
const SUPABASE_URL=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const SUPABASE_BUCKET=process.env.SUPABASE_BUCKET||"hillsbyte-backups";

fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});

// Render Free storage is ephemeral. Before opening SQLite, restore the latest
// database backup from Supabase Storage when persistence is configured.
async function restoreDatabase(){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) return false;
  try{
    await fetch(`${SUPABASE_URL}/storage/v1/bucket`,{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey":SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({id:SUPABASE_BUCKET,name:SUPABASE_BUCKET,public:false})
    }).catch(()=>{});

    const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/hillsbyte.db`,{
      headers:{
        "Authorization":`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey":SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if(!r.ok) return false;
    const buffer=Buffer.from(await r.arrayBuffer());
    if(buffer.length<100) return false;
    const restorePath=`${DB_PATH}.restore`;
    fs.writeFileSync(restorePath,buffer);
    fs.renameSync(restorePath,DB_PATH);
    console.log("HillsByte database restored from Supabase Storage.");
    return true;
  }catch(e){
    console.error("Database restore skipped:",e.message);
    return false;
  }
}

await restoreDatabase();

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
 status TEXT DEFAULT 'started'
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
CREATE TABLE IF NOT EXISTS notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT,message TEXT,kind TEXT DEFAULT 'info',read_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity(
 id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,kind TEXT NOT NULL,amount REAL DEFAULT 0,task_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
// Older builds used UNIQUE(task_id,user_id), which prevented a user from retrying.
// Rebuild that table once so abandoned/rejected tasks can be attempted again.
try{
  const uniqueIndexes=db.prepare("PRAGMA index_list(attempts)").all().filter(i=>i.unique);
  let hasTaskUserUnique=false;
  for(const ix of uniqueIndexes){
    const fields=db.prepare(`PRAGMA index_info('${String(ix.name).replace(/'/g,"''")}')`).all().map(x=>x.name);
    if(fields.includes("task_id")&&fields.includes("user_id")) hasTaskUserUnique=true;
  }
  if(hasTaskUserUnique){
    db.exec(`
      CREATE TABLE IF NOT EXISTS attempts_v2(
        id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, user_id INTEGER,
        started_at INTEGER, expires_at INTEGER, status TEXT DEFAULT 'started'
      );
      INSERT OR IGNORE INTO attempts_v2(id,task_id,user_id,started_at,expires_at,status)
      SELECT id,task_id,user_id,started_at,expires_at,status FROM attempts;
      DROP TABLE attempts;
      ALTER TABLE attempts_v2 RENAME TO attempts;
    `);
  }
}catch(e){ console.error("Attempt migration:",e.message); }

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

let syncTimer=null;
let syncChain=Promise.resolve();

async function syncDatabase(){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) return;
  try{
    db.pragma("wal_checkpoint(TRUNCATE)");
    const body=fs.readFileSync(DB_PATH);
    const r=await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/hillsbyte.db`,{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "apikey":SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type":"application/octet-stream",
        "x-upsert":"true"
      },
      body
    });
    if(!r.ok){
      const text=await r.text().catch(()=>"");
      throw new Error(`Storage backup failed (${r.status}) ${text.slice(0,200)}`);
    }
    console.log("HillsByte database backup synced.");
  }catch(e){
    console.error("Database backup failed:",e.message);
  }
}
function scheduleDbSync(){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{
    syncChain=syncChain.then(syncDatabase).catch(e=>console.error("Database sync queue:",e.message));
  },500);
}

const app=express();
app.use(express.json({limit:"2mb"}));
// Every API write schedules a persistent database backup.
app.use((req,res,next)=>{
  if(req.path.startsWith("/api/") && req.method!=="GET") res.on("finish",scheduleDbSync);
  next();
});
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
  return calc.length === hash.length && crypto.timingSafeEqual(Buffer.from(calc),Buffer.from(hash));
}
async function telegramMemberStatus(tid){
  if(!BOT_TOKEN || !CHANNEL_USERNAME) return true;
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(CHANNEL_USERNAME)}&user_id=${encodeURIComponent(tid)}`);
  const d=await r.json();
  if(!d.ok) return false;
  return ["member","administrator","creator"].includes(d.result?.status);
}
function requireActive(u){if(!u)throw new Error("User not found");if(u.status==="banned")throw new Error("Your account is banned.");if(u.status==="suspended")throw new Error("Your account is suspended.");}
function publicUser(u){
  const completed=Number(db.prepare("SELECT count(*) c FROM submissions WHERE user_id=? AND status='approved'").get(u.id).c||0);
  const invited=Number(db.prepare("SELECT count(*) c FROM users WHERE referred_by=?").get(u.referral_code).c||0);
  const pending=Number(db.prepare("SELECT count(*) c FROM submissions WHERE user_id=? AND status='pending'").get(u.id).c||0);
  return {...u,completed_count:completed,referral_count:invited,pending_tasks:pending};
}
function addActivity(userId,kind,amount=0,taskId=null){
  db.prepare("INSERT INTO activity(user_id,kind,amount,task_id) VALUES(?,?,?,?)").run(userId,kind,Number(amount||0),taskId);
}
function addNotification(userId,title,message,kind="info"){
  db.prepare("INSERT INTO notifications(user_id,title,message,kind) VALUES(?,?,?,?)").run(userId,title,message,kind);
}

app.get("/api/bootstrap",async(req,res)=>{
 try{
  const initData=req.headers["x-telegram-init-data"]||"";
  const tid=String(req.query.telegramId||"");
  if(tid!=="demo-user" && BOT_TOKEN){
    if(!verifyTelegramInitData(initData)) return res.status(401).json({error:"Invalid Telegram session. Open HillsByte from Telegram."});
  }
  const u=getUser(tid,req.query.username,req.query.firstName,req.query.referralCode); requireActive(u);
  // Keep active tasks visible even when today's daily slots are full.
  // Starting the task is blocked until the daily limit resets; the task itself
  // must not disappear simply because its daily counter reached the limit.
  const tasks=db.prepare("SELECT * FROM tasks WHERE active=1 AND total_completed<max_slots ORDER BY id DESC").all().map(t=>{
    const s=db.prepare("SELECT count FROM daily_slots WHERE task_id=? AND day=?").get(t.id,day());
    return {...t,daily_completed:s?.count||0,remaining_daily:Math.max(0,t.daily_slots-(s?.count||0))};
  });
  res.json({user:publicUser(u),tasks,admin:isAdmin(tid),channel:CHANNEL_USERNAME});
 }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/tasks/:id/start",(req,res)=>{
 try{
  const u=getUser(req.body.telegramId); requireActive(u);
  const t=db.prepare("SELECT * FROM tasks WHERE id=? AND active=1").get(req.params.id);
  if(!t)throw new Error("Task unavailable.");

  const latest=db.prepare("SELECT * FROM submissions WHERE user_id=? AND task_id=? ORDER BY id DESC LIMIT 1").get(u.id,t.id);
  if(latest && ["pending","approved"].includes(latest.status)){
    throw new Error(latest.status==="pending" ? "Your proof is already under review." : "You have already completed this task.");
  }

  const s=db.prepare("SELECT count FROM daily_slots WHERE task_id=? AND day=?").get(t.id,day());
  if((s?.count||0)>=t.daily_slots)throw new Error("Today's completed slots are full. Try again tomorrow.");
  if(t.total_completed>=t.max_slots)throw new Error("All task slots have been completed.");

  const now=Date.now(), expires=now+t.timer_seconds*1000;
  const existing=db.prepare("SELECT * FROM attempts WHERE task_id=? AND user_id=? AND status='started' ORDER BY id DESC LIMIT 1").get(t.id,u.id);

  if(existing){
    db.prepare("UPDATE attempts SET started_at=?,expires_at=?,status='started' WHERE id=?").run(now,expires,existing.id);
    return res.json({attempt:{id:existing.id,expires_at:expires}});
  }

  const info=db.prepare("INSERT INTO attempts(task_id,user_id,started_at,expires_at,status) VALUES(?,?,?,?,?)").run(t.id,u.id,now,expires,"started");
  res.json({attempt:{id:info.lastInsertRowid,expires_at:expires}});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/submissions",upload.array("screenshots",3),(req,res)=>{
 try{
  const u=getUser(req.body.telegramId);requireActive(u);
  const a=db.prepare("SELECT * FROM attempts WHERE id=? AND user_id=?").get(req.body.attemptId,u.id);
  if(!a||a.status!=="started")throw new Error("Invalid or already submitted attempt.");
  if(Date.now()>a.expires_at){db.prepare("UPDATE attempts SET status='expired' WHERE id=?").run(a.id);throw new Error("Timer expired. Start the task again to retry.");}

  const exists=db.prepare("SELECT * FROM submissions WHERE user_id=? AND task_id=? AND status IN ('pending','approved')").get(u.id,a.task_id);
  if(exists)throw new Error(exists.status==="pending" ? "Your proof is already under review." : "You have already completed this task.");

  const shots=(req.files||[]).map(f=>"/uploads/"+path.basename(f.path));
  if(!shots.length)throw new Error("Upload at least one screenshot.");

  // A rejected submission is retained for history, while this new attempt gets its own submission.
  db.prepare("INSERT INTO submissions(attempt_id,user_id,task_id,note,screenshots,status) VALUES(?,?,?,?,?,?)")
    .run(a.id,u.id,a.task_id,req.body.note||"",JSON.stringify(shots),"pending");
  db.prepare("UPDATE attempts SET status='submitted' WHERE id=?").run(a.id);
  addActivity(u.id,"submission",0,a.task_id);
  addNotification(u.id,"Proof submitted","Your task proof has been sent to HillsByte for review.","submission");
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
app.get("/api/profile/details",async(req,res)=>{
 try{
  const u=getUser(req.query.telegramId);requireActive(u);
  const chart=db.prepare(`
    SELECT substr(created_at,1,10) day, COUNT(*) completed
    FROM submissions
    WHERE user_id=? AND status='approved' AND created_at>=datetime('now','-6 days')
    GROUP BY substr(created_at,1,10) ORDER BY day
  `).all(u.id);
  const history=db.prepare(`
    SELECT s.id,s.status,s.created_at,s.note,t.title,t.reward
    FROM submissions s JOIN tasks t ON t.id=s.task_id
    WHERE s.user_id=? ORDER BY s.id DESC LIMIT 20
  `).all(u.id);
  const notifications=db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30").all(u.id);
  res.json({
    user:publicUser(u),
    chart,
    history,
    notifications,
    friends:db.prepare("SELECT id,telegram_id,username,first_name,created_at FROM users WHERE referred_by=? ORDER BY id DESC LIMIT 50").all(u.referral_code)
  });
 }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/notifications/read",async(req,res)=>{
 try{
  const u=getUser(req.body.telegramId);requireActive(u);
  db.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL").run(u.id);
  res.json({ok:true});
 }catch(e){res.status(400).json({error:e.message})}
});

app.post("/api/telegram/webhook",async(req,res)=>{
  try{
    const msg=req.body?.message;
    if(msg?.chat?.type==="private" && msg?.text?.startsWith("/start")){
      const name=msg.from?.first_name||"there";
      const startParam=msg.text.trim().split(/\\s+/)[1]||"";
      // Create the account here too, so users are stored as soon as they start the bot.
      getUser(String(msg.from.id),msg.from.username||"",msg.from.first_name||"",startParam);

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          chat_id:msg.chat.id,
          text:`🎉 Welcome to HillsByte, ${name}!

💰 Complete tasks, earn rewards, and grow your balance.

🚀 Open HillsByte below to start earning.`,
          reply_markup:{inline_keyboard:[[{text:"🚀 Open HillsByte",web_app:{url:"https://cpabyte-1.onrender.com"}}]]}
        })
      });
    }
    res.sendStatus(200);
  }catch(e){
    console.error("Telegram webhook error:",e);
    res.sendStatus(200);
  }
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

app.post("/api/admin/broadcast/upload",admin,upload.single("image"),(req,res)=>{
  try{
    if(!req.file) throw new Error("No image selected.");
    const url=`${req.protocol}://${req.get("host")}/uploads/${path.basename(req.file.path)}`;
    res.json({ok:true,url});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/admin/broadcast",admin,async(req,res)=>{
  try{
    const message=String(req.body.message||"").trim();
    const imageUrl=String(req.body.imageUrl||"").trim();

    if(!message && !imageUrl){
      throw new Error("Enter a message or upload a picture.");
    }

    const users=db.prepare(
      "SELECT telegram_id FROM users WHERE status='active'"
    ).all();

    let sent=0;

    for(const u of users){
      try{
        let r;

        if(imageUrl){
          r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({
              chat_id:u.telegram_id,
              photo:imageUrl,
              caption:message
            })
          });
        }else{
          r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
            method:"POST",
            headers:{"content-type":"application/json"},
            body:JSON.stringify({
              chat_id:u.telegram_id,
              text:message
            })
          });
        }

        const data=await r.json();
        if(data.ok){ sent++; addNotification(db.prepare("SELECT id FROM users WHERE telegram_id=?").get(u.telegram_id)?.id,"HillsByte update",message||"New update from HillsByte.","broadcast"); }
      }catch{}
    }

    res.json({
      ok:true,
      sent,
      total:users.length
    });
  }catch(e){
    res.status(400).json({error:e.message});
  }
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
 const s=db.prepare("SELECT * FROM submissions WHERE id=?").get(req.params.id);
 if(!s)return res.status(404).json({error:"Not found"});
 if(s.status!=="pending")return res.json({ok:true});

 const status=req.body.status;
 if(!["approved","rejected"].includes(status))return res.status(400).json({error:"Invalid status"});

 if(status==="approved"){
  const t=db.prepare("SELECT * FROM tasks WHERE id=?").get(s.task_id);
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(s.user_id);
  if(!t||!u)return res.status(404).json({error:"Task or user not found"});

  const slot=db.prepare("SELECT count FROM daily_slots WHERE task_id=? AND day=?").get(t.id,day());
  if((slot?.count||0)>=t.daily_slots || t.total_completed>=t.max_slots){
    return res.status(409).json({error:"This task has reached its completion limit. Reject the submission or adjust the task limits."});
  }

  const tx=db.transaction(()=>{
   db.prepare("UPDATE submissions SET status='approved' WHERE id=?").run(s.id);
   db.prepare("UPDATE tasks SET total_completed=total_completed+1 WHERE id=?").run(t.id);
   db.prepare("INSERT INTO daily_slots(task_id,day,count) VALUES(?,?,1) ON CONFLICT(task_id,day) DO UPDATE SET count=count+1").run(t.id,day());
   db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(t.reward,u.id);
   addActivity(u.id,"earning",t.reward,t.id);
   addNotification(u.id,"Task approved",`Your proof for "${t.title}" was approved. $${Number(t.reward).toFixed(2)} has been added to your balance.`,"approved");

   const count=db.prepare("SELECT count(*) c FROM submissions WHERE user_id=? AND status='approved'").get(u.id).c;
   if(u.referred_by && count===5){
     db.prepare("UPDATE users SET hillscoin=hillscoin+20 WHERE referral_code=?").run(u.referred_by);
   }
   if(u.referred_by && count>5){
     const parent=db.prepare("SELECT * FROM users WHERE referral_code=?").get(u.referred_by);
     if(parent){
       db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(t.reward*0.10,parent.id);
       addNotification(parent.id,"Referral earning",`Your referral earned $${Number(t.reward).toFixed(2)}. You received $${Number(t.reward*0.10).toFixed(2)}.`,"referral");
     }
   }
  });
  tx();
 }else{
  const t=db.prepare("SELECT title FROM tasks WHERE id=?").get(s.task_id);
  db.prepare("UPDATE submissions SET status='rejected' WHERE id=?").run(s.id);
  addNotification(s.user_id,"Proof rejected",`Your proof for "${t?.title||"this task"}" was rejected. You can try the task again.`,"rejected");
 }
 res.json({ok:true});
});

app.get("/api/admin/submissions",admin,(req,res)=>{
  const rows=db.prepare(`SELECT s.*,u.username,u.first_name,u.telegram_id,t.title,t.reward
    FROM submissions s
    JOIN users u ON u.id=s.user_id
    JOIN tasks t ON t.id=s.task_id
    ORDER BY s.id DESC LIMIT 500`).all();
  res.json({submissions:rows.map(s=>({...s,screenshots:parseScreenshots(s.screenshots)}))});
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

app.get("/api/ads",async(req,res)=>{
  try{
    const a=db.prepare("SELECT provider,unit_id,reward_amount,daily_limit,cooldown,enabled FROM ad_settings WHERE id=1").get();
    res.json({ads:a||{enabled:0}});
  }catch(e){res.status(400).json({error:e.message})}
});
app.post("/api/assistant",async(req,res)=>{
  try{
    const question=String(req.body.question||"").trim().slice(0,500);
    if(!question)throw new Error("Ask me a question first.");
    const q=question.toLowerCase();

    // Optional real AI: set OPENAI_API_KEY to enable it. Without a key,
    // HillsByte still provides a useful built-in assistant.
    if(process.env.OPENAI_API_KEY){
      const r=await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`
        },
        body:JSON.stringify({
          model:process.env.OPENAI_MODEL||"gpt-5-mini",
          input:`You are the HillsByte earning-app assistant. Give concise, safe, helpful answers about tasks, submissions, withdrawals, referrals, profile, ads and account navigation. Never promise earnings or approve payments. User question: ${question}`
        })
      });
      const d=await r.json();
      const text=d.output_text||d.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join(" ").trim();
      if(text)return res.json({answer:text,ai:true});
    }

    let answer="I can help with HillsByte tasks, proof submissions, withdrawals, referrals, profile and notifications.";
    if(q.includes("task")) answer="Open Home → Task Marketplace. Tap Start, follow the instructions, complete the task, upload 1–3 screenshots and submit for review. Leaving a task does not count as completion.";
    else if(q.includes("withdraw")) answer="Open Wallet to request a payout. Your available balance must meet the minimum shown there. Check your payout details carefully before submitting.";
    else if(q.includes("referral")||q.includes("invite")) answer="Open Referrals to copy your invite link. Referral rewards are credited according to the qualification rules shown in the app.";
    else if(q.includes("reject")) answer="A rejected proof stays in your history. You can start that task again and submit new proof.";
    else if(q.includes("notification")) answer="Your Profile contains your notifications and recent account activity.";
    else if(q.includes("ad")) answer="The Ads section contains sponsor/ad settings. Availability and rewards depend on the configured provider.";
    res.json({answer,ai:false});
  }catch(e){res.status(400).json({error:e.message})}
});
app.use((req,res,next)=>{ if(req.method==="GET" && !req.path.startsWith("/api/") && !req.path.startsWith("/uploads/")) return res.sendFile(path.join(ROOT,"dist","index.html")); next(); });
app.listen(PORT,async()=>{
  console.log(`HillsByte listening on ${PORT}`);
  // Create the first persistent snapshot immediately so a restart before the
  // next user action cannot leave the current database without a backup.
  await syncDatabase();
  if(BOT_TOKEN){
    try{
      const webhookUrl=`https://cpabyte-1.onrender.com/api/telegram/webhook`;
      const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      console.log("Telegram webhook setup:",await r.text());
    }catch(e){console.error("Webhook setup failed:",e.message)}
  }
});
