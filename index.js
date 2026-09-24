import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT, 'public')));

const PORT = Number(process.env.PORT || 3000);
const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'task-proofs';
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false,autoRefreshToken:false} }) : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req,file,cb) => {
    const ok=['image/png','image/jpeg','image/webp'].includes(file.mimetype);
    cb(ok?null:new Error('Only PNG, JPEG and WebP proof images are allowed.'),ok);
  }
});

const devUser={telegram_id:900000001,username:'demo_user',first_name:'Zoomey',last_name:'Canary',photo_url:'',role:'admin'};
const adminIds=()=>String(process.env.TELEGRAM_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).map(Number);
const isAdmin=u=>Boolean(u&&(u.role==='admin'||adminIds().includes(Number(u.telegram_id))));
const money=n=>`$${Number(n||0).toFixed(2)}`;

function verifyTelegramInitData(initData){
  const botToken=process.env.TELEGRAM_BOT_TOKEN;if(!botToken||!initData)return null;
  const params=new URLSearchParams(initData),hash=params.get('hash');if(!hash)return null;params.delete('hash');
  const dataCheckString=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const calculated=crypto.createHmac('sha256',secret).update(dataCheckString).digest('hex');
  if(calculated.length!==hash.length||!crypto.timingSafeEqual(Buffer.from(calculated),Buffer.from(hash)))return null;
  const authDate=Number(params.get('auth_date')||0);if(!authDate||Date.now()/1000-authDate>86400)return null;
  const rawUser=params.get('user');if(!rawUser)return null;try{return JSON.parse(rawUser)}catch{return null}
}
async function ensureBucket(){if(!supabase)return;const {data}=await supabase.storage.listBuckets();if(!data?.some(b=>b.name===bucket))await supabase.storage.createBucket(bucket,{public:false,fileSizeLimit:'8MB'});}
ensureBucket().catch(()=>{});

async function getProfile(telegramUser){
  if(!supabase)return {...devUser,...telegramUser};
  const id=Number(telegramUser.id);
  const {data:existing}=await supabase.from('profiles').select('role').eq('telegram_id',id).maybeSingle();
  const role=adminIds().includes(id)?'admin':(existing?.role||'user');
  const payload={telegram_id:id,username:telegramUser.username||null,first_name:telegramUser.first_name||'',last_name:telegramUser.last_name||'',photo_url:telegramUser.photo_url||null,referral_code:`HB${id.toString(36).toUpperCase()}`,role};
  const {data,error}=await supabase.from('profiles').upsert(payload,{onConflict:'telegram_id'}).select().single();if(error)throw error;return data;
}
async function auth(req,res,next){try{if(process.env.DEV_AUTH==='true'&&!req.headers['x-telegram-init-data']){req.user=devUser;return next()}const telegramUser=verifyTelegramInitData(req.headers['x-telegram-init-data']);if(!telegramUser)return res.status(401).json({error:'Telegram authentication required.'});req.user=await getProfile(telegramUser);next()}catch(e){res.status(500).json({error:e.message||'Authentication failed.'})}}
function dbRequired(res){if(!supabase){res.status(503).json({error:'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'});return false}return true}
async function signedProof(pathname){if(!pathname||!supabase)return null;const {data}=await supabase.storage.from(bucket).createSignedUrl(pathname,3600);return data?.signedUrl||null}

app.get('/health',(_req,res)=>res.json({ok:true,supabase:Boolean(supabase),storageBucket:bucket}));
app.get('/api/session',auth,async(req,res)=>{if(!supabase)return res.json({user:req.user});const {data}=await supabase.from('profiles').select('*').eq('telegram_id',req.user.telegram_id).single();res.json({user:data||req.user})});

app.get('/api/dashboard',auth,async(req,res)=>{
  if(!dbRequired(res))return;const id=req.user.telegram_id;
  const [{data:profile},{data:tasks},{data:activity},{data:announcements},{data:events},{data:notifications},{data:ads}]=await Promise.all([
    supabase.from('profiles').select('*').eq('telegram_id',id).single(),
    supabase.from('tasks').select('*').eq('active',true).order('created_at',{ascending:false}).limit(30),
    supabase.from('transactions').select('*').eq('telegram_id',id).order('created_at',{ascending:false}).limit(30),
    supabase.from('announcements').select('*').order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(10),
    supabase.from('events').select('*').order('start_at',{ascending:true}).limit(10),
    supabase.from('notifications').select('*').or(`telegram_id.eq.${id},telegram_id.is.null`).order('created_at',{ascending:false}).limit(30),
    supabase.from('ad_slots').select('id,name,provider,placement,active').eq('active',true)
  ]);
  res.json({profile,tasks:tasks||[],activity:activity||[],announcements:announcements||[],events:events||[],notifications:notifications||[],ads:ads||[]});
});

