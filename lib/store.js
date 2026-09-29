export const rates={USD:1,NGN:1550,EUR:.86,GBP:.74};
export function money(usd,currency='USD'){const n=Number(usd||0)*rates[currency];return currency==='NGN'?`₦${n.toLocaleString(undefined,{maximumFractionDigits:0})`}:currency==='EUR'?`€${n.toFixed(2)}`:currency==='GBP'?`£${n.toFixed(2)}`:`$${n.toFixed(2)}`}
export function getSettings(){if(typeof window==='undefined')return {currency:'USD',balance:0};const currency=localStorage.getItem('hb_currency')||'USD';const balance=Number(localStorage.getItem('hb_balance_usd')||0);return {currency,balance}}
