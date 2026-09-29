'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const nav = [
  ['/','Home'],['/earn','Earn'],['/wallet','Wallet'],['/referrals','Refer'],['/activity','Activity'],['/community','Community'],['/events','Events'],['/leaderboard','Leaderboard'],['/notifications','Notifications'],['/profile','Profile']
];

export default function AppPage({ eyebrow, title, description, children }) {
  const [user, setUser] = useState(null);
  const supabase = supabaseBrowser();
  useEffect(() => { supabase.auth.getUser().then(({data}) => setUser(data.user || null)); }, [supabase]);
  return <main className="appShell">
    <header className="topbar"><Link href="/" className="brand"><span className="brandMark">HB</span><div><strong>HillsByte</strong><small>REWARDS</small></div></Link><div>{user ? <button className="ghost" onClick={() => supabase.auth.signOut()}>Sign out</button> : <Link className="primary" href="/login">Sign in</Link>}</div></header>
    <div className="layout"><aside className="sidebar">{nav.map(([href,label]) => <Link href={href} key={href}>{label}</Link>)}<Link href="/ads">Ads</Link><Link href="/assistant">Assistant</Link><Link href="/admin">Admin</Link></aside><section className="content"><p className="eyebrow">{eyebrow}</p><h1 className="pageTitle">{title}</h1><p className="muted">{description}</p>{children}</section></div>
    <nav className="bottomNav">{nav.slice(0,5).map(([href,label]) => <Link href={href} key={href}>{label}</Link>)}</nav>
  </main>;
}
