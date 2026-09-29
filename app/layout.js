import './globals.css';
import AppShell from '../components/AppShell';

export const metadata={title:'HillsByte — Rewards',description:'HillsByte rewards and task platform'};
export default function RootLayout({children}){return <html lang="en"><body><AppShell>{children}</AppShell></body></html>}