app.post('/api/checkin',auth,async(req,res)=>{if(!dbRequired(res))return;const {data,error}=await supabase.rpc('perform_daily_checkin',{p_telegram_id:Number(req.user.telegram_id),p_checkin_date:new Date().toISOString().slice(0,10)});if(error)return res.status(400).json({error:error.message});const row=Array.isArray(data)?data[0]:data;res.json(row||{});});

app.post('/api/tasks/:id/submit',auth,upload.single('proof'),async(req,res)=>{
  if(!dbRequired(res))return;const id=Number(req.user.telegram_id);const {data:task}=await supabase.from('tasks').select('*').eq('id',req.params.id).eq('active',true).single();if(!task)return res.status(404).json({error:'Task not found.'});
  if(task.proof_required&&!req.file)return res.status(400).json({error:'Proof screenshot is required.'});
  const {data:existing}=await supabase.from('task_submissions').select('id,status').eq('task_id',task.id).eq('telegram_id',id).eq('status','pending').maybeSingle();if(existing)return res.status(400).json({error:'You already have a pending submission for this task.'});
  let proofPath=null;
  if(req.file){proofPath=`${id}/${crypto.randomUUID()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const up=await supabase.storage.from(bucket).upload(proofPath,req.file.buffer,{contentType:req.file.mimetype,upsert:false});if(up.error)return res.status(400).json({error:up.error.message});}
  const {data:submission,error}=await supabase.from('task_submissions').insert({task_id:task.id,telegram_id:id,proof_path:proofPath,reward:task.reward,status:'pending'}).select().single();
  if(error)return res.status(400).json({error:error.message});await supabase.from('notifications').insert({telegram_id:id,title:'Submission received',message:`Your "${task.title}" proof is awaiting review.`,type:'task'});res.json({submission});
});

app.get('/api/wallet',auth,async(req,res)=>{if(!dbRequired(res))return;const id=req.user.telegram_id;const [{data:profile},{data:transactions},{data:withdrawals}]=await Promise.all([supabase.from('profiles').select('*').eq('telegram_id',id).single(),supabase.from('transactions').select('*').eq('telegram_id',id).order('created_at',{ascending:false}).limit(100),supabase.from('withdrawals').select('*').eq('telegram_id',id).order('created_at',{ascending:false}).limit(50)]);res.json({profile,transactions:transactions||[],withdrawals:withdrawals||[]})});
app.post('/api/withdrawals',auth,async(req,res)=>{if(!dbRequired(res))return;const amount=Number(req.body.amount),method=String(req.body.method||''),destination=String(req.body.destination||'');if(!Number.isFinite(amount)||amount<=0||!method||!destination)return res.status(400).json({error:'Enter a valid amount, method and destination.'});const {data,error}=await supabase.from('withdrawals').insert({telegram_id:req.user.telegram_id,amount,method,destination}).select().single();if(error)return res.status(400).json({error:error.message});const {error:lockError}=await supabase.rpc('reserve_withdrawal',{p_withdrawal_id:data.id});if(lockError){await supabase.from('withdrawals').delete().eq('id',data.id);return res.status(400).json({error:lockError.message})}await supabase.from('notifications').insert({telegram_id:req.user.telegram_id,title:'Withdrawal submitted',message:`Your ${money(amount)} withdrawal request is pending review.`,type:'withdrawal'});res.json({withdrawal:data})});

app.get('/api/leaderboard',auth,async(_req,res)=>{if(!dbRequired(res))return;const {data}=await supabase.from('profiles').select('telegram_id,username,first_name,photo_url,lifetime_earnings,tasks_completed,streak').order('lifetime_earnings',{ascending:false}).limit(100);res.json({leaderboard:data||[]})});

app.get('/api/admin',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const [{data:tasks},{data:submissions},{data:withdrawals},{data:events},{data:announcements},{data:ads}]=await Promise.all([supabase.from('tasks').select('*').order('created_at',{ascending:false}),supabase.from('task_submissions').select('*,tasks(title)').order('submitted_at',{ascending:false}).limit(100),supabase.from('withdrawals').select('*').order('created_at',{ascending:false}).limit(100),supabase.from('events').select('*').order('start_at',{ascending:true}),supabase.from('announcements').select('*').order('created_at',{ascending:false}),supabase.from('ad_slots').select('*').order('created_at',{ascending:false})]);
  const proofs=await Promise.all((submissions||[]).map(async s=>({...s,proof_url:await signedProof(s.proof_path)})));res.json({tasks:tasks||[],submissions:proofs,withdrawals:withdrawals||[],events:events||[],announcements:announcements||[],ads:ads||[]})});

app.post('/api/admin/tasks',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const b=req.body;const {data,error}=await supabase.from('tasks').insert({title:String(b.title||'').trim(),description:b.description||null,reward:Number(b.reward||0),category:b.category||'social',est_minutes:Number(b.est_minutes||2),difficulty:b.difficulty||'easy',max_slots:Number(b.max_slots||1000),timer_seconds:Number(b.timer_seconds||120),task_url:b.task_url||null,logo_url:b.logo_url||null,instructions:b.instructions||null,requirements:b.requirements||null,proof_required:Boolean(b.proof_required),active:b.active!==false}).select().single();if(error)return res.status(400).json({error:error.message});res.json({task:data})});
app.put('/api/admin/tasks/:id',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const allowed=['title','description','reward','category','est_minutes','difficulty','max_slots','timer_seconds','task_url','logo_url','instructions','requirements','proof_required','active'];const body=Object.fromEntries(Object.entries(req.body).filter(([k])=>allowed.includes(k)));const {data,error}=await supabase.from('tasks').update(body).eq('id',req.params.id).select().single();if(error)return res.status(400).json({error:error.message});res.json({task:data})});
app.delete('/api/admin/tasks/:id',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const {error}=await supabase.from('tasks').delete().eq('id',req.params.id);if(error)return res.status(400).json({error:error.message});res.json({ok:true})});

app.post('/api/admin/submissions/:id/review',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const status=req.body.status;if(!['approved','rejected'].includes(status))return res.status(400).json({error:'Invalid review status.'});const {data,error}=await supabase.rpc('review_task_submission',{p_submission_id:req.params.id,p_status:status,p_note:req.body.note||null});if(error)return res.status(400).json({error:error.message});const row=Array.isArray(data)?data[0]:data;if(row?.telegram_id)await supabase.from('notifications').insert({telegram_id:row.telegram_id,title:status==='approved'?'Task approved':'Task rejected',message:status==='approved'?`Your task proof was approved and ${money(row.reward)} was added.`:(req.body.note||'Your task proof was rejected.'),type:'task'});res.json({ok:true,result:row})});
app.post('/api/admin/withdrawals/:id/review',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const status=req.body.status;if(!['approved','rejected'].includes(status))return res.status(400).json({error:'Invalid review status.'});const {data,error}=await supabase.rpc('review_withdrawal',{p_withdrawal_id:req.params.id,p_status:status,p_note:req.body.note||null});if(error)return res.status(400).json({error:error.message});const row=Array.isArray(data)?data[0]:data;if(row?.telegram_id)await supabase.from('notifications').insert({telegram_id:row.telegram_id,title:status==='approved'?'Withdrawal approved':'Withdrawal rejected',message:status==='approved'?`Your ${money(row.amount)} withdrawal was approved.`:(req.body.note||'Your withdrawal was rejected.'),type:'withdrawal'});res.json({ok:true,result:row})});
app.post('/api/admin/events',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const {data,error}=await supabase.from('events').insert(req.body).select().single();if(error)return res.status(400).json({error:error.message});res.json({event:data})});
app.post('/api/admin/announcements',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const {data,error}=await supabase.from('announcements').insert({title:String(req.body.title||'').trim(),message:String(req.body.message||'').trim(),pinned:Boolean(req.body.pinned)}).select().single();if(error)return res.status(400).json({error:error.message});res.json({announcement:data})});
app.post('/api/admin/ads',auth,async(req,res)=>{if(!dbRequired(res))return;if(!isAdmin(req.user))return res.status(403).json({error:'Admin access required.'});const {data,error}=await supabase.from('ad_slots').insert({name:req.body.name,provider:req.body.provider||null,placement:req.body.placement||'earn',code:req.body.code||null,active:req.body.active!==false}).select().single();if(error)return res.status(400).json({error:error.message});res.json({ad:data})});

app.post('/api/assistant',auth,async(req,res)=>{const message=String(req.body.message||'').trim();if(!message)return res.status(400).json({error:'Message is required.'});if(supabase)await supabase.from('assistant_messages').insert({telegram_id:req.user.telegram_id,role:'user',content:message});const fallback='I’m the HillsByte assistant. I can help with tasks, check-ins, referrals, your wallet, withdrawals, events, and how the app works. For account-specific information, use the matching HillsByte section.';if(!process.env.AI_API_KEY){if(supabase)await supabase.from('assistant_messages').insert({telegram_id:req.user.telegram_id,role:'assistant',content:fallback});return res.json({reply:fallback,provider:'local'})}try{const response=await fetch(process.env.AI_API_URL||'https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.AI_API_KEY}`},body:JSON.stringify({model:process.env.AI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:'You are the HillsByte in-app assistant. Be concise, helpful and factual. Never claim to have completed financial/account actions you cannot actually perform.'},{role:'user',content:message}],temperature:.3})});if(!response.ok)throw new Error('AI provider returned an error.');const data=await response.json();const reply=data?.choices?.[0]?.message?.content||fallback;if(supabase)await supabase.from('assistant_messages').insert({telegram_id:req.user.telegram_id,role:'assistant',content:reply});res.json({reply,provider:'ai'})}catch{res.json({reply:fallback,provider:'local-fallback'})}});

app.use((err,_req,res,_next)=>res.status(400).json({error:err.message||'Request failed.'}));
app.get(/.*/,(_req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
app.listen(PORT,()=>console.log(`HillsByte listening on ${PORT}`));
