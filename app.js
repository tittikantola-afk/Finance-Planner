/* Talous – käyttöliittymä. Kaikki tiedot tallentuvat vain tähän laitteeseen (localStorage). */
(function () {
  'use strict';

  const F = window.Forecast;
  const STORE_KEY = 'talous.v1';

  // ---------- Tila ----------

  function defaultState() {
    return {
      version: 1,
      settings: { buffer: 300, horizonMonths: 6 },
      items: [],
      overrides: {},
      log: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      return Object.assign(defaultState(), s, { settings: Object.assign(defaultState().settings, s.settings) });
    } catch (e) {
      return defaultState();
    }
  }

  let state = load();
  let ui = { view: 'overview', chartRange: 'all' };
  try { ui.chartRange = localStorage.getItem('talous.chartRange') || 'all'; } catch (e) { /* ignore */ }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Tallennus epäonnistui – vie varmuuskopio!');
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // Pyydetään selainta olemaan poistamatta tietoja.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Muotoilu ----------

  const eur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' });
  const eur0 = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const money = (n) => eur.format(n);
  const money0 = (n) => eur0.format(Math.round(n));
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + eur.format(Math.abs(n));
  const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  const MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];

  function dateShort(s) {
    const [, m, d] = s.split('-').map(Number);
    return `${WD[F.weekday(s)]} ${d}.${m}.`;
  }
  function dateLong(s) {
    const [y, m, d] = s.split('-').map(Number);
    return `${d}.${m}.${y}`;
  }
  function monthName(ym) {
    const [y, m] = ym.split('-').map(Number);
    const name = MONTHS[m - 1];
    return name.charAt(0).toUpperCase() + name.slice(1) + (y !== new Date().getFullYear() ? ' ' + y : '');
  }
  function relDays(s, today) {
    const n = F.diffDays(today, s);
    if (n === 0) return 'tänään';
    if (n === 1) return 'huomenna';
    if (n === -1) return 'eilen';
    return n > 0 ? `${n} päivän päästä` : `${-n} päivää sitten`;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function num(v) {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }
  function freqText(item) {
    const n = Number(item.interval) || 1;
    switch (item.freq) {
      case 'monthly': {
        const day = Number(item.start.slice(8, 10));
        const dayText = day >= 29 ? `${day}. pv (tai kuun viim.)` : `${day}. pv`;
        return (n === 1 ? 'Kuukausittain' : `Joka ${n}. kuukausi`) + ', ' + dayText;
      }
      case 'weekly':
        return (n === 1 ? 'Viikoittain' : n === 2 ? 'Joka toinen viikko' : `Joka ${n}. viikko`) + ', ' + WD[F.weekday(item.start)];
      case 'yearly':
        return 'Vuosittain ' + item.start.slice(8, 10).replace(/^0/, '') + '.' + item.start.slice(5, 7).replace(/^0/, '') + '.';
      case 'once':
        return 'Kerran ' + dateLong(item.start);
      case 'budget':
        return 'Kuukausibudjetti, jaetaan tasaisesti';
      default:
        return '';
    }
  }
  function monthlyEquivalent(item) {
    const a = num(item.amount);
    const n = Number(item.interval) || 1;
    switch (item.freq) {
      case 'monthly': return a / n;
      case 'weekly': return a * 52 / 12 / n;
      case 'yearly': return a / 12 / n;
      case 'budget': return a;
      default: return 0;
    }
  }

  // ---------- Ikonit ----------

  const ICON = {
    good: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.2 3L17 9" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5L22.5 21h-21z"/><path d="M12 9.5v5M12 17.6v.1" stroke="#1a1a19" stroke-width="2.4" stroke-linecap="round"/></svg>',
    credit: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="4.5" width="21" height="15" rx="3"/><path d="M1.5 9.5h21" stroke="#fff" stroke-width="2.2"/><path d="M5.5 15h5" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    critical: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
    chevron: '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  // ---------- Näkymät ----------

  const app = document.getElementById('app');
  const titles = { overview: 'Yleiskuva', upcoming: 'Tulevat', plan: 'Suunnitelma', history: 'Historia' };

  function render() {
    const fc = F.buildForecast(state);
    document.getElementById('view-title').textContent = titles[ui.view];
    document.querySelectorAll('.tabbar [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
    const badge = fc.overdue.length;
    const upBtn = document.querySelector('.tabbar [data-view="upcoming"]');
    upBtn.classList.toggle('has-badge', badge > 0);
    upBtn.dataset.badge = badge;

    if (ui.view === 'overview') app.innerHTML = viewOverview(fc);
    else if (ui.view === 'upcoming') app.innerHTML = viewUpcoming(fc);
    else if (ui.view === 'plan') app.innerHTML = viewPlan();
    else app.innerHTML = viewHistory();

    if (ui.view === 'overview') drawChart(fc);
  }

  function viewOverview(fc) {
    let h = '';
    if (!fc.hasBalance) {
      h += `<section class="card onboarding">
        <h2>Tervetuloa! 👋</h2>
        <p>Kolme askelta, niin näet tulevaisuuden:</p>
        <ol>
          <li><b>Syötä tilisi saldo</b> tänään.</li>
          <li><b>Lisää tulot</b> (palkka, tuet) Suunnitelma-välilehdellä.</li>
          <li><b>Lisää kulut</b> (vuokra, laskut, tilaukset) ja kuukausibudjetit (ruoka ym.).</li>
        </ol>
        <button class="btn primary block" data-action="balance">Syötä saldo</button>
      </section>`;
    }

    const st = fc.status;
    const statusText = {
      good: ['Rahat riittää', `Alin saldo seuraavan ${state.settings.horizonMonths} kk aikana on ${money0(fc.min.balance)} (${dateShort(fc.min.date)}).`],
      warning: ['Tiukkaa', `Saldo laskee puskurin (${money0(fc.buffer)}) alle: alimmillaan ${money0(fc.min.balance)} ${dateShort(fc.min.date)}.`],
      credit: ['Riittää luottokortin avulla', `Tili menee miinukselle ${fc.firstNegative ? relDays(fc.firstNegative, fc.today) + ' (' + dateShort(fc.firstNegative) + ')' : ''}. Tarvitset hätävaraa enimmillään ${money0(fc.creditNeeded)} – luottoa on käytettävissä ${money0(fc.card.available)}.`],
      critical: ['Raha ei riitä', `Saldo menee miinukselle ${fc.firstNegative ? relDays(fc.firstNegative, fc.today) + ' (' + dateShort(fc.firstNegative) + ')' : ''}. Alimmillaan ${money0(fc.min.balance)} (${dateShort(fc.min.date)})`],
    }[st];
    if (st === 'critical' && fc.card.enabled) statusText[1] += ` Luottokorttikaan (${money0(fc.card.available)}) ei riitä kattamaan vajetta.`;
    if (st === 'critical' && !fc.card.enabled) statusText[1] += ' Voit lisätä luottokortin hätävaraksi Suunnitelma-välilehdellä.';

    const balEntry = latestBalanceEntry();
    h += `<section class="hero">
      <div class="label">Saldo nyt</div>
      <div class="big ${fc.current < 0 ? 'neg' : ''}">${money(fc.current)}</div>
      <div class="sub">${balEntry ? 'Pankkisaldo tarkistettu ' + relDays(balEntry.date, fc.today) : 'Saldoa ei ole vielä syötetty'}
        · <button class="link" data-action="balance">Päivitä saldo</button></div>
    </section>`;

    h += `<section class="status status-${st}" role="status">
      <span class="status-icon">${ICON[st]}</span>
      <div><div class="status-title">${statusText[0]}</div><div class="status-text">${statusText[1]}</div></div>
    </section>`;

    if (fc.overdue.length) {
      h += `<button class="card alert" data-goto="upcoming">
        <b>${fc.overdue.length} ${fc.overdue.length === 1 ? 'erä odottaa' : 'erää odottaa'} vahvistusta</b>
        <span>Merkitse toteutuneeksi tai ohita, jotta ennuste pysyy tarkkana.</span>${ICON.chevron}
      </button>`;
    }

    const ni = fc.nextIncome;
    h += `<section class="tiles">
      <div class="tile">
        <div class="label">Turvallisesti käytettävissä</div>
        <div class="value">${money0(fc.safeToSpend)}</div>
        <div class="hint">ilman että saldo alittaa ${money0(fc.buffer)} puskurin</div>
      </div>
      <div class="tile">
        <div class="label">Seuraava tulo</div>
        ${ni ? `<div class="value">${money0(ni.amount)}</div><div class="hint">${esc(ni.name)} · ${dateShort(ni.date)} (${relDays(ni.date, fc.today)})</div>`
        : '<div class="value muted">–</div><div class="hint">Lisää tulot suunnitelmaan</div>'}
      </div>
    </section>`;

    if (fc.card.enabled) {
      const c = fc.card;
      const pct = c.limit > 0 ? Math.min(100, (c.debt / c.limit) * 100) : 0;
      h += `<button class="card credit-card" data-action="card">
        <div class="card-head"><h2>Hätävara: ${esc(state.card.name || 'Luottokortti')}</h2>${ICON.chevron}</div>
        <div class="credit-row"><div><div class="label">Käytettävissä</div><div class="value">${money0(c.available)}</div></div>
          <div class="right"><div class="label">Velka</div><div class="value">${money0(c.debt)}</div></div></div>
        <div class="bar" role="img" aria-label="Velka ${money0(c.debt)} luottorajasta ${money0(c.limit)}"><i style="width:${pct}%"></i></div>
        <div class="hint">Luottoraja ${money0(c.limit)}${c.interestMonthly > 0.5 ? ` · korkoa n. ${money0(c.interestMonthly)}/kk nykyisellä velalla` : ''}</div>
      </button>`;
    }

    const ranges = [['1', '1 kk'], ['3', '3 kk'], ['all', `${state.settings.horizonMonths} kk`]];
    h += `<section class="card">
      <div class="card-head">
        <h2>Saldoennuste</h2>
        <div class="chips" role="group" aria-label="Aikaväli">
          ${ranges.map(([v, l]) => `<button class="chip ${ui.chartRange === v ? 'on' : ''}" data-range="${v}">${l}</button>`).join('')}
        </div>
      </div>
      <div id="chart" class="chart"></div>
      <div class="chart-legend"><span class="key line"></span>Saldo <span class="key dash"></span>Puskuri${fc.card.enabled && fc.min.balance < 0 ? '<span class="key floor"></span>Luottoraja' : ''}</div>
    </section>`;

    h += `<section class="card">
      <h2>Kuukaudet</h2>
      <table class="months">
        <thead><tr><th>Kuukausi</th><th>Tulot</th><th>Menot</th><th>Loppusaldo</th></tr></thead>
        <tbody>${fc.months.map((m) => `<tr>
          <td>${monthName(m.ym)}</td>
          <td class="pos">${money0(m.income)}</td>
          <td>${money0(m.expense)}</td>
          <td class="${m.endBalance < 0 ? 'neg' : m.endBalance < fc.buffer ? 'warn' : ''}"><b>${money0(m.endBalance)}</b></td>
        </tr>`).join('')}</tbody>
      </table>
    </section>`;
    return h;
  }

  function eventRow(e, balanceAfter, today) {
    return `<button class="row ev ${e.amount > 0 ? 'income' : 'expense'}" data-occ="${esc(e.key)}">
      <div class="row-date"><b>${dateShort(e.date).split(' ')[1]}</b><span>${WD[F.weekday(e.date)]}</span></div>
      <div class="row-main">
        <div class="row-title">${esc(e.name)}${e.changed ? ' <span class="tag">muutettu</span>' : ''}</div>
        <div class="row-sub">${e.overdue ? '<span class="tag warn">' + relDays(e.date, today) + '</span>' : balanceAfter != null ? 'Saldo sen jälkeen ' + money0(balanceAfter) : ''}</div>
      </div>
      <div class="row-amt ${e.amount > 0 ? 'pos' : ''}">${signed(e.amount)}</div>
    </button>`;
  }

  function viewUpcoming(fc) {
    let h = '';
    if (fc.overdue.length) {
      h += `<section class="group">
        <h3 class="group-title warn">Odottaa vahvistusta</h3>
        <p class="group-help">Nämä olisi pitänyt jo tapahtua. Ennuste olettaa niiden tapahtuvan tänään, kunnes vahvistat tai ohitat ne.</p>
        <div class="list">${fc.overdue.map((e) => `<div class="overdue-item">
          ${eventRow(e, null, fc.today)}
          <div class="row-actions">
            <button class="btn small primary" data-confirm="${esc(e.key)}">Toteutui</button>
            <button class="btn small" data-occ="${esc(e.key)}">Muuta…</button>
            <button class="btn small ghost" data-skip="${esc(e.key)}">Ohita</button>
          </div>
        </div>`).join('')}</div>
      </section>`;
    }

    const balAt = {};
    for (const d of fc.days) balAt[d.date] = d.balance;
    const byMonth = {};
    for (const e of fc.events) (byMonth[F.ymOf(e.date)] = byMonth[F.ymOf(e.date)] || []).push(e);
    for (const r of fc.budgetRows) (byMonth[r.ym] = byMonth[r.ym] || []);
    const months = Object.keys(byMonth).sort();

    if (!months.length && !fc.overdue.length) {
      h += `<div class="empty">Ei tulevia tapahtumia.<br>Lisää tulot ja menot <button class="link" data-goto="plan">Suunnitelmaan</button>.</div>`;
    }

    for (const ym of months) {
      const budgets = fc.budgetRows.filter((r) => r.ym === ym);
      h += `<section class="group"><h3 class="group-title">${monthName(ym)}</h3>`;
      if (budgets.length) {
        h += '<div class="budgets">' + budgets.map((b) => {
          if (b.current) {
            const pct = b.budget > 0 ? Math.min(100, (b.spent / b.budget) * 100) : 0;
            return `<div class="budget">
              <div class="budget-head"><span>${esc(b.name)}</span><span>${money0(b.budget - b.spent)} jäljellä</span></div>
              <div class="bar" role="img" aria-label="Käytetty ${money0(b.spent)} / ${money0(b.budget)}"><i style="width:${pct}%" class="${b.spent > b.budget ? 'over' : ''}"></i></div>
              <div class="budget-sub">Käytetty ${money0(b.spent)} / ${money0(b.budget)}</div>
            </div>`;
          }
          return `<div class="budget"><div class="budget-head"><span>${esc(b.name)}</span><span>−${money0(-b.amount)}</span></div>
            <div class="budget-sub">Budjetti, jaetaan tasaisesti kuukauden päiville</div></div>`;
        }).join('') + '</div>';
      }
      h += '<div class="list">' + (byMonth[ym] || []).map((e) => eventRow(e, balAt[e.date], fc.today)).join('') + '</div></section>';
    }
    return h;
  }

  function viewPlan() {
    const items = state.items.slice().sort((a, b) => num(b.amount) - num(a.amount));
    const inc = items.filter((i) => i.kind === 'income' && i.freq !== 'budget');
    const exp = items.filter((i) => i.kind === 'expense' && i.freq !== 'budget');
    const bud = items.filter((i) => i.freq === 'budget');
    const sum = (arr) => arr.reduce((s, i) => s + monthlyEquivalent(i), 0);
    const mi = sum(inc), me = sum(exp) + sum(bud);

    const rows = (arr) => arr.length ? arr.map((i) => `<button class="row" data-item="${i.id}">
        <div class="row-main"><div class="row-title">${esc(i.name)}</div><div class="row-sub">${esc(freqText(i))}${i.end ? ' · päättyy ' + dateLong(i.end) : ''}</div></div>
        <div class="row-amt ${i.kind === 'income' ? 'pos' : ''}">${i.kind === 'income' ? '+' : '−'}${money(num(i.amount))}</div>${ICON.chevron}
      </button>`).join('') : '<div class="row empty-row">Ei vielä yhtään</div>';

    return `<section class="tiles three">
        <div class="tile"><div class="label">Tulot / kk</div><div class="value pos">${money0(mi)}</div></div>
        <div class="tile"><div class="label">Menot / kk</div><div class="value">${money0(me)}</div></div>
        <div class="tile"><div class="label">Jää yli / kk</div><div class="value ${mi - me < 0 ? 'neg' : ''}">${money0(mi - me)}</div></div>
      </section>
      <p class="group-help">Keskiarvo kuukautta kohden toistuvista eristä (kertaerät eivät sisälly).</p>
      <section class="group"><div class="group-head"><h3 class="group-title">Tulot</h3><button class="btn small" data-new="income">+ Lisää</button></div><div class="list">${rows(inc)}</div></section>
      <section class="group"><div class="group-head"><h3 class="group-title">Menot</h3><button class="btn small" data-new="expense">+ Lisää</button></div><div class="list">${rows(exp)}</div></section>
      <section class="group"><div class="group-head"><h3 class="group-title">Luottokortti (hätävara)</h3></div>
        <div class="list">${cardRow()}</div></section>
      <section class="group"><div class="group-head"><h3 class="group-title">Kuukausibudjetit</h3><button class="btn small" data-new="budget">+ Lisää</button></div>
        <p class="group-help">Esim. ruoka, polttoaine, viihde. Kirjaa ostot +-napista budjetille, niin näet paljonko on jäljellä ja ennuste tarkentuu.</p>
        <div class="list">${rows(bud)}</div></section>`;
  }

  function cardRow() {
    const c = state.card;
    if (!c || !c.enabled) {
      return `<button class="row" data-action="card"><div class="row-main"><div class="row-title">Lisää luottokortti</div>
        <div class="row-sub">Näet, riittääkö luotto hätävaraksi, jos tilin rahat eivät riitä.</div></div>${ICON.chevron}</button>`;
    }
    const debt = Math.max(0, -F.currentBalance(state.log, 'card').balance);
    const plan = { none: 'Ei maksusuunnitelmaa', fixed: `Lyhennys ${money0(num(c.payAmount))}/kk, ${c.payDay}. pv`, full: `Koko velka kerralla, ${c.payDay}. pv` }[c.payMode || 'none'];
    return `<button class="row" data-action="card"><div class="row-main"><div class="row-title">${esc(c.name || 'Luottokortti')}</div>
      <div class="row-sub">Raja ${money0(num(c.limit))} · velka ${money0(debt)} · ${plan}</div></div>
      <div class="row-amt">${money0(Math.max(0, num(c.limit) - debt))}</div>${ICON.chevron}</button>`;
  }

  function latestBalanceEntry() {
    let b = null;
    for (const e of state.log) if (e.type === 'balance' && (e.account || 'bank') === 'bank' && (!b || e.ts > b.ts)) b = e;
    return b;
  }

  function viewHistory() {
    const log = state.log.slice().sort((a, b) => b.ts - a.ts);
    const typeLabel = { adhoc: 'Kirjaus', confirm: 'Toteutunut erä', balance: 'Saldon päivitys' };
    const cardName = (state.card && state.card.name) || 'Luottokortti';
    const list = log.length ? log.map((e) => `<div class="row hist">
        <div class="row-main">
          <div class="row-title">${e.type === 'balance' ? (e.account === 'card' ? 'Luottokortin velka asetettu' : 'Saldo asetettu') : esc(e.name)}</div>
          <div class="row-sub">${e.account === 'card' ? esc(cardName) + ' · ' : ''}${typeLabel[e.type]} · ${dateLong(e.date)}${e.budgetId ? ' · ' + esc(budgetName(e.budgetId)) : ''}</div>
        </div>
        <div class="row-amt ${e.type !== 'balance' && e.amount > 0 ? 'pos' : ''}">${e.type === 'balance' ? money(e.account === 'card' ? -e.amount : e.amount) : signed(e.amount)}</div>
        <button class="icon-btn" data-dellog="${e.id}" aria-label="Poista kirjaus">×</button>
      </div>`).join('') : '<div class="row empty-row">Ei vielä kirjauksia</div>';

    const s = state.settings;
    return `<section class="group"><h3 class="group-title">Kirjaukset</h3>
        <p class="group-help">Kirjauksen poistaminen peruu sen vaikutuksen saldoon. Vahvistetun erän poistaminen palauttaa sen ennusteeseen.</p>
        <div class="list">${list}</div></section>

      <section class="group"><h3 class="group-title">Asetukset</h3>
        <div class="card form-card">
          <label class="field"><span>Turvapuskuri (€)</span>
            <input type="text" inputmode="decimal" id="set-buffer" value="${esc(s.buffer)}">
            <small>Summa, jonka alle et halua saldon laskevan. Varoitus näytetään, jos ennuste alittaa sen.</small></label>
          <label class="field"><span>Ennustejakso</span>
            <select id="set-horizon">${[3, 6, 12, 24].map((n) => `<option value="${n}" ${Number(s.horizonMonths) === n ? 'selected' : ''}>${n} kuukautta</option>`).join('')}</select></label>
        </div>
      </section>

      <section class="group"><h3 class="group-title">Varmuuskopio</h3>
        <p class="group-help">Tiedot ovat vain tässä puhelimessa. Vie varmuuskopio esim. iCloud Driveen säännöllisesti – ja aina ennen kuin poistat sovelluksen kotivalikosta.</p>
        <div class="btn-row">
          <button class="btn" data-action="export">Vie varmuuskopio</button>
          <label class="btn">Tuo varmuuskopio<input type="file" id="import-file" accept="application/json,.json" hidden></label>
        </div>
        <button class="btn ghost danger block" data-action="reset">Tyhjennä kaikki tiedot</button>
      </section>

      <section class="group"><h3 class="group-title">Asenna iPhoneen</h3>
        <p class="group-help">Avaa tämä sivu Safarilla → Jaa-painike (neliö ja nuoli) → <b>Lisää Koti-valikkoon</b>. Sovellus avautuu sen jälkeen omana appinaan ja toimii myös ilman verkkoa.</p>
      </section>`;
  }

  function budgetName(id) {
    const b = state.items.find((i) => i.id === id);
    return b ? b.name : 'poistettu budjetti';
  }

  // ---------- Kaavio ----------

  function drawChart(fc) {
    const el = document.getElementById('chart');
    if (!el) return;
    let days = fc.days;
    if (ui.chartRange !== 'all') {
      const until = F.addMonths(fc.today, Number(ui.chartRange));
      days = days.filter((d) => d.date <= until);
    }
    if (days.length < 2) { el.innerHTML = ''; return; }

    const W = Math.max(280, el.clientWidth), H = 200;
    const pad = { l: 8, r: 8, t: 16, b: 24 };
    const vals = days.map((d) => d.balance);
    const showFloor = fc.card.enabled && Math.min(...vals) < 0;
    const floors = days.map((d) => -d.credit);
    let lo = Math.min(0, fc.buffer, ...vals, ...(showFloor ? floors : [])), hi = Math.max(fc.buffer, ...vals);
    if (hi === lo) hi = lo + 100;
    const span = hi - lo; lo -= span * 0.06; hi += span * 0.1;
    const x = (i) => pad.l + (i / (days.length - 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

    // Porrasviiva: saldo muuttuu päivän aikana kerralla.
    let path = `M${x(0)},${y(vals[0])}`;
    for (let i = 1; i < days.length; i++) path += `H${x(i)}V${y(vals[i])}`;
    const area = path + `V${y(Math.max(lo, 0))}H${x(0)}Z`;

    // Kuukausien rajat x-akselille
    const ticks = [];
    days.forEach((d, i) => { if (d.date.endsWith('-01')) ticks.push(i); });
    const minIdx = vals.indexOf(Math.min(...vals));

    const lbl = (v) => Math.abs(v) >= 10000 ? Math.round(v / 1000) + ' t€' : Math.round(v) + ' €';
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Saldoennuste, alin ${money0(fc.min.balance)}">
      ${ticks.map((i) => `<line class="grid" x1="${x(i)}" x2="${x(i)}" y1="${pad.t}" y2="${H - pad.b}"/>
        <text class="axis" x="${x(i) + 3}" y="${H - 8}">${MONTHS[Number(days[i].date.slice(5, 7)) - 1].slice(0, 3)}</text>`).join('')}
      ${lo < 0 ? `<line class="zero" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>` : ''}
      <path class="area" d="${area}"/>
      ${fc.buffer > 0 ? `<line class="buffer" x1="${pad.l}" x2="${W - pad.r}" y1="${y(fc.buffer)}" y2="${y(fc.buffer)}"/>` : ''}
      ${showFloor ? `<path class="floor" d="${'M' + floors.map((v, i) => x(i) + ',' + y(v)).join('L')}"/>` : ''}
      <path class="line" d="${path}"/>
      <circle class="min-dot" cx="${x(minIdx)}" cy="${y(vals[minIdx])}" r="4.5"/>
      <text class="min-label" x="${Math.min(Math.max(x(minIdx), 40), W - 40)}" y="${y(vals[minIdx]) + 18 > H - pad.b - 2 ? y(vals[minIdx]) - 10 : y(vals[minIdx]) + 18}" text-anchor="middle">Alin ${lbl(vals[minIdx])}</text>
      <g class="cross" visibility="hidden"><line class="cross-line" y1="${pad.t}" y2="${H - pad.b}"/><circle class="cross-dot" r="5"/></g>
      <rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    </svg><div class="tooltip" hidden></div>`;

    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.cross');
    const tip = el.querySelector('.tooltip');
    function move(clientX) {
      const r = svg.getBoundingClientRect();
      const px = (clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(days.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (days.length - 1))));
      const d = days[i];
      cross.setAttribute('visibility', 'visible');
      cross.querySelector('line').setAttribute('x1', x(i));
      cross.querySelector('line').setAttribute('x2', x(i));
      cross.querySelector('circle').setAttribute('cx', x(i));
      cross.querySelector('circle').setAttribute('cy', y(d.balance));
      const evs = fc.events.filter((e) => e.date === d.date);
      tip.hidden = false;
      tip.innerHTML = `<b>${dateShort(d.date)}</b><div class="tip-val">${money(d.balance)}</div>` +
        (fc.card.enabled ? `<div class="tip-ev"><span>Luottoa vapaana</span><span>${money0(d.credit)}</span></div>` : '') +
        evs.slice(0, 4).map((e) => `<div class="tip-ev"><span>${esc(e.name)}</span><span>${signed(e.amount)}</span></div>`).join('');
      const left = (x(i) / W) * r.width;
      tip.style.left = Math.min(Math.max(left - 80, 0), r.width - 160) + 'px';
    }
    function hide() { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    svg.addEventListener('pointermove', (e) => move(e.clientX));
    svg.addEventListener('pointerdown', (e) => move(e.clientX));
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('touchend', () => setTimeout(hide, 1800));
  }

  // ---------- Alapaneelit (sheet) ----------

  const sheet = document.getElementById('sheet');
  const sheetForm = document.getElementById('sheet-form');

  function openSheet(html, onAction) {
    sheetForm.innerHTML = `<div class="sheet-grab"></div>${html}`;
    sheetForm.onsubmit = (ev) => {
      ev.preventDefault();
      const action = ev.submitter ? ev.submitter.value : 'save';
      if (action === 'cancel') return closeSheet();
      const fd = new FormData(sheetForm);
      const data = Object.fromEntries(fd.entries());
      data.__checks = fd.getAll('check');
      const keep = onAction(action, data);
      if (keep !== true) closeSheet();
    };
    sheetForm.querySelectorAll('[data-seg]').forEach((g) => {
      g.addEventListener('change', () => updateFormVisibility());
    });
    updateFormVisibility();
    if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
    const first = sheetForm.querySelector('input[autofocus]');
    if (first) setTimeout(() => first.focus(), 50);
  }
  function closeSheet() {
    if (sheet.open) sheet.close();
    render();
  }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

  // Näytä/piilota kentät valintojen mukaan (data-show="name=value|value2").
  function updateFormVisibility() {
    const fd = new FormData(sheetForm);
    sheetForm.querySelectorAll('[data-show]').forEach((el) => {
      const [name, vals] = el.dataset.show.split('=');
      const neg = name.startsWith('!');
      const v = fd.get(neg ? name.slice(1) : name);
      const match = vals.split('|').includes(v);
      el.hidden = neg ? match : !match;
    });
  }

  function seg(name, options, value) {
    return `<div class="seg" data-seg="${name}">${options.map(([v, l]) =>
      `<label><input type="radio" name="${name}" value="${v}" ${v === value ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  }

  function sheetBalance() {
    const fc = F.buildForecast(state);
    const todays = fc.events.filter((e) => e.date === fc.today);
    const cands = fc.overdue.concat(todays);
    openSheet(`<h2>Päivitä saldo</h2>
      <p class="help">Katso tilisi saldo pankista ja syötä se tähän. Ennuste lasketaan aina tästä luvusta eteenpäin.</p>
      <label class="field"><span>Tilin saldo nyt (€)</span>
        <input name="amount" type="text" inputmode="decimal" value="${fc.hasBalance ? fc.current.toFixed(2).replace('.', ',') : ''}" autofocus required></label>
      ${fc.card.enabled ? `<label class="field"><span>${esc(state.card.name || 'Luottokortin')} velka nyt (€)</span>
        <input name="cardDebt" type="text" inputmode="decimal" value="${fc.card.debt.toFixed(2).replace('.', ',')}">
        <small>Käytetty luotto pankin tai kortin sovelluksesta. Jätä ennalleen, jos et tiedä.</small></label>` : ''}
      ${cands.length ? `<fieldset class="checks"><legend>Mitkä näistä näkyvät jo pankin saldossa?</legend>
        ${cands.map((e) => `<label class="check"><input type="checkbox" name="check" value="${esc(e.key)}" ${e.overdue ? 'checked' : ''}>
          <span>${esc(e.name)} <small>${dateShort(e.date)}</small></span><b>${signed(e.amount)}</b></label>`).join('')}
        <small>Valitut merkitään toteutuneiksi, jotta niitä ei lasketa kahteen kertaan.</small></fieldset>` : ''}
      <div class="sheet-actions"><button value="cancel" class="btn ghost" formnovalidate>Peruuta</button><button value="save" class="btn primary">Tallenna</button></div>`,
    (action, data) => {
      const now = Date.now();
      const all = fc.overdue.concat(fc.events);
      data.__checks.forEach((key, i) => {
        const e = all.find((x) => x.key === key);
        if (e) confirmOccurrence(e, e.amount, e.date, now + i);
      });
      state.log.push({ id: uid(), ts: now + data.__checks.length + 1, type: 'balance', date: F.localToday(), amount: num(data.amount), name: 'Saldo' });
      if (fc.card.enabled && data.cardDebt != null && Math.abs(num(data.cardDebt) - fc.card.debt) > 0.005) {
        setCardDebt(num(data.cardDebt), now + data.__checks.length + 2);
      }
      save();
      toast('Saldo päivitetty');
    });
  }

  function confirmOccurrence(e, signedAmount, date, ts) {
    const id = uid();
    const entry = { id, ts: ts || Date.now(), type: 'confirm', date, amount: signedAmount, name: e.name, itemId: e.itemId, occKey: e.key };
    state.log.push(entry);
    if (e.transfer === 'card') {
      // Sama summa lyhentää kortin velkaa.
      const pid = uid();
      entry.pair = pid;
      state.log.push({ id: pid, ts: entry.ts, type: 'confirm', account: 'card', date, amount: -signedAmount, name: e.name, pair: id });
    }
    state.overrides[e.key] = Object.assign({}, state.overrides[e.key], { status: 'confirmed', logId: id });
  }

  function setCardDebt(debt, ts) {
    state.log.push({ id: uid(), ts: ts || Date.now(), type: 'balance', account: 'card', date: F.localToday(), amount: -Math.max(0, debt), name: 'Luottokortin velka' });
  }

  function sheetCard() {
    const c = state.card || {};
    const isNew = !c.enabled;
    const debt = Math.max(0, -F.currentBalance(state.log, 'card').balance);
    const today = F.localToday();
    const fmtN = (v) => (v === '' || v == null ? '' : String(v).replace('.', ','));
    openSheet(`<h2>${isNew ? 'Lisää luottokortti' : 'Luottokortti'}</h2>
      <p class="help">Luottokortti toimii hätävarana: ennuste näyttää, riittääkö käytettävissä oleva luotto kattamaan tilapäisen vajeen. Luoton käyttö maksaa korkoa, joten käytä sitä vain tarvittaessa.</p>
      <label class="field"><span>Nimi</span><input name="name" type="text" value="${esc(c.name || '')}" placeholder="esim. Visa"></label>
      <label class="field"><span>Luottoraja (€)</span><input name="limit" type="text" inputmode="decimal" value="${fmtN(c.limit)}" required ${isNew ? 'autofocus' : ''}></label>
      <label class="field"><span>Käytetty / velka nyt (€)</span><input name="debt" type="text" inputmode="decimal" value="${fmtN(debt ? debt.toFixed(2) : 0)}"></label>
      <label class="field"><span>Laskun maksu tililtä</span>
        <select name="payMode" data-seg="payMode">${[['none', 'Ei suunnitelmaa (en maksa automaattisesti)'], ['fixed', 'Kiinteä kuukausierä'], ['full', 'Koko velka kerralla']]
          .map(([v, l]) => `<option value="${v}" ${(c.payMode || 'fixed') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <small>Laskun maksu näkyy ennusteessa tilin menona ja vapauttaa luottoa uudelleen käyttöön.</small></label>
      <label class="field" data-show="payMode=fixed"><span>Kuukausierä (€)</span><input name="payAmount" type="text" inputmode="decimal" value="${fmtN(c.payAmount)}"></label>
      <label class="field" data-show="payMode=fixed|full"><span>Eräpäivä (kuukauden päivä)</span>
        <input name="payDay" type="number" min="1" max="31" inputmode="numeric" value="${c.payDay || 20}"></label>
      <label class="field"><span>Vuosikorko % (valinnainen)</span><input name="interest" type="text" inputmode="decimal" value="${fmtN(c.interest)}">
        <small>Näyttää arvion velan kuukausittaisesta korkokulusta.</small></label>
      <div class="sheet-actions">
        ${isNew ? '<button value="cancel" class="btn ghost" formnovalidate>Peruuta</button>' : '<button value="delete" class="btn ghost danger" formnovalidate>Poista kortti</button>'}
        <button value="save" class="btn primary">Tallenna</button>
      </div>`,
    (action, data) => {
      if (action === 'delete') {
        if (!confirm('Poistetaanko luottokortti ennusteesta?')) return true;
        state.card = Object.assign({}, state.card, { enabled: false });
        save(); toast('Luottokortti poistettu');
        return;
      }
      const payDay = Math.min(31, Math.max(1, Number(data.payDay) || 1));
      const next = Object.assign({}, c, {
        enabled: true,
        name: (data.name || '').trim() || 'Luottokortti',
        limit: Math.abs(num(data.limit)),
        payMode: data.payMode || 'none',
        payAmount: Math.abs(num(data.payAmount)),
        payDay,
        interest: Math.abs(num(data.interest)),
        weekendRule: 'next',
      });
      // Seuraava eräpäivä tästä päivästä eteenpäin; aiempia ei näytetä myöhässä olevina.
      if (isNew || payDay !== c.payDay) {
        const [y, m] = today.split('-').map(Number);
        let start = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(payDay, F.daysInMonth(y, m))).padStart(2, '0')}`;
        if (start < today) start = F.addMonths(start.slice(0, 8) + String(payDay).padStart(2, '0'), 1);
        next.payStart = start;
        next.since = today;
      }
      state.card = next;
      const newDebt = Math.abs(num(data.debt));
      if (isNew ? newDebt > 0 || !state.log.some((e) => e.account === 'card') : Math.abs(newDebt - debt) > 0.005) setCardDebt(newDebt);
      save();
      toast('Luottokortti tallennettu');
    });
  }

  function findOcc(key) {
    const fc = F.buildForecast(state);
    return fc.overdue.concat(fc.events).find((e) => e.key === key);
  }

  function sheetOccurrence(key) {
    const e = findOcc(key);
    if (!e) return;
    const item = state.items.find((i) => i.id === e.itemId);
    openSheet(`<h2>${esc(e.name)}</h2>
      <p class="help">${e.amount > 0 ? 'Tulo' : 'Meno'} · alun perin ${dateLong(e.nominal)}${item ? ' · ' + esc(freqText(item)) : ''}</p>
      <label class="field"><span>Summa (€)</span>
        <input name="amount" type="text" inputmode="decimal" value="${Math.abs(e.amount).toFixed(2).replace('.', ',')}" required></label>
      <label class="field"><span>Päivä</span><input name="date" type="date" value="${e.date}" required></label>
      <div class="sheet-actions col">
        <button value="confirm" class="btn primary">Merkitse toteutuneeksi</button>
        <button value="change" class="btn">Tallenna muutos ennusteeseen</button>
        <button value="skip" class="btn ghost">Ohita tämä kerta</button>
        ${e.changed ? '<button value="reset" class="btn ghost">Palauta alkuperäinen</button>' : ''}
        <button value="cancel" class="btn ghost" formnovalidate>Peruuta</button>
      </div>`,
    (action, data) => {
      const sign = e.amount > 0 ? 1 : -1;
      const amt = Math.abs(num(data.amount));
      if (action === 'confirm') {
        confirmOccurrence(e, sign * amt, data.date || e.date);
        toast('Merkitty toteutuneeksi');
      } else if (action === 'change') {
        state.overrides[key] = Object.assign({}, state.overrides[key], { amount: amt, date: data.date || e.date });
        toast('Ennuste päivitetty');
      } else if (action === 'skip') {
        state.overrides[key] = Object.assign({}, state.overrides[key], { status: 'skipped' });
        toast('Ohitettu');
      } else if (action === 'reset') {
        delete state.overrides[key];
      }
      save();
    });
  }

  function sheetItem(item, preset) {
    const isNew = !item;
    const today = F.localToday();
    item = item || {
      kind: preset === 'income' ? 'income' : 'expense',
      freq: preset === 'budget' ? 'budget' : 'monthly',
      interval: 1, start: today, weekendRule: preset === 'income' ? 'prev' : 'none', amount: '', name: '',
    };
    const kindSeg = seg('kind', [['income', 'Tulo'], ['expense', 'Meno']], item.kind);
    openSheet(`<h2>${isNew ? 'Uusi erä' : 'Muokkaa'}</h2>
      ${kindSeg}
      <label class="field"><span>Nimi</span><input name="name" type="text" value="${esc(item.name)}" placeholder="esim. Palkka, Vuokra, Ruoka" required ${isNew ? 'autofocus' : ''}></label>
      <label class="field"><span>Summa (€)</span><input name="amount" type="text" inputmode="decimal" value="${item.amount !== '' ? String(item.amount).replace('.', ',') : ''}" required></label>
      <label class="field"><span>Toistuvuus</span>
        <select name="freq" data-seg="freq">
          ${[['monthly', 'Kuukausittain'], ['weekly', 'Viikoittain'], ['yearly', 'Vuosittain'], ['once', 'Kerran'], ['budget', 'Kuukausibudjetti (tasaisesti jaettu)']]
            .map(([v, l]) => `<option value="${v}" ${item.freq === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <label class="field" data-show="freq=monthly|weekly"><span>Väli</span>
        <select name="interval">${[1, 2, 3, 4, 6].map((n) => `<option value="${n}" ${Number(item.interval) === n ? 'selected' : ''}>${n === 1 ? 'Joka kerta' : 'Joka ' + n + '.'}</option>`).join('')}</select>
        <small>Esim. joka 2. viikko tai joka 3. kuukausi.</small></label>
      <label class="field"><span data-show="freq=monthly|weekly|yearly">Seuraava (tai ensimmäinen) kerta</span><span data-show="freq=once">Päivä</span><span data-show="freq=budget">Alkaen</span>
        <input name="start" type="date" value="${item.start}" required>
        <small data-show="freq=monthly">Päivästä päätellään kuukauden päivä. Jos päivä on 29–31, lyhyinä kuukausina käytetään kuun viimeistä päivää.</small></label>
      <label class="field" data-show="freq=monthly|weekly|yearly"><span>Jos osuu viikonloppuun</span>
        <select name="weekendRule">${[['none', 'Ei siirtoa'], ['prev', 'Edellinen arkipäivä (tyypillinen palkkapäivä)'], ['next', 'Seuraava arkipäivä (tyypillinen eräpäivä)']]
          .map(([v, l]) => `<option value="${v}" ${item.weekendRule === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field" data-show="!freq=once"><span>Päättyy (valinnainen)</span><input name="end" type="date" value="${item.end || ''}"></label>
      <p class="help" data-show="freq=budget">Budjetti on aina meno. Kirjaa ostot +-napista tälle budjetille, niin jäljellä oleva summa jaetaan kuun loppupäiville.</p>
      <div class="sheet-actions">
        ${isNew ? '<button value="cancel" class="btn ghost" formnovalidate>Peruuta</button>' : '<button value="delete" class="btn ghost danger" formnovalidate>Poista</button>'}
        <button value="save" class="btn primary">Tallenna</button>
      </div>`,
    (action, data) => {
      if (action === 'delete') {
        if (!confirm(`Poistetaanko "${item.name}"? Jo kirjatut toteumat säilyvät historiassa.`)) return true;
        state.items = state.items.filter((i) => i.id !== item.id);
        for (const k of Object.keys(state.overrides)) if (k.startsWith(item.id + '|') && state.overrides[k].status !== 'confirmed') delete state.overrides[k];
        save();
        toast('Poistettu');
        return;
      }
      const next = Object.assign({}, item, {
        name: data.name.trim(),
        kind: data.freq === 'budget' ? 'expense' : data.kind,
        amount: Math.abs(num(data.amount)),
        freq: data.freq,
        interval: Number(data.interval) || 1,
        start: data.start,
        end: data.freq === 'once' ? '' : (data.end || ''),
        weekendRule: data.weekendRule || 'none',
      });
      next.day = Number(next.start.slice(8, 10));
      if (isNew) {
        next.id = uid();
        // Ennen lisäyspäivää olleita eriä ei näytetä myöhässä olevina.
        next.since = next.start < today ? today : next.start;
        state.items.push(next);
      } else {
        const idx = state.items.findIndex((i) => i.id === item.id);
        if (next.start > (item.since || '')) next.since = next.start;
        state.items[idx] = next;
      }
      save();
      toast(isNew ? 'Lisätty' : 'Tallennettu');
    });
  }

  function sheetQuickAdd() {
    const budgets = state.items.filter((i) => i.freq === 'budget');
    openSheet(`<h2>Kirjaa toteutunut</h2>
      <p class="help">Yllätysmeno tai -tulo, joka on jo tapahtunut. Suunniteltu erä (esim. palkka) kannattaa vahvistaa Tulevat-välilehdeltä.</p>
      ${seg('kind', [['expense', 'Meno'], ['income', 'Tulo']], 'expense')}
      <label class="field"><span>Summa (€)</span><input name="amount" type="text" inputmode="decimal" autofocus required></label>
      <label class="field"><span>Kuvaus</span><input name="name" type="text" placeholder="esim. Ruokakauppa"></label>
      ${state.card && state.card.enabled ? `<div data-show="kind=expense"><div class="field-label">Maksutapa</div>
        ${seg('account', [['bank', 'Tililtä'], ['card', esc(state.card.name || 'Luottokortti')]], 'bank')}</div>` : ''}
      ${budgets.length ? `<label class="field" data-show="kind=expense"><span>Budjetti</span>
        <select name="budgetId"><option value="">Ei budjettia (vähentää saldoa suoraan)</option>
        ${budgets.map((b, i) => `<option value="${b.id}" ${i === 0 ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
        <small>Budjettiin kirjattu osto ei pienennä ennustetta kahdesti – se vain kuluttaa budjettia.</small></label>` : ''}
      <label class="field"><span>Päivä</span><input name="date" type="date" value="${F.localToday()}" required></label>
      <div class="sheet-actions"><button value="cancel" class="btn ghost" formnovalidate>Peruuta</button><button value="save" class="btn primary">Kirjaa</button></div>`,
    (action, data) => {
      const amt = Math.abs(num(data.amount));
      if (!amt) return true;
      const isExp = data.kind === 'expense';
      const entry = { id: uid(), ts: Date.now(), type: 'adhoc', date: data.date || F.localToday(), amount: isExp ? -amt : amt, name: (data.name || '').trim() || (isExp ? 'Meno' : 'Tulo') };
      if (isExp && data.budgetId) entry.budgetId = data.budgetId;
      if (isExp && data.account === 'card') entry.account = 'card';
      state.log.push(entry);
      save();
      toast('Kirjattu');
    });
  }

  // ---------- Tapahtumankäsittely ----------

  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.action === 'quick-add') return sheetQuickAdd();
    if (b.dataset.view) { ui.view = b.dataset.view; window.scrollTo(0, 0); render(); }
  });

  app.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-goto]');
    if (!t) return;
    const d = t.dataset;
    if (d.goto) { ui.view = d.goto; window.scrollTo(0, 0); render(); return; }
    if (d.action === 'balance') return sheetBalance();
    if (d.action === 'card') return sheetCard();
    if (d.action === 'export') return exportData();
    if (d.action === 'reset') {
      if (confirm('Poistetaanko KAIKKI tiedot tästä laitteesta? Tätä ei voi perua.') && confirm('Oletko varma?')) {
        state = defaultState(); save(); render(); toast('Tiedot tyhjennetty');
      }
      return;
    }
    if (d.range) { ui.chartRange = d.range; try { localStorage.setItem('talous.chartRange', d.range); } catch (err) { /* ignore */ } render(); return; }
    if (d.confirm) {
      const ev = findOcc(d.confirm);
      if (ev) { confirmOccurrence(ev, ev.amount, ev.date); save(); render(); toast('Merkitty toteutuneeksi'); }
      return;
    }
    if (d.skip) { state.overrides[d.skip] = Object.assign({}, state.overrides[d.skip], { status: 'skipped' }); save(); render(); toast('Ohitettu'); return; }
    if (d.occ) return sheetOccurrence(d.occ);
    if (d.item) return sheetItem(state.items.find((i) => i.id === d.item));
    if (d.new) return sheetItem(null, d.new);
    if (d.dellog) {
      let entry = state.log.find((x) => x.id === d.dellog);
      if (!entry || !confirm('Poistetaanko kirjaus?')) return;
      // Siirron (kortin laskun maksu) molemmat puolet poistetaan yhdessä.
      if (!entry.occKey && entry.pair) entry = state.log.find((x) => x.id === entry.pair) || entry;
      state.log = state.log.filter((x) => x.id !== entry.id && x.id !== entry.pair);
      if (entry.type === 'confirm' && entry.occKey && state.overrides[entry.occKey]) {
        const ov = Object.assign({}, state.overrides[entry.occKey]);
        delete ov.status; delete ov.logId;
        if (Object.keys(ov).length) state.overrides[entry.occKey] = ov; else delete state.overrides[entry.occKey];
      }
      save(); render(); toast('Kirjaus poistettu');
    }
  });

  app.addEventListener('change', (e) => {
    if (e.target.id === 'set-buffer') { state.settings.buffer = Math.max(0, num(e.target.value)); save(); toast('Puskuri tallennettu'); }
    if (e.target.id === 'set-horizon') { state.settings.horizonMonths = Number(e.target.value); save(); toast('Ennustejakso tallennettu'); }
    if (e.target.id === 'import-file' && e.target.files[0]) importData(e.target.files[0]);
  });

  function exportData() {
    const json = JSON.stringify(state, null, 2);
    const name = `talous-varmuuskopio-${F.localToday()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Talous varmuuskopio' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        if (!s || !Array.isArray(s.items) || !Array.isArray(s.log)) throw new Error('bad');
        if (!confirm('Korvataanko nykyiset tiedot varmuuskopiolla?')) return;
        state = Object.assign(defaultState(), s);
        save(); render(); toast('Varmuuskopio palautettu');
      } catch (err) {
        toast('Tiedosto ei ole kelvollinen varmuuskopio');
      }
    };
    r.readAsText(file);
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // Päivitä näkymä, kun sovellus palaa taustalta (päivä on voinut vaihtua).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !sheet.open) render(); });
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => { if (window.innerWidth !== lastW && ui.view === 'overview') { lastW = window.innerWidth; render(); } });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  render();
})();
