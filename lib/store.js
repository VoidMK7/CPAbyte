export const rates = {
  USD: 1,
  NGN: 1550,
  EUR: 0.86,
  GBP: 0.74,
};

export const currencies = ['USD', 'NGN', 'EUR', 'GBP'];

export function money(usd, currency = 'USD') {
  const amount = Number(usd || 0);
  const rate = rates[currency] ?? rates.USD;
  const converted = amount * rate;

  if (currency === 'NGN') {
    return `₦${converted.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }

  if (currency === 'EUR') {
    return `€${converted.toFixed(2)}`;
  }

  if (currency === 'GBP') {
    return `£${converted.toFixed(2)}`;
  }

  return `$${converted.toFixed(2)}`;
}

/*
  IMPORTANT:
  The user's actual balance is always stored in USD.
  Changing the display currency only changes how it is displayed.
  It does NOT replace or reset the stored balance.
*/

export function getSettings() {
  if (typeof window === 'undefined') {
    return {
      currency: 'USD',
      balance: 0,
    };
  }

  const currency = localStorage.getItem('hb_currency') || 'USD';

  const storedBalance = localStorage.getItem('hb_balance_usd');

  const balance =
    storedBalance === null ? 0 : Number(storedBalance);

  return {
    currency: currencies.includes(currency) ? currency : 'USD',
    balance: Number.isFinite(balance) ? balance : 0,
  };
}

export function setDisplayCurrency(currency) {
  if (typeof window === 'undefined') return;

  if (!currencies.includes(currency)) return;

  localStorage.setItem('hb_currency', currency);

  window.dispatchEvent(new Event('hb-currency'));
}

export function setBalanceUsd(balance) {
  if (typeof window === 'undefined') return;

  const amount = Number(balance);

  if (!Number.isFinite(amount)) return;

  localStorage.setItem('hb_balance_usd', String(amount));

  window.dispatchEvent(new Event('hb-balance'));
}
