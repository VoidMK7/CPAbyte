'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

const tasks = [
  ['Join a Telegram community', 'Telegram', '$0.25'],
  ['Complete a community activity', 'Community', '$0.40'],
  ['Daily check-in', 'Daily', '$0.10'],
  ['Visit a partner website', 'Website', '$0.20'],
];

export default function Dashboard() {
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState('0.00');
  const [message, setMessage] = useState('');
  const supabase = supabaseBrowser();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function signIn() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) setMessage(error.message);
  }

  async function signOut() { await supabase.auth.signOut(); }

  async function linkTelegram() {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData || !session?.access_token) {
      setMessage('Open HillsByte from Telegram to link Telegram automatically.');
      return;
    }
    const response = await fetch('/api/telegram/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ initData: webApp.initData })
    });
    const data = await response.json();
    setMessage(data.ok ? 'Telegram linked successfully.' : data.error);
  }

  return <main className="shell" id="dashboard">
    <header className="topbar">
      <div className="brand"><span className="brandMark">HB</span><div><strong>HillsByte</strong><small>REWARDS</small></div></div>
      <div className="authArea">{session ? <button className="ghost" onClick={signOut}>Sign out</button> : <button className="primary" onClick={signIn}>Sign in</button>}</div>
    </header>

    <section className="heroCard">
      <div><p className="eyebrow">PREMIUM REWARDS</p><h1>Earn smarter.<br/><span>Grow your rewards.</span></h1><p className="muted">Complete verified tasks, watch eligible ads, invite friends and manage your earnings from one mobile-first dashboard.</p><div className="actions"><a className="primary" href="#earn">Start earning</a><button className="secondary" onClick={linkTelegram}>Telegram Mini App</button></div></div>
      <div className="orb"><div className="coin">HB</div></div>
    </section>

    {message && <div className="notice">{message}</div>}

    <section className="stats" id="wallet">
      <article><span>Available balance</span><strong>${balance}</strong><small>USD equivalent</small></article>
      <article><span>Task earnings</span><strong>$0.00</strong><small>Completed rewards</small></article>
      <article><span>Referral earnings</span><strong>$0.00</strong><small>Pending + released</small></article>
      <article><span>Ad progress</span><strong>0 / 20</strong><small>Rolling 24 hours</small></article>
    </section>

    <section className="section" id="earn"><div className="sectionHead"><div><p className="eyebrow">EARN</p><h2>Available tasks</h2></div><span className="pill">4 active</span></div><div className="taskGrid">{tasks.map(([name, category, reward]) => <article className="task" key={name}><div className="taskIcon">↗</div><div className="taskBody"><small>{category}</small><h3>{name}</h3><p>Proof may be required after completion.</p></div><strong>{reward}</strong></article>)}</div></section>

    <section className="split" id="referrals">
      <article className="panel"><p className="eyebrow">REFERRALS</p><h2>Invite friends. Unlock commissions.</h2><p className="muted">Referral commissions can remain pending until configured unlock requirements are completed.</p><div className="refCode"><span>Your referral code</span><strong>HB-DEMO</strong><button className="secondary">Copy</button></div></article>
      <article className="panel" id="telegram"><p className="eyebrow">TELEGRAM</p><h2>Built for the Mini App.</h2><p className="muted">Telegram identity is verified server-side from initData. Bot tokens never reach the browser.</p><ul className="checks"><li>Silent identity linking</li><li>WebApp welcome button</li><li>Referral deep links</li><li>Optional channel gate</li></ul></article>
    </section>

    <nav className="bottomNav"><a href="#dashboard">Home</a><a href="#earn">Earn</a><a href="#wallet">Wallet</a><a href="#referrals">Refer</a><a href="#telegram">Profile</a></nav>
  </main>;
}
