'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppPage from '@/components/AppPage';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function AdminPage() {
  const [state, setState] = useState('loading');
  const supabase = supabaseBrowser();

  useEffect(() => {
    let active = true;
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (active) setState('signed_out');
        return;
      }
      const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (!active) return;
      if (error || !['admin', 'moderator'].includes(data?.role)) setState('forbidden');
      else setState('allowed');
    }
    check();
    return () => { active = false; };
  }, [supabase]);

  if (state === 'loading') {
    return <AppPage eyebrow="ADMIN" title="Checking access" description="Verifying your HillsByte permissions."><div className="panel"><p className="muted">Loading…</p></div></AppPage>;
  }

  if (state !== 'allowed') {
    return <AppPage eyebrow="ADMIN" title="Admin access required" description="This area is restricted to authorized staff accounts."><div className="panel"><p className="muted">You do not have permission to view the admin console.</p><Link className="primary" href="/">Return home</Link></div></AppPage>;
  }

  return <AppPage eyebrow="ADMIN" title="Admin console" description="Restricted management area for tasks, withdrawals, users, ads, referrals, moderation and Telegram."><div className="stats"><article><span>Users</span><strong>—</strong><small>Configure analytics</small></article><article><span>Withdrawals</span><strong>—</strong><small>Review queue</small></article><article><span>Tasks</span><strong>—</strong><small>Manage inventory</small></article><article><span>Telegram</span><strong>—</strong><small>Bot status</small></article></div></AppPage>;
}
