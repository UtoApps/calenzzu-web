/* Calenzzu — la app (web y, metida dentro, la de iPhone/Android).
   Pantallas: docs/entregas/APP-v1-2026-09-05.zip (Claude Design) · textos: i18n.js ·
   motor: firebase/functions. Sin librerías, sin nada cargado de internet. */
(function () {
  'use strict';

  var CFG = window.CZ_CONFIG;
  var I = window.CZ_I18N;
  var IS_APP = !!window.ReactNativeWebView;
  var TZ = 'Europe/Zurich';
  try { TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || TZ; } catch (e) { /* se queda Zúrich */ }
  var root = document.getElementById('app');
  var MODES = ['cena', 'dia', 'viaje'];
  var GID_RE = /^[a-zA-Z2-9]{10}$/;

  // ── almacenamiento local (puede fallar en privado: la app sigue) ─────────
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } }
  function sessions() { try { return JSON.parse(lsGet('cz.s', '{}')) || {}; } catch (e) { return {}; } }
  function saveSession(gid, s) { var all = sessions(); all[gid] = s; lsSet('cz.s', JSON.stringify(all)); lsSet('cz.last', gid); }
  function dropSession(gid) { var all = sessions(); delete all[gid]; lsSet('cz.s', JSON.stringify(all)); if (lsGet('cz.last', '') === gid) lsSet('cz.last', ''); }

  // ── idioma ───────────────────────────────────────────────────────────────
  function pickLang() {
    var q = new URLSearchParams(location.search).get('l');
    if (I.LANGS.indexOf(q) >= 0) { lsSet('cz.lang', q); return q; }
    var saved = lsGet('cz.lang', '');
    if (I.LANGS.indexOf(saved) >= 0) return saved;
    var navs = (navigator.languages || [navigator.language || 'en']);
    for (var i = 0; i < navs.length; i++) {
      var c = String(navs[i] || '').slice(0, 2).toLowerCase();
      if (I.LANGS.indexOf(c) >= 0) return c;
    }
    return 'en';
  }
  var lang = pickLang();
  function t() { return I.T[lang]; }
  function setLang(l) { lang = l; lsSet('cz.lang', l); document.documentElement.lang = l; rerender(); }
  document.documentElement.lang = lang;

  function fill(s, o) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o[k] !== undefined ? o[k] : m; }); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── fechas y horas, en la zona de quien mira ─────────────────────────────
  var DTF = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  function P(ms) {
    var o = {};
    DTF.formatToParts(new Date(ms)).forEach(function (p) { if (p.type !== 'literal') o[p.type] = Number(p.value); });
    return { y: o.year, m: o.month, d: o.day, H: o.hour, M: o.minute };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ms) { var p = P(ms); return pad(p.H) + ':' + pad(p.M); }
  function fromIso(s) { var a = s.split('-'); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function needMonth(x) {
    var today = P(Date.now());
    var diff = (Date.UTC(x.y, x.m - 1, x.d) - Date.UTC(today.y, today.m - 1, today.d)) / 864e5;
    return x.m !== today.m || diff > 13;
  }
  function dayLabel(x, short) {
    var T = t();
    var wd = new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay();
    var name = short ? T.ds[wd] : T.dl[wd];
    var num = lang === 'de' ? x.d + '.' : String(x.d);
    return name + ' ' + num + (needMonth(x) ? ' ' + T.mo[x.m - 1] : '');
  }
  function durLabel(ms) {
    var D = t().dur;
    var h = Math.floor(ms / 3600000);
    var m = Math.round((ms % 3600000) / 60000);
    if (h === 0) return fill(D.m, { m: m });
    if (m === 0) return h === 1 ? D.h1 : fill(D.hN, { n: h });
    return fill(D.hm, { h: h, m: m });
  }

  // ── puente con la app nativa ─────────────────────────────────────────────
  function native(msg) { try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) { /* no estamos en la app */ } }
  function openExternal(url) { if (IS_APP) native({ t: 'open', url: url }); else window.open(url, '_blank', 'noopener'); }
  function pageUrl(slug) { return CFG.site + (lang === 'en' ? '' : '/' + lang) + '/' + slug + '/'; }

  // ── el motor ─────────────────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    if (opts.session) h.Authorization = 'Bearer ' + opts.session;
    return fetch(CFG.api + path, {
      method: opts.method || 'GET', headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; });
    }, function () { return { ok: false, error: 'net', _status: 0 }; });
  }

  // ── piezas comunes del diseño ────────────────────────────────────────────
  var LOGO = CFG.logo;
  var WORDMARK_TOP = 'Calen<span style="background:linear-gradient(135deg,#A98BFF,#53E8B2);-webkit-background-clip:text;background-clip:text;color:transparent;">zz</span>u';
  function topbar() {
    return '<div class="topbar"><span style="display:flex;align-items:center;gap:9px;">' +
      '<span style="width:30px;height:30px;border-radius:9px;padding:2px;flex:none;display:flex;background:radial-gradient(120% 120% at 30% 25%,#ffffff,#F1ECFF);box-shadow:inset 0 1px 1px rgba(255,255,255,.9),0 2px 5px rgba(20,10,50,.3);">' +
      '<img src="' + LOGO + '" alt="" style="width:100%;height:100%;display:block;"></span>' +
      '<span class="ttl" style="letter-spacing:-.035em;">' + WORDMARK_TOP + '</span></span></div>';
  }
  function tabbar(active) {
    return '<div class="tabbar"><button type="button" class="tab tab-home' + (active ? ' active' : '') +
      '" aria-label="Calenzzu" data-act="home"><span class="tab-ic"><img src="' + LOGO + '" alt=""></span></button></div>';
  }
  function langRow() {
    return '<div style="display:flex;justify-content:center;gap:4px;margin:16px 0 0;">' + I.LANGS.map(function (k) {
      var on = k === lang;
      return '<button type="button" data-act="lang" data-v="' + k + '" aria-pressed="' + on + '" style="border:none;cursor:pointer;font-family:inherit;font-size:11.5px;font-weight:800;letter-spacing:.05em;padding:6px 9px;border-radius:30px;color:' +
        (on ? '#fff' : '#7C769B') + ';background:' + (on ? 'linear-gradient(180deg,#9B7BFF 0%,#5B2EE5 100%)' : 'transparent') + ';">' + I.T[k].code + '</button>';
    }).join('') + '</div>';
  }
  var CHECK = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
  var CHECK_S = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';
  var DOT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="7"></circle></svg>';
  var WARN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 8v4.5M12 16.2v.1"></path></svg>';
  var ICONS = {
    none: 'M8 2v4M16 2v4M3 9h18M9 15h6',
    load: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M18.4 5.6l-2.2 2.2M7.8 16.2l-2.2 2.2',
    net: 'M2 4l20 16M5 12.5a10 10 0 0 1 5-2.4M8.5 16a5.5 5.5 0 0 1 3-1.4M12 20v.1',
    exp: 'M9.5 14.5 7 17a3.5 3.5 0 0 1-5-5l2.5-2.5M14.5 9.5 17 7a3.5 3.5 0 0 1 5 5l-2.5 2.5M9 15l6-6',
    full: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 6.5a3 3 0 1 1-3 3 3 3 0 0 1 3-3M19 14h4M21 12v4',
  };
  function icon(k) {
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"' +
      (k === 'load' ? ' class="cz-spin"' : '') + '><path d="' + ICONS[k] + '"></path></svg>';
  }

  // ── estado de la pantalla ────────────────────────────────────────────────
  var view = { name: '', data: null };
  var pollTimer = null;
  function stopPoll() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }
  function show(name, data) { stopPoll(); view = { name: name, data: data || {} }; rerender(); }
  function rerender() {
    var fn = VIEWS[view.name];
    if (!fn) return;
    root.innerHTML = fn(view.data);
    var sc = root.querySelector('.screen-scroll');
    if (sc) sc.scrollTop = 0;
  }

  // ── PANTALLA 1 · Portada ─────────────────────────────────────────────────
  function vPortada() {
    var T = t();
    return '<div class="screen-scroll cz-portada" style="display:flex;flex-direction:column;padding:76px 22px 26px;">' +
      '<div style="display:flex;flex-direction:column;align-items:center;gap:15px;">' +
      '<img src="' + LOGO + '" alt="" style="width:100px;height:100px;display:block;">' +
      '<div style="font-size:42px;font-weight:800;letter-spacing:-.036em;line-height:1;color:var(--ink);">Calen<span style="background:linear-gradient(135deg,#6B3AEA,#17A97C);-webkit-background-clip:text;background-clip:text;color:transparent;">zz</span>u</div></div>' +
      '<h1 style="font-size:31px;font-weight:800;letter-spacing:-.025em;line-height:1.14;color:var(--ink);margin:30px 0 0;text-wrap:pretty;">' + esc(T.h1) + '</h1>' +
      '<p style="font-size:16px;font-weight:600;line-height:1.45;color:var(--ink-soft);margin:11px 0 0;text-wrap:pretty;">' + esc(T.sub) + '</p>' +
      '<div style="display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 7px;margin:20px 0 0;">' +
      T.sin.map(function (s, i) {
        return (i ? '<span style="font-size:12.5px;font-weight:700;color:var(--muted-2);">·</span>' : '') +
          '<span style="font-size:12.5px;font-weight:700;color:var(--muted);white-space:nowrap;">' + esc(s) + '</span>';
      }).join('') + '</div>' +
      '<div style="flex:1;min-height:22px;"></div>' +
      '<p style="font-size:14px;font-weight:600;line-height:1.5;color:var(--ink-soft);margin:0 0 18px;text-wrap:pretty;">' + esc(T.priv) + '</p>' +
      '<button type="button" class="btn3d full" data-act="connect" style="font-size:16.5px;padding:17px 22px;line-height:1.22;">' + esc(T.btnConnect) + '</button>' +
      '<div style="display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin:22px 0 0;font-size:12.5px;font-weight:700;color:var(--muted);">' +
      '<a href="' + pageUrl('how') + '" data-act="page" data-v="how" style="white-space:nowrap;color:var(--muted);">' + esc(T.linkHow) + '</a><span style="color:var(--muted-2);">·</span>' +
      '<a href="' + pageUrl('privacy') + '" data-act="page" data-v="privacy" style="white-space:nowrap;color:var(--muted);">' + esc(T.linkPriv) + '</a></div>' +
      langRow() + '</div>';
  }

  // ── PANTALLA 2 · El aviso antes de Google ────────────────────────────────
  function vAviso(d) {
    var T = t();
    var hint = CFG.googleHint && CFG.googleHint[lang];
    return topbar() + '<div class="screen-scroll" style="display:flex;flex-direction:column;padding:26px 22px 26px;">' +
      '<h2 style="font-size:27px;font-weight:800;letter-spacing:-.025em;line-height:1.16;color:var(--ink);margin:0;text-wrap:pretty;">' + esc(T.s2t) + '</h2>' +
      '<p style="font-size:15.5px;font-weight:600;line-height:1.5;color:var(--ink-soft);margin:12px 0 0;text-wrap:pretty;">' + esc(T.s2b) + '</p>' +
      (hint ? '<div class="card-solid" style="margin:20px 0 0;padding:18px 16px;font-size:15px;font-weight:700;line-height:1.5;color:var(--ink);">' + hint.map(esc).join('<br>') + '</div>' : '') +
      '<div style="flex:1;min-height:20px;"></div>' +
      '<button type="button" class="btn3d full" data-act="google" style="font-size:16px;padding:16px 22px;line-height:1.22;">' + esc(T.s2btn) + '</button>' +
      '</div>';
  }

  // ── PANTALLA 3 · Conectado, pero todavía solo ────────────────────────────
  function vAlone(d) {
    var T = t();
    var link = CFG.site + '/g/?' + d.gid;
    var gift = d.state.gift;
    var giftTxt = gift ? dayLabel(P(gift.s)) + ' · ' + hhmm(gift.s) + ' → ' + hhmm(gift.e) : '';
    return topbar() + '<div class="screen-scroll" style="display:flex;flex-direction:column;padding:20px 22px 22px;">' +
      '<div class="card-solid" style="padding:6px 0;">' +
      '<div class="lrow"><span class="check">' + CHECK + '</span><span style="font-size:15px;font-weight:700;color:var(--ink);">' + esc(T.s3you) + '</span></div>' +
      '<div class="lrow"><span class="check off" style="animation:cz-late 1.9s ease-in-out infinite;">' + DOT + '</span><span style="font-size:15px;font-weight:700;color:var(--muted);">' + esc(T.s3other) + '</span></div></div>' +
      (gift ? '<div style="margin:16px 0 0;padding:20px;border-radius:var(--radius-card);color:#fff;background:linear-gradient(150deg,var(--violet-500) 0%,var(--violet-700) 100%);box-shadow:0 14px 34px -10px rgba(91,46,229,.42),inset 0 2px 3px rgba(255,255,255,.45),inset 0 -5px 10px rgba(45,20,120,.35);">' +
        '<div style="font-size:13.5px;font-weight:700;letter-spacing:.01em;">' + esc(T.s3gift) + '</div>' +
        '<div style="font-size:23px;font-weight:800;letter-spacing:-.01em;line-height:1.15;margin-top:5px;">' + esc(giftTxt) + '</div></div>' : '') +
      '<div style="flex:1;min-height:18px;"></div>' +
      '<p style="font-size:14.5px;font-weight:600;line-height:1.5;color:var(--ink-soft);margin:0 0 14px;text-wrap:pretty;">' + esc(T.s3call) + '</p>' +
      '<button type="button" class="btn3d whatsapp full" data-act="wa" style="font-size:16px;padding:16px 22px;line-height:1.22;">' +
      '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.6 8.6 0 0 1-3.9-.9L3 21l2-5.4a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.6 3 8.4 8.4 0 0 1 21 11.5Z"></path></svg>' +
      esc(T.s3wa) + '</button>' +
      '<button type="button" class="btn3d soft full" data-act="copy" style="font-size:14.5px;padding:13px 22px;margin-top:10px;line-height:1.22;">' + esc(T.s3copy) + '</button>' +
      '<div style="margin:14px 0 0;border-radius:14px;background:#EFF7F1;border:1px solid #D6E9DA;padding:11px 13px;">' +
      '<div style="font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#4B7A58;margin-bottom:5px;">WhatsApp</div>' +
      '<div style="font-size:13px;font-weight:600;line-height:1.45;color:#22452C;word-break:break-word;">' + esc(fill(T.s3msg, { link: link })) + '</div></div>' +
      '<p style="font-size:12.5px;font-weight:700;color:var(--muted);margin:12px 0 0;text-align:center;">' + esc(T.s3limit) + '</p>' +
      '</div>' + tabbar(true);
  }

  // ── PANTALLA 4 · La del invitado ─────────────────────────────────────────
  function vGuest(d) {
    var T = t();
    var name = d.info.inviter || '';
    var h1 = fill(T.s4t, { name: '\u0000' });
    var parts = h1.split('\u0000');
    return topbar() + '<div class="screen-scroll" style="display:flex;flex-direction:column;padding:22px 22px 22px;">' +
      '<h1 style="font-size:26px;font-weight:800;letter-spacing:-.025em;line-height:1.18;color:var(--ink);margin:0;text-wrap:pretty;">' +
      esc(parts[0]) + '<span style="color:var(--violet-600);">' + esc(name) + '</span>' + esc(parts[1] || '') + '</h1>' +
      '<div class="card-solid" style="margin:20px 0 0;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;">' +
      '<span class="check" style="width:26px;height:26px;margin-top:1px;">' + CHECK_S + '</span><span>' +
      '<span style="display:block;font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--green-600);">' + esc(T.s4see) + '</span>' +
      '<span style="display:block;font-size:15px;font-weight:700;line-height:1.4;color:var(--ink);margin-top:4px;text-wrap:pretty;">' + esc(T.s4seel) + '</span></span></div>' +
      '<div style="margin:12px 0 0;background:var(--card);border-radius:var(--radius-card);box-shadow:0 14px 32px -12px rgba(40,25,95,.28);padding:20px 18px;">' +
      '<div style="font-size:12.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--violet-700);">' + esc(T.s4never) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;">' + T.s4nev.map(function (n) {
        return '<div style="display:flex;gap:11px;align-items:flex-start;"><span style="width:24px;height:24px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;background:#F4EFFA;color:var(--violet-700);margin-top:1px;">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></span>' +
          '<span style="font-size:16px;font-weight:700;line-height:1.35;color:var(--ink);text-wrap:pretty;">' + esc(n) + '</span></div>';
      }).join('') + '</div></div>' +
      '<p style="font-size:14.5px;font-weight:700;line-height:1.5;color:var(--ink-soft);margin:14px 2px 0;text-wrap:pretty;">' +
      esc(fill(d.info.count > 1 ? T.s4reN : T.s4re2, { name: name })) + '</p>' +
      '<div style="flex:1;min-height:18px;"></div>' +
      '<button type="button" class="btn3d free full" data-act="join" style="font-size:17px;padding:17px 22px;line-height:1.22;">' + esc(T.s4btn) + '</button>' +
      '<p style="font-size:12.5px;font-weight:600;line-height:1.45;color:var(--muted);margin:12px 0 0;text-align:center;text-wrap:pretty;">' + esc(T.s4small) + '</p>' +
      langRow() + '</div>';
  }

  // ── PANTALLA 5 · El resultado ────────────────────────────────────────────
  function slotParts(x) {
    var T = t();
    if (x.days) {
      var a = fromIso(x.from);
      var b = fromIso(x.to);
      return { dia: dayLabel(a), hora: '→ ' + dayLabel(b), dur: fill(T.days, { n: x.days }),
        d: dayLabel(a, true), h: '→ ' + dayLabel(b, true), u: fill(T.days, { n: x.days }) };
    }
    var p = P(x.s);
    return { dia: dayLabel(p), hora: hhmm(x.s) + ' → ' + hhmm(x.e), dur: fill(T.free, { d: durLabel(x.dur) }),
      d: dayLabel(p, true), h: hhmm(x.s) + ' → ' + hhmm(x.e), u: durLabel(x.dur) };
  }
  function modesRow(mode) {
    var T = t();
    return '<div class="modos" style="padding:9px 18px 6px;">' + MODES.map(function (m, i) {
      return '<button type="button" class="modo' + (m === mode ? ' sel' : '') + '" data-act="mode" data-v="' + m + '" aria-pressed="' + (m === mode) + '">' + esc(T.modos[i]) + '</button>';
    }).join('') + '</div>';
  }
  function whoNames(members) {
    var T = t();
    return members.map(function (m) { return esc(m.name) + (m.you ? ' ' + esc(T.you) : ''); }).join(' · ');
  }
  function vResult(d) {
    var T = t();
    var st = d.state;
    var mi = MODES.indexOf(st.mode);
    var body;
    if (!st.best) {
      body = '<div class="card-solid" style="margin:6px 0 0;padding:22px 18px;text-align:center;">' +
        '<span class="badge-ic" style="width:60px;height:60px;border-radius:20px;margin:0 auto;">' + icon('none') + '</span>' +
        '<p style="font-size:15.5px;font-weight:700;line-height:1.5;color:var(--ink);margin:16px 0 0;text-wrap:pretty;">' + esc(T.none[mi]) + '</p></div>';
    } else {
      var b = slotParts(st.best);
      var alts = st.alts || [];
      var shown = d.more ? alts : alts.slice(0, 4);
      body = '<div style="font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin-bottom:7px;">' + esc(T.s5t) + '</div>' +
        '<div class="card-hueco' + (d.busy ? ' cz-loading' : '') + '"><div class="dia">' + esc(b.dia) + '</div><div class="hora">' + esc(b.hora) + '</div><div class="dur">' + esc(b.dur) + '</div></div>' +
        '<p style="font-size:13px;font-weight:600;line-height:1.5;color:var(--muted);margin:8px 2px 0;text-align:center;text-wrap:pretty;">' + esc(T.rules[mi]) + '</p>' +
        (alts.length ? '<div style="font-size:13.5px;font-weight:800;color:var(--ink-soft);margin:9px 2px 5px;">' + esc(T.s5also) + '</div>' +
          '<div class="card-solid" style="padding:2px 0;">' + shown.map(function (x) {
            var a = slotParts(x);
            return '<div class="lrow" style="padding:8px 16px;"><span style="font-size:14.5px;font-weight:800;color:var(--violet-600);min-width:56px;flex:none;">' + esc(a.d) + '</span>' +
              '<span style="font-size:14.5px;font-weight:700;color:var(--ink);flex:1;">' + esc(a.h) + '</span>' +
              '<span style="font-size:13px;font-weight:700;color:var(--muted);white-space:nowrap;">' + esc(a.u) + '</span></div>';
          }).join('') + '</div>' +
          (!d.more && alts.length > 4 ? '<button type="button" data-act="more" style="display:flex;justify-content:center;width:100%;margin:7px 0 0;font-size:13.5px;font-weight:800;color:var(--violet-600);background:none;border:none;font-family:inherit;cursor:pointer;">' + esc(T.s5more) + '</button>' : '') : '');
    }
    var ok = st.members.filter(function (m) { return m.status === 'ok'; }).length;
    return topbar() + '<div class="screen-scroll">' +
      (d.demo ? '<div style="display:flex;justify-content:center;margin:12px 0 0;"><span style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--violet-700);background:var(--violet-100);padding:4px 10px;border-radius:6px;">' + esc(T.example) + '</span></div>' : '') +
      modesRow(st.mode) + '<div style="padding:2px 18px 14px;">' + body +
      '<div class="card" style="margin:9px 0 0;padding:11px 14px;"><div style="display:flex;align-items:center;gap:10px;">' +
      '<span class="check" style="width:26px;height:26px;">' + CHECK_S + '</span>' +
      '<span style="font-size:14.5px;font-weight:800;color:var(--ink);flex:1;">' + whoNames(st.members) + '</span></div>' +
      '<div style="display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;margin:5px 0 0 36px;">' +
      '<span style="font-size:12.5px;font-weight:700;color:var(--muted);">' + esc(fill(T.count, { n: ok, m: st.members.length })) + '</span>' +
      (d.demo || st.members.length >= 5 ? '' : '<button type="button" data-act="invite" style="font-size:13.5px;font-weight:800;color:var(--violet-600);background:none;border:none;padding:0;font-family:inherit;cursor:pointer;">' + esc(T.s5inv) + '</button>') +
      '</div></div>' +
      '<p style="font-size:12px;font-weight:600;line-height:1.5;color:var(--muted);margin:10px 2px 0;text-wrap:pretty;">' + esc(T.s5fine) + '</p>' +
      '<a href="' + pageUrl('othercal') + '" data-act="page" data-v="othercal" style="display:block;font-size:12.5px;font-weight:700;color:var(--violet-700);margin:7px 2px 0;">' + esc(T.s5other) + '</a>' +
      (d.demo ? '' : '<button type="button" data-act="leave" style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);margin:9px 2px 0;background:none;border:none;padding:0;font-family:inherit;cursor:pointer;text-align:left;">' + esc(T.s5disc) + '</button>') +
      '</div></div>' + tabbar(true);
  }

  // ── PANTALLA 6B · El permiso se ha caído ─────────────────────────────────
  function blockedTitle(name) {
    var T = t();
    return fill(T.s6bs, { name: name, gen: lang === 'de' ? I.genDe(name) : I.genEn(name), de: I.deFr(name) });
  }
  function vBlocked(d) {
    var T = t();
    var st = d.state;
    var first = (st.blocked && st.blocked[0]) || '';
    return topbar() + '<div class="screen-scroll" style="display:flex;flex-direction:column;padding:22px 18px 20px;">' +
      '<div class="aviso" style="display:flex;gap:12px;align-items:flex-start;font-size:15px;">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="flex:none;margin-top:1px;"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v4.5M12 16.2v.1"></path></svg>' +
      '<span style="text-wrap:pretty;"><strong style="font-size:16px;display:block;margin-bottom:6px;line-height:1.35;">' + esc(blockedTitle(first)) + '</strong>' + esc(T.s6br) + '</span></div>' +
      '<div class="card-solid" style="margin:18px 0 0;padding:4px 0;">' + st.members.map(function (m) {
        var bad = m.status !== 'ok';
        return '<div class="lrow" style="padding:11px 16px;">' +
          (bad ? '<span style="width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:#5B4410;background:linear-gradient(180deg,#FFF0CC,#F5DC9A);box-shadow:inset 0 1px 2px rgba(255,255,255,.7),0 3px 6px rgba(140,105,20,.25);">' + WARN + '</span>'
            : '<span class="check" style="width:26px;height:26px;">' + CHECK_S + '</span>') +
          '<span style="font-size:14.5px;font-weight:700;color:var(--ink);flex:1;">' + esc(m.name) + (m.you ? ' ' + esc(T.you) : '') + '</span>' +
          (bad ? '<span style="font-size:11.5px;font-weight:800;color:#8A6410;text-align:right;max-width:132px;line-height:1.3;">' + esc(T.st[2]) + '</span>'
            : '<span style="font-size:11.5px;font-weight:700;color:var(--green-600);">' + esc(T.st[0]) + '</span>') + '</div>';
      }).join('') + '</div>' +
      '<div style="flex:1;min-height:20px;"></div>' +
      (st.members.some(function (m) { return m.you && m.status !== 'ok'; })
        ? '<button type="button" class="btn3d full" data-act="reconnect" style="font-size:15.5px;padding:16px 22px;line-height:1.22;">' + esc(T.btnConnect) + '</button>'
        : '<button type="button" class="btn3d full" data-act="wa" style="font-size:15.5px;padding:16px 22px;line-height:1.22;">' + esc(fill(T.s6bbtn, { name: first })) + '</button>') +
      '<button type="button" data-act="leave" style="display:block;font-size:12.5px;font-weight:700;color:var(--muted);margin:14px auto 0;background:none;border:none;padding:0;font-family:inherit;cursor:pointer;">' + esc(T.s5disc) + '</button>' +
      '</div>' + tabbar(false);
  }

  // ── Los estados del §7 ───────────────────────────────────────────────────
  function vState(d) {
    return topbar() + '<div class="screen-scroll" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 26px;text-align:center;">' +
      '<span class="badge-ic" style="width:60px;height:60px;border-radius:20px;">' + icon(d.icon) + '</span>' +
      '<p style="font-size:16.5px;font-weight:700;line-height:1.5;color:var(--ink);margin:20px 0 0;text-wrap:pretty;">' + esc(d.text) + '</p>' +
      (d.retry ? '<button type="button" class="btn3d soft" data-act="retry" style="margin-top:22px;" aria-label="retry"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path></svg></button>' : '') +
      (d.button ? '<button type="button" class="btn3d full" data-act="' + d.button.act + '" style="margin-top:22px;font-size:15.5px;padding:16px 22px;">' + esc(d.button.text) + '</button>' : '') +
      '</div>' + tabbar(false);
  }

  var VIEWS = {
    portada: vPortada, aviso: vAviso, alone: vAlone, guest: vGuest, result: vResult, blocked: vBlocked,
    state: function (d) { return vState(typeof d.build === 'function' ? d.build() : d); },
  };
  // Los estados se reconstruyen al cambiar de idioma: guardan una función, no un texto.
  function showState(icon, textFn, extra) {
    show('state', { build: function () { var o = { icon: icon, text: textFn(t()) }; if (extra) extra(o); return o; } });
  }

  // ── flujo ────────────────────────────────────────────────────────────────
  var current = { gid: null, mode: 'cena' };

  function go(path) {
    try { history.pushState({}, '', path); } catch (e) { /* ruta de fichero en la app */ }
    route(path);
  }

  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64url(s) {
    try { return JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
  }

  function startGoogle(m, gid) {
    var n = Math.random().toString(36).slice(2, 10);
    var st = b64url(JSON.stringify({ m: m, g: gid || undefined, n: n, a: IS_APP ? 1 : 0, l: lang }));
    var url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: CFG.clientId, redirect_uri: CFG.redirect, response_type: 'code',
      scope: 'openid profile https://www.googleapis.com/auth/calendar.freebusy',
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state: st, hl: lang,
    }).toString();
    if (IS_APP) native({ t: 'oauth', url: url });
    else location.href = url;
  }
  function beforeGoogle(m, gid) {
    if (CFG.unverified) show('aviso', { m: m, gid: gid });
    else startGoogle(m, gid);
  }

  function exchange(search) {
    var q = new URLSearchParams(search);
    var st = unb64url(q.get('state')) || {};
    // El idioma en que se empezó viaja dentro de «state»: se vuelve de Google en el mismo.
    if (I.LANGS.indexOf(st.l) >= 0 && st.l !== lang) { lang = st.l; lsSet('cz.lang', lang); document.documentElement.lang = lang; }
    if (q.get('error') || !q.get('code')) {
      if (st.m === 'j' && GID_RE.test(st.g || '')) return go('/g/?' + st.g);
      return go('/app/');
    }
    showState('load', function (T) { return T.s7load; });
    api('/exchange', { method: 'POST', body: { code: q.get('code'), state: q.get('state'), tz: TZ, redirectUri: CFG.redirect } })
      .then(function (r) {
        if (r.ok) {
          saveSession(r.gid, r.session);
          try { history.replaceState({}, '', '/g/?' + r.gid); } catch (e) { /* nada */ }
          return openGroup(r.gid);
        }
        var retry = function (o) { o.button = { act: 'retrygoogle', text: st.m === 'j' ? t().s4btn : t().btnConnect }; };
        current.retry = { m: st.m, g: st.g };
        if (r.error === 'scope_denied') return showState('none', function (T) { return T.scope; }, retry);
        if (r.error === 'full') return showState('full', function (T) { return T.s7full; });
        if (r.error === 'gone') return showState('exp', function (T) { return T.s7expAnon; });
        return showState('net', function (T) { return T.s7net; }, retry);
      });
  }

  function openGroup(gid, keepMode) {
    current.gid = gid;
    if (!keepMode) current.mode = 'cena';
    var ses = sessions()[gid];
    if (!ses) return openGuest(gid);
    if (view.name !== 'result') showState('load', function (T) { return T.s7load; });
    return api('/g/' + gid + '/state?' + new URLSearchParams({ tz: TZ, mode: current.mode }), { session: ses })
      .then(function (r) {
        if (current.gid !== gid) return;
        if (r._status === 401 || r._status === 403) { dropSession(gid); return openGuest(gid); }
        if (r._status === 404) { dropSession(gid); return showState('exp', function (T) { return T.s7expAnon; }); }
        if (!r.ok || r.status === 'net') { current.retry = null; return showState('net', function (T) { return T.s7net; }, function (o) { o.retry = true; }); }
        lsSet('cz.last', gid);
        if (r.status === 'alone') { show('alone', { gid: gid, state: r }); return pollJoin(gid); }
        if (r.status === 'blocked') return show('blocked', { gid: gid, state: r });
        return show('result', { gid: gid, state: r });
      });
  }

  // Pantalla 3: se refresca sola, sin botón de «Comprobar».
  function pollJoin(gid) {
    stopPoll();
    pollTimer = setTimeout(function () {
      if (view.name !== 'alone' || current.gid !== gid) return;
      if (document.visibilityState === 'hidden') return pollJoin(gid);
      api('/g/' + gid + '/info').then(function (r) {
        if (view.name !== 'alone' || current.gid !== gid) return;
        if (r.ok && r.count > 1) return openGroup(gid);
        pollJoin(gid);
      });
    }, 5000);
  }

  function openGuest(gid) {
    showState('load', function (T) { return T.s7load; });
    return api('/g/' + gid + '/info').then(function (r) {
      if (r._status === 404) return showState('exp', function (T) { return T.s7expAnon; });
      if (!r.ok) return showState('net', function (T) { return T.s7net; }, function (o) { o.retry = true; });
      if (r.full) return showState('full', function (T) { return T.s7full; });
      show('guest', { gid: gid, info: r });
    });
  }

  function openDemo() {
    current.gid = 'demo';
    if (view.name !== 'result') showState('load', function (T) { return T.s7load; });
    return api('/demo/state?' + new URLSearchParams({ tz: TZ, mode: current.mode })).then(function (r) {
      if (!r.ok) return showState('net', function (T) { return T.s7net; }, function (o) { o.retry = true; });
      show('result', { gid: 'demo', state: r, demo: true });
    });
  }

  function route(path) {
    var loc = path ? new URL(path, CFG.site) : location;
    var p = loc.pathname;
    if (/\/oauth\/?$/.test(p)) {
      var st = unb64url(new URLSearchParams(loc.search).get('state')) || {};
      if (!IS_APP && st.a === 1) { location.replace('calenzzu://oauth' + loc.search); return; }
      return exchange(loc.search);
    }
    if (/\/g\/?$/.test(p)) {
      var code = loc.search.replace(/^\?/, '').split('&')[0];
      if (code === 'demo') { current.mode = 'cena'; return openDemo(); }
      if (!GID_RE.test(code)) return showState('exp', function (T) { return T.s7expAnon; });
      return openGroup(code);
    }
    var last = lsGet('cz.last', '');
    if (last && sessions()[last]) return openGroup(last);
    current.gid = null;
    show('portada');
  }

  // ── los botones ──────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('cz-toast');
    if (!el) { el = document.createElement('div'); el.id = 'cz-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'on';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = ''; }, 2400);
  }
  function inviteMsg() { return fill(t().s3msg, { link: CFG.site + '/g/?' + current.gid }); }

  root.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var v = el.getAttribute('data-v');
    if (act === 'page') {
      ev.preventDefault();
      openExternal(el.getAttribute('href'));
      return;
    }
    if (act === 'lang') return setLang(v);
    if (act === 'connect') return beforeGoogle('c');
    if (act === 'join') return beforeGoogle('j', current.gid);
    if (act === 'reconnect') return beforeGoogle('j', current.gid);
    if (act === 'google') return startGoogle(view.data.m, view.data.gid);
    if (act === 'retrygoogle' && current.retry) return beforeGoogle(current.retry.m === 'j' ? 'j' : 'c', current.retry.g);
    if (act === 'retry' || act === 'home') {
      if (current.gid === 'demo') return openDemo();
      if (current.gid) return openGroup(current.gid, true);
      return route('/app/');
    }
    if (act === 'wa') return openExternal('https://wa.me/?text=' + encodeURIComponent(inviteMsg()));
    if (act === 'copy') {
      var link = CFG.site + '/g/?' + current.gid;
      if (IS_APP) { native({ t: 'copy', text: link }); toast(t().copied); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast(t().copied); }, function () { toast(link); });
      else toast(link);
      return;
    }
    if (act === 'invite') {
      if (IS_APP) return native({ t: 'share', text: inviteMsg() });
      if (navigator.share) return navigator.share({ text: inviteMsg() }).catch(function () { /* cancelado */ });
      return openExternal('https://wa.me/?text=' + encodeURIComponent(inviteMsg()));
    }
    if (act === 'more') { view.data.more = true; return rerender(); }
    if (act === 'mode') {
      if (v === current.mode || view.name !== 'result') return;
      current.mode = v;
      view.data.busy = true;
      view.data.more = false;
      view.data.state.mode = v;
      rerender();
      return current.gid === 'demo' ? openDemo() : openGroup(current.gid, true);
    }
    if (act === 'leave') {
      if (!window.confirm(t().confirmLeave)) return;
      var gid = current.gid;
      var ses = sessions()[gid];
      showState('load', function (T) { return T.s7load; });
      return api('/g/' + gid + '/leave', { method: 'POST', session: ses }).then(function (r) {
        if (!r.ok && r._status !== 401 && r._status !== 403 && r._status !== 404) {
          return showState('net', function (T) { return T.s7net; }, function (o) { o.retry = true; });
        }
        dropSession(gid);
        current.gid = null;
        toast(t().left);
        go('/app/');
      });
    }
  });

  window.addEventListener('popstate', function () { route(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && (view.name === 'result' || view.name === 'blocked') && current.gid && current.gid !== 'demo') openGroup(current.gid, true);
  });

  // La app nativa nos devuelve aquí el resultado de Google y los enlaces que abren la app.
  window.czOAuth = function (search) { exchange(search); };
  window.czNavigate = function (path) { go(path); };

  route(IS_APP ? (window.CZ_START || '/app/') : undefined);
})();
