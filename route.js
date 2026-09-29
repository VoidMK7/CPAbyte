import {NextResponse} from 'next/server';
import crypto from 'crypto';
function verify(initData,botToken){
 if(!initData||!botToken)return {ok:false,error:'Telegram configuration is missing.'};
 const p=new URLSearchParams(initData), hash=p.get('hash'); if(!hash)return {ok:false,error:'Missing Telegram hash.'};
 p.delete('hash'); const data=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
 const expected=crypto.createHmac('sha256',secret).update(data).digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(hash)))return {ok:false,error:'Invalid Telegram initData.'};
 let user=null;try{user=JSON.parse(p.get('user')||'null')}catch{} return {ok:true,user,startParam:p.get('start_param')||''};
}
export async function POST(req){try{const {initData}=await req.json();const r=verify(initData,process.env.TELEGRAM_BOT_TOKEN);if(!r.ok)return NextResponse.json({error:r.error},{status:400});return NextResponse.json({ok:true,telegramId:String(r.user.id),user:r.user,startParam:r.startParam});}catch(e){return NextResponse.json({error:e.message},{status:500})}}
