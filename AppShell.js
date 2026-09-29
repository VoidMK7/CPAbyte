'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';

const nav=[['/','Dashboard','⌂'],['/earn','Earn','✦'],['/activity','Activity','⌁'],['/wallet','Wallet','▣'],['/referrals','Referrals','♧'],['/community','Community','♧'],['/events','Events','▦'],['/leaderboard','Leaderboard','♜'],['/notifications','Notifications','♢'],['/profile','Profile','♙'],['/admin','Admin','◈']];
export default function AppShell({children}){const [open,setOpen]=useState(false); const [currency,setCurrency]=useState('USD');
useEffect(()=>{setCurrency(localStorage.getItem('hb_currency')||'USD')},[]);
function changeCurrency(v){setCurrency(v);localStorage.setItem('hb_currency',v);window.dispatchEvent(new Event('hb-currency'))}
return <div className="app"><header className="top"><button className="hamb" onClick={()=>setOpen(!open)}>☰</button><Link href="/" className="brand"><span>H</span><b>HillsByte</b></Link><div className="topRight"><select value={currency} onChange={e=>changeCurrency(e.target.value)}><option>USD</option><option>NGN</option><option>EUR</option><option>GBP</option></select><span className="bell">♧<i>1</i></span></div></header><aside className={'drawer '+(open?'show':'')}><div className="drawerHead"><span className="logo">H</span><b>HillsByte</b><button onClick={()=>setOpen(false)}>×</button></div>{nav.map(([href,label,icon])=><Link key={href} href={href} onClick={()=>setOpen(false)}><span>{icon}</span>{label}</Link>)}</aside>{open&&<div className="shade" onClick={()=>setOpen(false)}/>}<main>{children}</main><nav className="bottom">{nav.slice(1,5).map(([href,label,icon])=><Link href={href} key={href}><span>{icon}</span>{label}</Link>)}</nav></div>}
