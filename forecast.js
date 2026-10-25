/* Ennustelogiikka: puhtaita funktioita, ei DOM-riippuvuuksia.
   Päivämäärät käsitellään merkkijonoina muodossa YYYY-MM-DD. */
(function (root) {
  'use strict';

  const DAY = 86400000;

  function parse(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  function fmt(dt) {
    return dt.toISOString().slice(0, 10);
  }
  function localToday() {
    const n = new Date();
    return fmt(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
  }
  function addDays(s, n) {
    return fmt(new Date(parse(s).getTime() + n * DAY));
  }
  function diffDays(a, b) {
    return Math.round((parse(b) - parse(a)) / DAY);
  }
  function daysInMonth(y, m) { // m = 1..12
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }
  function ymOf(s) {
    return s.slice(0, 7);
  }
  function makeDate(y, m, d) { // m voi ylivuotaa, d leikataan kuukauden pituuteen
    const yy = y + Math.floor((m - 1) / 12);
    const mm = ((m - 1) % 12 + 12) % 12 + 1;
    const dd = Math.min(d, daysInMonth(yy, mm));
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  function addMonths(s, n) {
    const [y, m, d] = s.split('-').map(Number);
    return makeDate(y, m + n, d);
  }
  function weekday(s) { // 0 = su, 6 = la
    return parse(s).getUTCDay();
  }

  /* Siirto viikonlopulta: 'prev' = edellinen arkipäivä (palkat), 'next' = seuraava, 'none'. */
  function adjustWeekend(s, rule) {
    if (!rule || rule === 'none') return s;
    let d = s;
    const step = rule === 'prev' ? -1 : 1;
    while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, step);
    return d;
  }

  /* Toistuvan erän nimelliset päivät väliltä [from, to]. */
  function nominalDates(item, from, to) {
    const out = [];
    const start = item.start;
    const end = item.end && item.end < to ? item.end : to;
    if (!start || start > end) return out;
    const interval = Math.max(1, Number(item.interval) || 1);

    if (item.freq === 'once') {
      if (start >= from && start <= end) out.push(start);
      return out;
    }
    if (item.freq === 'weekly') {
      const stepDays = 7 * interval;
      let d = start;
      if (d < from) d = addDays(d, Math.ceil(diffDays(d, from) / stepDays) * stepDays);
      for (; d <= end; d = addDays(d, stepDays)) out.push(d);
      return out;
    }
    if (item.freq === 'monthly' || item.freq === 'yearly') {
      const stepMonths = item.freq === 'yearly' ? 12 * interval : interval;
      const [sy, sm] = start.split('-').map(Number);
      const day = item.freq === 'yearly' ? Number(start.slice(8, 10)) : Number(item.day) || Number(start.slice(8, 10));
      for (let k = 0; k < 2000; k++) {
        const d = makeDate(sy, sm + k * stepMonths, day);
        if (d > end) break;
        if (d >= from && d >= start) out.push(d);
      }
      return out;
    }
    return out;
  }

  function occKey(itemId, nominal) {
    return itemId + '|' + nominal;
  }

  /* Nykyinen saldo = viimeisin saldokirjaus + sen jälkeen kirjatut tapahtumat.
     Tili 'bank' on pankkitili, 'card' luottokortti (saldo = −velka). */
  function currentBalance(log, account) {
    account = account || 'bank';
    const mine = log.filter((e) => (e.account || 'bank') === account);
    let base = null;
    for (const e of mine) if (e.type === 'balance' && (!base || e.ts > base.ts)) base = e;
    let bal = base ? base.amount : 0;
    for (const e of mine) if (e.type !== 'balance' && (!base || e.ts > base.ts)) bal += e.amount;
    return { balance: bal, hasBalance: !!base, since: base ? base.ts : null };
  }

  function budgetSpent(log, budgetId, ym) {
    let s = 0;
    for (const e of log) if (e.budgetId === budgetId && ymOf(e.date) === ym) s += -e.amount;
    return s;
  }

  const OVERDUE_LOOKBACK_DAYS = 120;

  function buildForecast(state, today) {
    today = today || localToday();
    const settings = state.settings || {};
    const horizonMonths = Number(settings.horizonMonths) || 6;
    const buffer = Number(settings.buffer) || 0;
    const end = addMonths(today, horizonMonths);
    const log = state.log || [];
    const overrides = state.overrides || {};
    const cur = currentBalance(log);

    const events = [];
    const overdue = [];
    const lookFrom = addDays(today, -OVERDUE_LOOKBACK_DAYS);

    for (const item of state.items || []) {
      if (item.freq === 'budget') continue;
      const sign = item.kind === 'income' ? 1 : -1;
      // Haetaan hieman laajemmalta, koska siirretty erä voi osua ikkunaan.
      for (const nominal of nominalDates(item, addDays(lookFrom, -7), addDays(end, 7))) {
        if (item.since && nominal < item.since) continue;
        const key = occKey(item.id, nominal);
        const ov = overrides[key] || {};
        if (ov.status === 'confirmed' || ov.status === 'skipped') continue;
        const date = ov.date || adjustWeekend(nominal, item.weekendRule);
        const amount = sign * (ov.amount != null ? Number(ov.amount) : Number(item.amount));
        if (date > end || date < lookFrom) continue;
        const ev = {
          key, itemId: item.id, name: item.name, category: item.category || '',
          kind: item.kind, amount, nominal, date,
          changed: ov.amount != null || !!ov.date,
          overdue: date < today,
        };
        (ev.overdue ? overdue : events).push(ev);
      }
    }
    // Luottokortti: velka ja automaattiset laskun maksut pankkitililtä.
    const card = state.card && state.card.enabled ? state.card : null;
    const cardInfo = { enabled: !!card, debt: 0, limit: 0, available: 0, interestMonthly: 0 };
    const cardPay = {}; // date -> maksettu summa (vähentää velkaa)
    if (card) {
      const debt0 = Math.max(0, -currentBalance(log, 'card').balance);
      const limit = Number(card.limit) || 0;
      Object.assign(cardInfo, {
        debt: debt0, limit, available: Math.max(0, limit - debt0),
        interestMonthly: debt0 * (Number(card.interest) || 0) / 100 / 12,
      });
      const mode = card.payMode || 'none';
      const pay = { id: 'card', freq: 'monthly', start: card.payStart || today, day: Number(card.payDay) || 1, interval: 1 };
      if (mode !== 'none' && debt0 > 0.005) {
        let debt = debt0;
        const cands = [];
        for (const nominal of nominalDates(pay, addDays(lookFrom, -7), addDays(end, 7))) {
          if (card.since && nominal < card.since) continue;
          const key = occKey('card', nominal);
          const ov = overrides[key] || {};
          if (ov.status === 'confirmed' || ov.status === 'skipped') continue;
          const date = ov.date || adjustWeekend(nominal, card.weekendRule || 'next');
          if (date > end || date < lookFrom) continue;
          cands.push({ key, nominal, date, ov });
        }
        cands.sort((a, b) => a.date.localeCompare(b.date));
        for (const c of cands) {
          if (debt <= 0.005) break;
          let amt = c.ov.amount != null ? Number(c.ov.amount)
            : mode === 'full' ? debt : Math.min(Number(card.payAmount) || 0, debt);
          amt = Math.min(amt, debt);
          if (amt <= 0.005) continue;
          debt -= amt;
          const ev = {
            key: c.key, itemId: 'card', transfer: 'card', name: (card.name || 'Luottokortti') + ': lasku',
            category: '', kind: 'expense', amount: -amt, nominal: c.nominal, date: c.date,
            changed: c.ov.amount != null || !!c.ov.date, overdue: c.date < today,
          };
          (ev.overdue ? overdue : events).push(ev);
          const d = ev.overdue ? today : ev.date;
          cardPay[d] = (cardPay[d] || 0) + amt;
        }
      }
    }

    events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
    overdue.sort((a, b) => a.date.localeCompare(b.date));

    // Budjetit (esim. ruoka 400 €/kk) jaetaan tasaisesti päiville.
    const budgetDaily = {}; // date -> summa (negatiivinen)
    const budgetRows = [];  // yksi rivi per budjetti per kuukausi
    for (const item of state.items || []) {
      if (item.freq !== 'budget') continue;
      const amt = Number(item.amount) || 0;
      for (let d = today; d <= end;) {
        const ym = ymOf(d);
        const [y, m] = ym.split('-').map(Number);
        const dim = daysInMonth(y, m);
        const monthEnd = `${ym}-${String(dim).padStart(2, '0')}`;
        const lastDay = monthEnd < end ? monthEnd : end;
        const activeFrom = item.start && item.start > d ? item.start : d;
        const activeTo = item.end && item.end < lastDay ? item.end : lastDay;
        if (activeFrom <= activeTo) {
          const days = diffDays(activeFrom, activeTo) + 1;
          let total;
          if (ym === ymOf(today)) {
            const spent = budgetSpent(log, item.id, ym);
            total = Math.max(0, amt - spent);
            budgetRows.push({ itemId: item.id, name: item.name, ym, date: activeFrom, amount: -total, spent, budget: amt, current: true });
          } else {
            total = amt * days / dim;
            budgetRows.push({ itemId: item.id, name: item.name, ym, date: activeFrom, amount: -total, spent: 0, budget: amt, current: false });
          }
          const perDay = total / days;
          for (let x = activeFrom; x <= activeTo; x = addDays(x, 1)) {
            budgetDaily[x] = (budgetDaily[x] || 0) - perDay;
          }
        }
        d = addDays(monthEnd, 1);
      }
    }

    // Päiväkohtainen saldokäyrä. Myöhässä olevat erät oletetaan tapahtuviksi tänään.
    const byDate = {};
    for (const e of events) (byDate[e.date] = byDate[e.date] || []).push(e);
    const days = [];
    let bal = cur.balance;
    let credit = cardInfo.available;
    let min = { balance: Infinity, date: today };
    let minTotal = { balance: Infinity, date: today }; // saldo + käytettävissä oleva luotto
    let firstNegative = null;
    for (let d = today; d <= end; d = addDays(d, 1)) {
      let change = 0;
      if (d === today) for (const e of overdue) change += e.amount;
      for (const e of byDate[d] || []) change += e.amount;
      change += budgetDaily[d] || 0;
      bal += change;
      if (cardInfo.enabled) credit = Math.min(cardInfo.limit, credit + (cardPay[d] || 0));
      days.push({ date: d, balance: bal, change, credit: cardInfo.enabled ? credit : 0 });
      if (bal < min.balance) min = { balance: bal, date: d };
      if (bal + credit < minTotal.balance) minTotal = { balance: bal + (cardInfo.enabled ? credit : 0), date: d };
      if (bal < 0 && !firstNegative) firstNegative = d;
    }

    // Kuukausiyhteenvedot
    const monthsMap = {};
    const monthOf = (ym) => (monthsMap[ym] = monthsMap[ym] || { ym, income: 0, expense: 0, endBalance: 0 });
    for (const e of overdue) {
      const m = monthOf(ymOf(today));
      if (e.amount > 0) m.income += e.amount; else m.expense += -e.amount;
    }
    for (const e of events) {
      const m = monthOf(ymOf(e.date));
      if (e.amount > 0) m.income += e.amount; else m.expense += -e.amount;
    }
    for (const r of budgetRows) monthOf(r.ym).expense += -r.amount;
    for (const day of days) monthOf(ymOf(day.date)).endBalance = day.balance;
    const months = Object.values(monthsMap).sort((a, b) => a.ym.localeCompare(b.ym));

    const nextIncome = events.find((e) => e.amount > 0) || null;
    const safeToSpend = Math.max(0, min.balance - buffer);
    // Kuinka paljon hätävaraa (luottoa) tarvitaan enimmillään, jotta tili ei mene miinukselle.
    const creditNeeded = Math.max(0, -min.balance);
    let status = 'good';
    if (min.balance < 0) status = cardInfo.enabled && minTotal.balance >= 0 ? 'credit' : 'critical';
    else if (min.balance < buffer) status = 'warning';

    return {
      today, end, buffer,
      current: cur.balance, hasBalance: cur.hasBalance,
      events, overdue, budgetRows, days, months,
      min, minTotal, firstNegative, nextIncome, safeToSpend, status, card: cardInfo, creditNeeded,
    };
  }

  const api = {
    parse, fmt, localToday, addDays, addMonths, diffDays, daysInMonth, ymOf, weekday,
    adjustWeekend, nominalDates, occKey, currentBalance, budgetSpent, buildForecast,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Forecast = api;
})(this);
