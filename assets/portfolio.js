// 포트폴리오 문서(index.html) — 화면은 한 페이지 사이트, 인쇄는 A4 문서(제출 PDF)
//   화면(.scr): 첫 화면(큰 제목·PORTFOLIO) → 소개(한 줄 정체성) → 기술 스택(근거까지 펼침) → 프로젝트 카드 격자(대표 화면 · 제목 · 한 줄 소개 · 링크 · 태그)
//              → 한눈에 보기 → 연락처. 위에 고정 메뉴(지금 절 강조 · 진행 막대)
//   상세 창(카드를 누르면): 큰 그림 + 썸네일 줄 → 제목·링크 · 개발 의도 · 장르·기간·인원·환경·역할 · 기술 스택 · 주요 기능 · 트러블슈팅 · 결과와 회고
//   인쇄(.prt): 머리 → 자기소개 → 기술 스택 → 프로젝트마다 소개 + 기능 소개 → 한눈에 보기 → 연락처(예전 문서 그대로, 화면에서는 숨김)
//   모든 글은 data/portfolio.json·data/projects/*.json 값 그대로입니다. 절 이름·버튼 같은 UI 문구는 문구 표(PF.t, assets/strings.js + theme/strings.tsv)에서 옵니다.
//   주소: #<절 id>(cover · intro · stack · projects · contact. 예전 #glance·#summary → projects) · #p-<폴더>(그 프로젝트 상세 창) · #p-<폴더>-core(상세 창의 주요 기능) · #more-<폴더>(예전 주소 = 상세 창)
//         예전 주소(#s=… · #<번호> · #skills · #summary)도 맞는 곳으로 넘깁니다.
//   점검: PFPage.whenReady() → PFPage.report() · ?pf-audit=1이면 #pf-audit에 report()의 base64 JSON(headless용, 발표 덱과 같은 형식)
(() => {
  const root = document.getElementById('app');
  const html = document.documentElement;
  const { esc, inline, isUrl, shortUrl, link, t } = PF;
  const T = (k, v) => esc(t(k, v));                                    // HTML에 넣는 문구
  const pad2 = (n) => String(n).padStart(2, '0');
  const info = { errors: [], sections: [], projects: 0 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  html.dataset.pfReady = 'no';
  let BYID = {}, NO = {}, SET = {};
  // 처음 주소로 도착한 절, 또는 새로고침 전 스크롤 위치. 글꼴·그림이 늦게 와 위치가 밀리면 settle()에서 한 번 더 맞춤(그사이 사용자가 움직이지 않았을 때만)
  let arrived = '', restoreY = null, userMoved = false;
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((e) => addEventListener(e, () => { userMoved = true; }, { once: true, passive: true }));
  const POS = `pf-portfolio-y:${location.pathname}`;
  try { history.scrollRestoration = 'manual'; } catch { /* 그대로 */ }
  addEventListener('pagehide', () => { try { sessionStorage.setItem(POS, String(Math.round(scrollY))); } catch { /* 저장소 막힘 */ } });
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  window.PFPage = { whenReady: () => ready, report };

  start().catch((err) => {
    info.errors.push(String(err && err.stack || err));
    PF.notice(root, '페이지를 그리지 못했습니다', `<p>${esc(err && err.message || err)}</p>`);
  }).finally(settle);

  async function start() {
    if (PF.guardFileProtocol(root)) { info.errors.push('file:// — 로컬 서버로 열어야 합니다'); return; }
    let pf;
    const strings = PF.loadStrings();                                   // 실패해도 기본 문구(던지지 않음)
    try { pf = await PF.loadJSON('data/portfolio.json'); }
    catch (err) { info.errors.push(`data/portfolio.json: ${err && err.message || err}`); PF.noData(root, err); return; }
    PF.applyTheme(pf.settings?.accent);
    const projects = (await Promise.all((pf.projects || []).map((id) => PF.loadJSON(`data/projects/${encodeURIComponent(id)}.json`)
      .catch((err) => { console.warn('[portfolio] 프로젝트 데이터 없음:', err.message); return null; })))).filter(Boolean);
    await strings;
    SET = pf.settings || {};
    BYID = Object.fromEntries(projects.map((p) => [p.id, p]));
    NO = Object.fromEntries(projects.map((p, j) => [p.id, t('page.project-no', { no: pad2(j + 1), total: pad2(projects.length) })]));
    render(pf, projects);
    bind(projects);
    arrived = go(true);                                                // 내용을 그린 뒤라 브라우저가 처음 주소의 절로 스스로 가지 못함
    if (!arrived && performance.getEntriesByType?.('navigation')[0]?.type === 'reload') {
      try { restoreY = +sessionStorage.getItem(POS) || null; } catch { /* 저장소 막힘 */ }
      if (restoreY) scrollTo({ top: restoreY, behavior: 'instant' });
    }
    addEventListener('hashchange', () => go(false));                   // 주소를 붙여 넣거나, 뒤로 가기로 더 보기 창 주소를 오갈 때
  }

  // 주소 → 절로 이동하거나 상세 창 열기/닫기. 돌려주는 값: 도착한 절 id
  //   first=false(같은 페이지 안 링크): 보통 앵커는 브라우저가 이미 옮겼으므로 손대지 않고, 옛 주소·상세 창만 처리
  function go(first) {
    const raw = rawHash();
    const want = legacyTarget();
    const pm = projOf(want);
    if (pm) {
      if (!modal.open || modal.dataset.p !== pm.id) { if (first) scrollToId('projects'); openProject(pm.id, false, pm.part); }
      return 'projects';
    }
    if (modal.open) closeQuiet();
    if (!want || !document.getElementById(want)) return '';
    if (first || want !== raw) scrollToId(want);
    return want;
  }
  const rawHash = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return location.hash.slice(1); } };
  const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });   // 부드러운 스크롤은 가려진 창에서 멈춤 → 바로 이동
  // 상세 창 주소: #p-<폴더> · #p-<폴더>-core(주요 기능으로) · #more-<폴더>(예전 더 보기 창)
  function projOf(h) {
    if (!h) return null;
    if (h.startsWith('more-') && BYID[h.slice(5)]) return { id: h.slice(5) };
    if (!h.startsWith('p-')) return null;
    const r = h.slice(2);
    if (BYID[r]) return { id: r };
    if (r.endsWith('-core') && BYID[r.slice(0, -5)]) return { id: r.slice(0, -5), part: 'feats' };
    return null;
  }

  // 예전 포트폴리오 문서·덱의 주소 → 이 페이지의 절 id
  //   #s=<장면 id> · #<번호> · #s-<번호>(번호는 지금 화면 절의 차례) · #skills · #summary · #pr-…(인쇄 문서 안 링크)
  function legacyTarget() {
    let h = rawHash();
    if (!h) return '';
    const nth = (n) => info.sections[Math.max(1, Math.min(info.sections.length, n)) - 1] || '';
    if (/^-?\d+$/.test(h)) return nth(+h);
    const m = /^s=(.+)$/.exec(h);
    if (m) h = m[1].replace(/^(stack|glance)-\d+$/, '$1');
    const sn = /^s-(\d+)$/.exec(h);
    if (sn) return nth(+sn[1]);
    if (h.startsWith('pr-')) h = h.slice(3);
    return { skills: 'stack', summary: 'projects', glance: 'projects' }[h] ?? h;   // 한눈에 보기는 화면에서 빠져 프로젝트 절로
  }

  // ── 그리기 ──────────────────────────────────────────────────────────────
  function render(pf, projects) {
    const prof = pf.profile || {};
    const nameT = prof.name || t('name.portfolio');
    document.title = `${prof.name ? prof.name + ' · ' : ''}${t('name.portfolio')}`;
    document.querySelector('.skip-link')?.replaceChildren(t('ui.skip'));
    const profLinks = (prof.links || []).filter((l) => isUrl(l.url));
    const contactBtns = (cls = 'btn') => [prof.email && link({ href: `mailto:${prof.email}`, label: esc(prof.email), kind: 'mail', cls: `${cls} primary` }),
      isUrl(prof.github) && link({ href: prof.github, label: 'GitHub', kind: 'external', cls }),
      ...profLinks.map((l) => link({ href: l.url, label: esc(l.label), kind: 'external', cls }))].filter(Boolean).join('');
    const out = [];

    // ① 첫 화면: 큰 제목(profile.heroTitle, 없으면 이름) · PORTFOLIO · SCROLL DOWN만. 이름은 맨 위 왼쪽, 한 줄 정체성은 소개 절 제목으로
    const big = prof.heroTitle || nameT;
    out.push(`<section id="cover" class="s-hero"><div class="s-hero-bg" aria-hidden="true"></div><div class="wrap s-hero-in">
      <h1 class="s-hero-t${prof.heroTitle ? ' en' : ''}"${prof.heroTitle ? ' lang="en"' : ''} data-reveal>${esc(big)}</h1>
      <p class="s-hero-pf" lang="en" data-reveal>${T('en.portfolio')}</p>
    </div><a class="s-scroll" href="#intro"><span lang="en">${T('page.scroll')}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l6 6 6-6M6 12l6 6 6-6"/></svg></a></section>`);

    // ② 소개: 왼쪽 세로 그림(profile.aboutImage, 어두운 모드는 aboutImageDark — 없으면 같은 그림) 위에 걸친 두 줄 슬로건(윗줄 가늘게·아랫줄 굵게, 없으면 한 줄 정체성)
    //    → 오른쪽: 인사말(이름 강조) · 점선 · 자기소개(빈 줄 = 문단, **굵게**, ==크게 강조==) · 키워드
    {
      const lines = String(prof.slogan || '').split(/\s*\/\s*/).filter(Boolean);
      const sl = lines.length ? lines : prof.headline ? [prof.headline] : [];
      const en = (x) => /^[\x20-\x7E’]+$/.test(x);
      const slogan = sl.length ? `<h2 class="s-ab-sl${lines.length ? '' : ' ko'}" data-reveal>${sl.map((l, i) => `<span class="${i === sl.length - 1 ? 'b' : 'l'}"${en(l) ? ' lang="en"' : ''}>${inline(l)}</span>`).join('')}</h2>`
        : `<h2 class="s-h2" data-reveal>${T('page.intro')}</h2>`;
      const greet = prof.greeting ? `<p class="s-ab-greet" data-reveal>${nameHl(inline(prof.greeting), prof.name)}</p><hr class="s-ab-dash">` : '';
      const paras = String(prof.intro || '').split(/\n\s*\n/).map((pp) => pp.split('\n').filter((l) => l.trim()).map(rich).join('<br>')).filter(Boolean);
      const kw = (prof.keywords || []).filter(Boolean);
      // CSS 변수 안의 상대경로는 portfolio.css(assets/) 기준으로 풀리므로 페이지 기준 절대 주소로 넣음
      const abUrl = (p) => esc(new URL(PF.encodePath(p), document.baseURI).href);
      if (sl.length || paras.length || greet) out.push(`<section id="intro" class="s-sec s-about${prof.aboutImage ? '' : ' noart'}">
        ${prof.aboutImage ? `<div class="s-ab-art" aria-hidden="true" style="--ab-img:url('${abUrl(prof.aboutImage)}')${prof.aboutImageDark ? `;--ab-img-dark:url('${abUrl(prof.aboutImageDark)}')` : ''}"></div>` : ''}
        <div class="wrap s-ab-in">${slogan}
          <div class="s-ab-body">${greet}
            ${paras.length ? `<div class="s-ab-text" data-reveal>${paras.map((x) => `<p>${x}</p>`).join('')}</div>` : ''}
            ${kw.length ? `<ul class="s-kw" data-reveal>${kw.map((k) => `<li>#${esc(k)}</li>`).join('')}</ul>` : ''}</div>
        </div></section>`);
    }

    // ③ 기술 스택: 기술마다 선 아이콘 · 이름 · 짧은 근거(근거 프로젝트는 데이터에만) → 아래에 써 본 도구(묶음 이름 + 작은 아이콘·이름, 가운데 정렬)
    const skills = pf.skills || [];
    const tools = (pf.tools || []).filter((r) => (r.tags || []).length);
    if (skills.length || tools.length) {
      const lines = [...new Set(tools.map((r) => r.line))];
      const cols = Math.max(1, ...lines.map((n) => tools.filter((r) => r.line === n).length));   // 한 줄의 묶음 수 = 칸 수(줄이 달라도 같은 칸끼리 세로로 맞춤)
      const toolHtml = tools.length ? `<div class="s-tools" style="--cols:${cols}" data-reveal>${lines.map((n) => `<div class="s-tline">${tools.filter((r) => r.line === n).map((r) => `<div class="s-trow">
          <p class="s-tlabel">${esc(r.label)}</p><ul>${r.tags.map((g) => `<li><span class="s-ti" aria-hidden="true">${toolIcon(g)}</span><span>${esc(g)}</span></li>`).join('')}</ul></div>`).join('')}</div>`).join('')}</div>` : '';
      out.push(sec('stack', t('en.skills'), t('page.stack'), '', `<ul class="s-skgrid">${skills.map((s) => `<li data-reveal>
        <span class="s-sk-i" aria-hidden="true">${skillIcon(s.name)}</span><h3>${esc(s.name)}</h3>
        ${(s.evidence || []).map((e) => `<p class="s-sk-ev">${inline(e.text)}</p>`).join('')}</li>`).join('')}</ul>${toolHtml}`, 's-skills'));
    }

    // ④ 프로젝트 카드 격자(누르면 상세 창)
    if (projects.length) out.push(`<section id="projects" class="s-sec s-projects"><div class="wrap">
      <div class="s-phead" data-reveal><p class="eyebrow" lang="en">${T('nav.projects')}</p><h2 class="s-ph2">${T('page.projects')}</h2>
        <p class="s-psub">${T('page.projects-sub').replace(/([.!?])\s+(?=\S)/g, '$1<br>')}</p></div>
      <ul class="pc-grid">${projects.map(card).join('')}</ul></div></section>`);

    // (한눈에 보기 절은 화면에서 뺌 — 카드·상세 창이 소개·기술·기간·인원을 보여 주므로. 인쇄본에는 그대로 있음)

    // ⑤ 연락처
    const year = String(pf.generatedAt || new Date().getFullYear()).slice(0, 4);
    out.push(`<footer id="contact" class="s-sec s-contact"><div class="wrap">
      <p class="eyebrow" data-reveal>${T('en.contact')}</p>
      <h2 class="s-thanks" data-reveal>${T('page.thanks')}</h2>
      <p class="s-thanks-sub" data-reveal>${T('page.thanks-sub')}</p>
      <div class="s-pillbar" data-reveal>${contactBtns('pb')}</div>
      ${contactForm(prof)}
      <p class="s-copy">${T('page.copyright', { year, name: prof.nameEn || nameT })}</p>
    </div></footer>`);

    const nav = [['cover', t('nav.home'), true], ['intro', t('nav.about'), prof.intro || prof.slogan], ['stack', t('nav.skills'), skills.length],
      ['projects', t('nav.projects'), projects.length], ['contact', t('nav.contact'), true]].filter((x) => x[2]);
    root.innerHTML = `<header class="s-top no-print"><div class="s-prog" aria-hidden="true"><span></span></div><div class="wrap s-top-in">
        <a class="s-top-name" href="#cover"${prof.brand || prof.nameEn ? ' lang="en"' : ''}>${esc(prof.brand || prof.nameEn || nameT)}</a>
        <nav aria-label="절 이동"><ul>${nav.map(([id, label]) => `<li><a href="#${esc(id)}" data-nav="${esc(id)}" lang="en">${esc(label)}</a></li>`).join('')}</ul></nav>
        ${PFMode.button()}
        <button type="button" class="s-burger" aria-expanded="false" aria-label="메뉴"><span></span><span></span><span></span></button></div></header>
      <main id="main" class="scr">${out.join('')}</main>
      <div class="prt">${printDoc(pf, projects)}</div>
      <dialog class="pm" aria-labelledby="pm-title"></dialog>`;
    modal = root.querySelector('dialog.pm');
    root.querySelectorAll('img').forEach((i) => { if (!i.hasAttribute('loading')) i.loading = 'lazy'; i.decoding = 'async'; });
    info.sections = [...root.querySelectorAll('main.scr > section[id], main.scr > footer[id]')].map((s) => s.id);
    info.projects = projects.length;
  }

  // 연락처 절의 메시지 보내기: profile.contactKey(Web3Forms 키)가 있으면 페이지에서 바로 보내고, 없으면 메일 앱으로(이메일이 있을 때)
  function contactForm(prof) {
    const key = String(prof.contactKey || '').trim();
    if (!key && !prof.email) return '';
    const f = (name, label, ph, attrs, area) => `<label class="s-fld"><span>${T(label)}</span>${area
      ? `<textarea name="${name}" rows="6" placeholder="${T(ph)}" ${attrs}></textarea>`
      : `<input name="${name}" placeholder="${T(ph)}" ${attrs}>`}</label>`;
    return `<form class="s-form no-print" data-contact data-key="${esc(key)}" data-mail="${esc(prof.email || '')}" novalidate data-reveal>
      <p class="s-form-t">${T('page.form-title')}</p>
      <div class="s-form-row">${f('name', 'page.form-name', 'page.form-name-ph', 'required maxlength="80" autocomplete="name"')}
        ${f('contact', 'page.form-contact', 'page.form-contact-ph', 'required maxlength="120" autocomplete="email"')}</div>
      ${f('message', 'page.form-message', 'page.form-message-ph', 'required maxlength="5000"', true)}
      <input type="checkbox" name="botcheck" class="s-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="s-form-foot"><p class="s-form-msg" role="status" aria-live="polite"></p>
        <button type="submit" class="pb primary s-form-send">${T('page.form-send')}</button></div>
    </form>`;
  }

  function bindContactForm() {
    const form = root.querySelector('form[data-contact]');
    if (!form) return;
    const msg = form.querySelector('.s-form-msg');
    const btn = form.querySelector('.s-form-send');
    const say = (k, cls) => { msg.textContent = t(k); msg.className = `s-form-msg${cls ? ' ' + cls : ''}`; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      ['name', 'contact', 'message'].forEach((n) => form.elements[n].toggleAttribute('aria-invalid', !String(d[n] || '').trim()));
      const bad = form.querySelector('[aria-invalid]');
      if (bad) { bad.focus(); say('page.form-empty', 'err'); return; }
      if (d.botcheck) return;
      const subject = t('page.form-subject', { name: d.name.trim() });
      const isMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contact.trim());
      const key = form.dataset.key;
      if (!key) {   // 키가 없으면 메일 앱으로(내용을 채워서)
        const body = `${d.message.trim()}\n\n— ${d.name.trim()} (${d.contact.trim()})`;
        location.href = `mailto:${form.dataset.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        say('page.form-mailapp');
        return;
      }
      btn.disabled = true; say('page.form-sending');
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ access_key: key, subject, from_name: d.name.trim(), name: d.name.trim(), contact: d.contact.trim(),
            ...(isMail ? { email: d.contact.trim() } : {}), message: d.message.trim() }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.success === false) throw new Error(j.message || res.status);
        form.reset(); say('page.form-done', 'ok');
      } catch (err) {
        info.contactError = String(err.message || err); say('page.form-fail', 'err');
      } finally { btn.disabled = false; }
    });
    form.addEventListener('input', (e) => { if (String(e.target.value).trim()) e.target.removeAttribute('aria-invalid'); });
  }

  const sec = (id, eyebrow, title, right, body, cls = '') => `<section id="${esc(id)}" class="s-sec${cls ? ' ' + cls : ''}"><div class="wrap">
    <div class="s-head" data-reveal><div><p class="eyebrow">${esc(eyebrow)}</p><h2 class="s-h2">${esc(title)}</h2></div>${right ? `<p class="s-head-r">${esc(right)}</p>` : ''}</div>${body}</div></section>`;
  const bold = (s) => inline(s).replace(/==(.+?)==/g, '<strong class="hl">“$1”</strong>').replace(/\*\*(.+?)\*\*/g, '<strong class="hl">$1</strong>');
  // 화면 자기소개: **굵게** → 굵은 글씨, ==문구== → 따옴표가 붙은 크고 색 있는 강조
  const rich = (s) => inline(s).replace(/==(.+?)==/g, '<em class="q">“$1”</em>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 인사말 속 이름 강조
  const nameHl = (h, name) => (name ? h.split(esc(name)).join(`<b class="nm">${esc(name)}</b>`) : h);
  const capText = (c) => (typeof c === 'string' ? c : c?.text || '');      // 그림 설명은 글 조각 또는 글자
  const src = (p, rel) => esc(PF.srcPath(p.id, rel));
  // 기술 이름 → 일반 선 아이콘(장식). 이름에 맞는 것이 없으면 기본 아이콘
  // 기술·도구 이름 → 일반 선 아이콘(장식, 글자색 한 가지). 맞는 것이 없으면 체크 표시
  const ICONS = {
    cube: '<path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z"/><path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5"/>',
    code: '<path d="M7.8 7l-5 5 5 5M16.2 7l5 5-5 5"/><path d="M13.2 6l-2.4 12"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 13.5v7M13.5 17h7"/>',
    data: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8V6"/><path d="M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8"/>',
    net: '<path d="M4 8h16M16 4l4 4-4 4"/><path d="M20 16H4M8 12l-4 4 4 4"/>',
    light: '<circle cx="12" cy="12" r="8.5"/><path d="M8 11a4 4 0 0 1 3-3"/>',
    sword: '<path d="M14.5 3.5H20.5V9.5L10 20l-2-2-2 2-2-2 2-2-2-2z"/><path d="M13 11l-3 3"/>',
    ide: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
    tween: '<path d="M3 19C9 19 9 5 21 5"/><circle cx="3" cy="19" r="1.4" fill="currentColor"/><circle cx="21" cy="5" r="1.4" fill="currentColor"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/>',
    inspector: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7.5 8.5h9M7.5 12h5M7.5 15.5h7"/>',
    git: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11c0 4-6 3-11 6"/>',
    hub: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    spark: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/>',
    fork: '<path d="M7 3v5a5 5 0 0 0 10 0V3M12 3v18M12 13v8"/>',
    asana: '<circle cx="12" cy="7.3" r="3.6" fill="currentColor" stroke="none"/><circle cx="6.6" cy="16.6" r="3.6" fill="currentColor" stroke="none"/><circle cx="17.4" cy="16.6" r="3.6" fill="currentColor" stroke="none"/>',
    vcs: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="9" cy="8.3" r="1.6"/><circle cx="9" cy="15.7" r="1.6"/><circle cx="15" cy="10.3" r="1.6"/><path d="M9 9.9v4.2M15 11.9c0 2.2-3.4 1.8-4.6 2.8"/>',
    term: '<path d="M12 2.8c3 0 4.8 1.6 5.6 3.6 2.2.6 3.6 2.6 3.6 5s-1.4 4.4-3.6 5c-.8 2-2.6 3.6-5.6 3.6s-4.8-1.6-5.6-3.6C4.2 15.8 2.8 13.8 2.8 11.4s1.4-4.4 3.6-5C7.2 4.4 9 2.8 12 2.8z"/><path d="M8.5 9.5l2.5 2-2.5 2M12.5 14h3"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.7c1.8.6 3 2.2 3.4 4.8"/>',
    pad: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.3" r=".9" fill="currentColor"/><circle cx="17.6" cy="13.7" r=".9" fill="currentColor"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`;
  function skillKey(name) {
    const n = String(name).toLowerCase();
    return /데이터|data|scriptableobject|\bdb\b/.test(n) ? 'data' : /unity|unreal|유니티|엔진|engine/.test(n) ? 'cube' : /c#|c\+\+|csharp|code|script|언어|python|java/.test(n) ? 'code'
      : /패턴|pattern|설계|구조|architecture|fsm|strategy|factory|singleton|싱글턴|중재자|mediator|observer|옵저버/.test(n) ? 'grid'
      : /net|서버|server|socket|멀티|multi|동기화/.test(n) ? 'net' : /shader|render|urp|hdrp|그래픽|graphic|조명/.test(n) ? 'light'
      : /전투|combat|게임플레이|gameplay|액션/.test(n) ? 'sword' : 'check';
  }
  function toolKey(name) {
    const n = String(name).toLowerCase();
    return /version control|vcs|plastic/.test(n) ? 'vcs' : /^unity|유니티/.test(n) ? 'cube' : /rider|visual studio|vs ?code|cursor/.test(n) ? 'ide' : /dotween|tween/.test(n) ? 'tween'
      : /unitask|async/.test(n) ? 'clock' : /cinemachine|camera/.test(n) ? 'camera' : /odin|inspector/.test(n) ? 'inspector'
      : /github|gitlab/.test(n) ? 'hub' : /^fork$/.test(n) ? 'fork' : /^git$|sourcetree/.test(n) ? 'git' : /asana|jira|notion|trello/.test(n) ? 'asana'
      : /codex/.test(n) ? 'term' : /claude|gpt|copilot|gemini|ai/.test(n) ? 'spark' : 'check';
  }
  const skillIcon = (name) => svg(skillKey(name));
  const toolIcon = (name) => svg(toolKey(name));
  // 대표 화면 줄에서 마우스를 올리면 움직일 그림: 스크린샷 중 첫 GIF·WebP(없으면 기능 그림 중). 끄기면 없음
  function hoverGif(p) {
    if (SET.cardGif === false) return '';
    const anim = (s) => /\.(gif|webp)$/i.test(s || '') && s !== p.cover;
    return (p.screenshots || []).map((s) => s.src).find(anim) || (p.highlights || []).map((h) => h.image?.src).find(anim) || '';
  }
  // 프로젝트 카드: 대표 화면(마우스를 올리면 GIF) · 제목 + 자세히 보기 · 한 줄 소개 · 태그 (링크는 상세 창에만)
  const caret = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function card(p) {
    const gif = hoverGif(p);
    const id = esc(p.id);
    const cardTags = (p.cardTags || []).length ? p.cardTags : (p.tags || []);   // 카드 전용 태그(profile.md 프로젝트 스택의 "인트로 카드") → 없으면 tags. 상세 창·문서는 tags
    return `<li class="pc" data-reveal>
      <a class="pc-m" href="#p-${id}" data-open="${id}" tabindex="-1" aria-hidden="true">
        ${p.cover ? `<span class="pc-bg" style="background-image:url('${src(p, p.cover)}')"></span><img class="still" src="${src(p, p.cover)}" alt="">` : `<span class="pc-ph">${esc(p.title)}</span>`}
        ${gif ? `<img class="anim" data-src="${src(p, gif)}" alt="">` : ''}</a>
      <div class="pc-h"><h3>${p.team?.type ? `<span class="pc-badge ${p.team.type === 'team' ? 'team' : 'solo'}" title="${esc(PF.teamLabel(p.team))}">${T(p.team.type === 'team' ? 'name.team-badge' : 'name.solo-badge')}</span>` : ''}<a href="#p-${id}" data-open="${id}">${esc(p.title)}</a></h3>
        <a class="pc-more" href="#p-${id}" data-open="${id}" tabindex="-1" aria-hidden="true">${T('page.detail')}${caret}</a></div>
      ${p.tagline ? `<p class="pc-tl">${inline(p.tagline)}</p>` : ''}
      ${cardTags.length ? `<ul class="pc-tags">${cardTags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </li>`;
  }

  // 프로젝트 링크(발표 덱 · 상세 문서 · GitHub · 영상 · 그 밖). short = 카드용(그 밖의 링크 빼고 짧은 이름)
  function linkList(p, cls, short = false, icons = false) {
    const extra = short ? [] : (p.links?.extra || []).filter((l) => isUrl(l.url));
    const ic = (k, label) => icons ? `<span class="lk-i" aria-hidden="true">${svg(k)}</span>${label}` : label;   // 앞 아이콘(상세 창 위쪽 링크 줄)
    // 순서: 시연 영상 · 발표 덱 · 상세 문서 · GitHub · 그 밖. 시연 영상·발표 덱은 강조(hot — 파랗게 채운 버튼)
    return [isUrl(p.links?.video) && link({ href: p.links.video, label: ic('play', T('name.video')), cls: `${cls} hot` }),
      link({ href: PF.projectUrl(p.id), label: ic('slides', T('name.deck')), kind: 'page', cls: `${cls} hot` }),
      link({ href: PF.docUrl(p.id), label: ic('doc', T(short ? 'name.doc-short' : 'name.doc')), kind: 'page', cls }),
      isUrl(p.links?.github) && link({ href: p.links.github, label: ic('hub', 'GitHub'), cls }),
      ...extra.map((l) => link({ href: l.url, label: esc(l.label), cls }))].filter(Boolean).join('');
  }

  // ── 상세 창(카드를 누르면): 큰 그림 + 썸네일 줄 → 제목·링크 · 개발 의도 · 정보 · 기술 스택 · 주요 기능 · 트러블슈팅 · 결과와 회고 · 바로 가기(버튼) ──
  let modal = null, pushed = false, lastFocus = null;
  // 유튜브 주소 → 영상 id·세로 영상(Shorts) 여부. 유튜브가 아니면 null
  function youtube(u) {
    if (!isUrl(u)) return null;
    let url; try { url = new URL(u); } catch { return null; }
    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    let id = '', shorts = false;
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (/^(youtube\.com|youtube-nocookie\.com)$/.test(host)) {
      const m = url.pathname.match(/^\/(shorts|embed|live)\/([^/?#]+)/);
      if (m) { id = m[2]; shorts = m[1] === 'shorts'; } else id = url.searchParams.get('v') || '';
    }
    return /^[\w-]{6,}$/.test(id) ? { id, shorts } : null;
  }
  // 유튜브 플레이어(쿠키 덜 쓰는 주소). 저절로 재생하지 않음
  const player = (id, shorts, cap) => `<div class="pm-yt${shorts ? ' shorts' : ''}"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&amp;playsinline=1" title="${esc(cap)}"
    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  // 그림 넘기기 목록: 시연 영상(유튜브면 맨 앞) → 대표 화면 → 스크린샷 → 주요 기능 그림
  function gallery(p) {
    const seen = new Set(), list = [];
    const add = (s, w, h, cap) => { if (s && !seen.has(s)) { seen.add(s); list.push({ src: s, w, h, cap: capText(cap) }); } };
    const yt = youtube(p.links?.video);
    if (yt) list.push({ yt, cap: t('name.video') });
    add(p.cover, null, null, p.title);
    (p.screenshots || []).forEach((s) => add(s.src, s.w, s.h, s.caption));
    (p.highlights || []).forEach((h) => h.image && add(h.image.src, h.image.w, h.image.h, h.image.caption || h.title));
    return list;
  }
  const factIcon = (l) => svg(/기간|period|duration|date/i.test(l) ? 'clock' : /인원|팀|구성|team|member/i.test(l) ? 'users' : /장르|genre/i.test(l) ? 'pad'
    : /환경|엔진|플랫폼|env|engine|platform/i.test(l) ? 'ide' : 'check');
  function detail(p) {
    const g = gallery(p);
    const img = (x) => x.yt ? `<img src="https://i.ytimg.com/vi/${esc(x.yt.id)}/hqdefault.jpg" alt="${esc(x.cap)}">`
      : `<img src="${src(p, x.src)}" alt="${esc(x.cap || p.title)}"${x.w && x.h ? ` width="${x.w}" height="${x.h}"` : ''}>`;
    const thumb = (x, i) => `<button type="button" role="listitem" data-gi="${i}"${x.yt ? ` class="yt" data-yt="${esc(x.yt.id)}"${x.yt.shorts ? ' data-shorts' : ''}` : ''} aria-label="${esc(x.cap || `${i + 1}`)}"${i ? '' : ' aria-current="true"'}>${img(x)}</button>`;
    const ts = p.troubleshooting || [];
    const r = p.retro || {};
    const retro = [['achieved', 'deck.achieved', '✓'], ['regrets', 'deck.regrets', '△'], ['plans', 'deck.plans', '→']].filter(([k]) => (r[k] || []).length);
    const part = (k, body, id = '') => `<section class="pm-part"${id ? ` id="${id}"` : ''}><h3 class="pm-h">${T(k)}</h3>${body}</section>`;
    const facts = [...(p.meta || []).map((m) => [m.label, inline(m.value)]), p.team?.role && [t('name.role'), inline(p.team.role)]].filter(Boolean);
    const hl = (p.highlights || []).slice(0, 4);
    const slug = PF.slugger();
    const feats = hl.map((h, i) => {
      const anchor = h.section ? slug(PF.normTitle(h.section)) : '';
      const im = h.image?.src ? h.image : null;
      return `<li${im ? '' : ' class="noimg"'}>${im ? `<figure><img src="${src(p, im.src)}" alt="${esc(capText(im.caption) || h.title)}"${im.w && im.h ? ` width="${im.w}" height="${im.h}"` : ''}></figure>` : ''}
        <div><p class="fk" lang="en">${T('en.feature')} ${pad2(i + 1)}</p><h4>${inline(h.title)}</h4>${h.what ? `<p>${inline(h.what)}</p>` : ''}
          <div class="pm-fa">${link({ href: PF.projectUrl(p.id, PF.deckSceneFor(p, h.section)), label: T('page.see-in-deck'), kind: 'page', cls: 'pill' })}
            ${link({ href: PF.docUrl(p.id, anchor), label: T('page.see-in-doc'), kind: 'page', cls: 'pill' })}</div></div></li>`;
    }).join('');
    return `<div class="pm-sc">
      <button type="button" class="pm-x" data-close aria-label="${T('ui.close-esc')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      ${g.length ? `<div class="pm-spacer" aria-hidden="true"></div><div class="pm-gal"><figure class="pm-view"><div class="pm-stage">${g[0].yt ? player(g[0].yt.id, g[0].yt.shorts, g[0].cap) : img(g[0])}</div><figcaption>${esc(g[0].cap)}</figcaption>
          ${g.length > 1 ? `<button type="button" class="pm-nav prev" data-step="-1" aria-label="이전 그림">‹</button><button type="button" class="pm-nav next" data-step="1" aria-label="다음 그림">›</button>` : ''}</figure>
        ${g.length > 1 ? `<div class="pm-th" role="list">${g.map(thumb).join('')}</div>` : ''}</div>` : ''}
      <div class="pm-body">
        <p class="eyebrow">${esc(NO[p.id])} · ${esc(PF.teamLabel(p.team))}</p>
        <h2 id="pm-title">${esc(p.title)}</h2>
        ${p.tagline ? `<p class="pm-tl">${inline(p.tagline)}</p>` : ''}
        <p class="pm-lks">${linkList(p, 'pm-lk', false, true)}</p>
        ${p.intent?.text ? `<div class="pm-intro"><p class="k" lang="en">${T('en.intent')}</p><p>${inline(p.intent.text)}</p></div>` : ''}
        ${facts.length ? `<dl class="pm-facts">${facts.map(([k, v]) => `<div><dt><span class="pm-fi" aria-hidden="true">${factIcon(k)}</span>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}
        ${(p.tags || []).length ? part('page.stack', `<ul class="pm-tags">${p.tags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`) : ''}
        ${hl.length ? part('page.highlights', `<ol class="pm-feats">${feats}</ol>`, 'pm-feats') : ''}
        ${ts.length ? part('page.trouble', `<div class="pm-ts">${ts.map((x, i) => `<details><summary><span class="n">${pad2(i + 1)}</span><span>${inline(x.title)}</span></summary>
            <dl>${[['problem', '문제'], ['cause', '원인'], ['solution', '해결'], ['result', '결과'], ['lesson', '배운 점']].filter(([k]) => x[k])
              .map(([k, l]) => `<div class="${k}"><dt>${esc(PF.label(l))}</dt><dd>${inline(x[k])}</dd></div>`).join('')}</dl></details>`).join('')}</div>`) : ''}
        ${retro.length ? part('page.retro', `<div class="pm-retro">${retro.map(([k, key, mark]) => `<div class="${k}"><h4><span aria-hidden="true">${mark}</span> ${T(key)}</h4>
            <ul>${(p.retroBrief?.[k]?.length ? p.retroBrief[k] : r[k]).map((x) => `<li>${inline(x)}</li>`).join('')}</ul></div>`).join('')}</div>`) : ''}
        ${part('page.links', `<div class="pm-go">${linkList(p, 'btn pm-btn', false, true)}</div>`)}
      </div></div>
      ${g.length ? `<div class="pm-shade" aria-hidden="true"></div><p class="pm-hint" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>${T('page.scroll-info')}</p>` : ''}`;
  }

  // 상세 창의 그림 영역(참고 사이트와 같은 방식)
  //   처음: 그림 영역이 창 위쪽을 차지하고, 아래 정보는 숨김(투명 + 아래로 밀림)
  //   조금이라도 내리면(.scrolled): 그림 영역이 위로 올라가 썸네일 줄만 남고, 정보가 올라오며 나타남. 맨 위로 돌아오면 반대로
  //   --pm-shift = 올라가는 거리(넘어가는 순간 썸네일 줄이 창 위쪽에 보이도록), 자리 띄우기(.pm-spacer) = 그림 영역 높이 − 올라가는 거리 → 정보는 썸네일 줄 바로 아래에서 시작
  //   좁은 화면(.flat)은 그림 영역도 그냥 흘러감
  const FLAT = matchMedia('(max-width: 759px)');
  function layoutMedia() {
    if (!modal.open) return;
    const gal = modal.querySelector('.pm-gal');
    modal.classList.toggle('nomedia', !gal);
    modal.classList.toggle('flat', !!gal && FLAT.matches);
    if (!gal || FLAT.matches) return;
    const h = gal.offsetHeight, th = gal.querySelector('.pm-th');
    const shift = th ? Math.max(0, th.offsetTop - 16 - SCROLLED_AT * 2) : h;   // 넘어가는 순간 이미 내린 만큼(약 SCROLLED_AT)을 빼도 썸네일 줄이 보이게
    modal.style.setProperty('--pm-shift', `${shift}px`);
    modal.querySelector('.pm-spacer').style.height = `${h - shift}px`;
  }
  const SCROLLED_AT = 24;                                              // 이만큼(px) 내리면 정보로 넘어감
  function onModalScroll() { modal.classList.toggle('scrolled', modal.querySelector('.pm-sc').scrollTop > SCROLLED_AT); }
  function openProject(id, push = true, partId = '') {
    const p = BYID[id];
    if (!p) return;
    if (closing) finishClose();                                       // 내려가는 중에 다시 열면 먼저 마저 닫음
    if (!modal.open) lastFocus = document.activeElement;
    modal.dataset.p = id;
    modal.innerHTML = detail(p);
    modal.classList.remove('scrolled');
    modal.querySelectorAll('img').forEach((i) => { i.decoding = 'async'; });
    if (push && rawHash() !== `p-${id}`) {
      history.pushState({ pm: id }, '', `${location.pathname}${location.search}#p-${encodeURIComponent(id)}`);
      pushed = true;
    }
    if (!modal.open) { modal.showModal(); html.classList.add('pm-lock'); }
    const sc = modal.querySelector('.pm-sc');
    layoutMedia();
    sc.addEventListener('scroll', onModalScroll, { passive: true });
    const to = partId === 'feats' && modal.querySelector('#pm-feats');
    sc.scrollTop = to ? to.offsetTop + to.offsetParent.offsetTop - 24 : 0;   // 주요 기능은 정보(.pm-body) 안 → 정보의 자리까지 더함(움직임 transform은 빼고 잼)
    onModalScroll();
    modal.querySelector('.pm-x').focus({ preventScroll: true });
  }
  // 창 닫기(× · Esc · 바깥 누르기): 열 때 주소를 쌓았으면 뒤로 가기로 되돌리고, 아니면 주소를 프로젝트 절로 바꿈
  //   close 이벤트를 기다리지 않음(가려진 창 등에서 늦거나 오지 않음) → 닫은 자리에서 바로 뒷정리. Esc는 cancel을 막고 같은 길로
  //   닫을 때는 판이 아래로 내려간 뒤 닫힘(.closing). animationend가 오지 않는 경우(가려진 창)에 대비해 시간으로도 끝냄
  let closing = 0;
  function finishClose() {
    clearTimeout(closing); closing = 0; modal.classList.remove('closing');
    modal.querySelectorAll('.pm-yt').forEach((v) => v.remove());       // 창은 숨기기만 하므로 영상 플레이어를 지워 소리도 멈춤
    if (modal.open) { modal.close(); onClosed(); }
  }
  function closeModal(animate = true) {
    if (!modal.open) return;
    if (!animate || reduced) return finishClose();
    if (closing) return;
    modal.classList.add('closing');
    modal.addEventListener('animationend', (e) => { if (e.target === modal && closing) finishClose(); }, { once: true });
    closing = setTimeout(finishClose, 420);
  }
  function onClosed() {
    html.classList.remove('pm-lock');
    if (pushed && history.state?.pm) history.back();
    else if (projOf(legacyTarget())) try { history.replaceState(null, '', `${location.pathname}${location.search}#projects`); } catch { /* 그대로 */ }
    pushed = false;
    if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
  }
  function closeQuiet() { pushed = false; closeModal(false); }
  function showShot(i) {
    const items = [...modal.querySelectorAll('.pm-th [data-gi]')];
    if (!items.length) return;
    i = (i + items.length) % items.length;
    const b = items[i], from = b.querySelector('img');
    const stage = modal.querySelector('.pm-stage');
    if (b.dataset.yt) stage.innerHTML = player(b.dataset.yt, b.hasAttribute('data-shorts'), from.alt);   // 영상: 다른 그림으로 넘기면 플레이어를 지워 재생도 멈춤
    else {
      let view = stage.querySelector('img');
      if (!view) { stage.innerHTML = '<img alt="">'; view = stage.querySelector('img'); view.decoding = 'async'; }
      view.src = from.src; view.alt = from.alt;
      ['width', 'height'].forEach((a) => { const v = from.getAttribute(a); if (v) view.setAttribute(a, v); else view.removeAttribute(a); });
    }
    modal.querySelector('.pm-view figcaption').textContent = from.alt;
    items.forEach((b, j) => b.toggleAttribute('aria-current', j === i));
    items[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'instant' : 'smooth' });
  }
  const shotNow = () => [...modal.querySelectorAll('.pm-th [data-gi]')].findIndex((b) => b.hasAttribute('aria-current'));

  // ── 인쇄용 문서(예전 포트폴리오 문서 그대로, id는 pr- 붙임) ─────────────
  function printDoc(pf, projects) {
    const prof = pf.profile || {};
    const nameT = prof.name || t('name.portfolio');
    const total = pad2(projects.length);
    const btn = (href, label, kind, cls = 'btn') => link({ href, label, kind, cls });
    const profLinks = (prof.links || []).filter((l) => isUrl(l.url));
    const printUrls = (rows) => rows.length ? `<dl class="print-only purls">${rows.map(([k, u, href, kind]) => `<div><dt>${esc(k)}</dt><dd class="url">${href
      ? link({ href, label: esc(u), kind }) : esc(u)}</dd></div>`).join('')}</dl>` : '';
    const psec = (id, eyebrow, title, right, body, cls = '') => `<section id="pr-${esc(id)}" class="sec${cls ? ' ' + cls : ''}"><div class="wrap">
      <div class="sec-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>${right ? `<p class="sec-r">${esc(right)}</p>` : ''}</div>${body}</div></section>`;
    const out = [];
    out.push(`<section id="pr-cover" class="hero"><div class="wrap">
      <div class="hero-top"><p class="eyebrow">${T('en.portfolio')}</p>${pf.generatedAt ? `<p class="upd">${T('page.updated', { date: pf.generatedAt })}</p>` : ''}</div>
      <h1>${esc(nameT)}${prof.nameEn ? `<span class="en" lang="en">${esc(prof.nameEn)}</span>` : ''}</h1>
      ${prof.headline ? `<p class="headline">${inline(prof.headline)}</p>` : ''}
      ${printUrls([prof.email && [t('page.print-email'), prof.email, `mailto:${prof.email}`, 'mail'], isUrl(prof.github) && ['GitHub', shortUrl(prof.github), prof.github, 'external'],
        ...profLinks.map((l) => [l.label, shortUrl(l.url), l.url, 'external']), [t('page.print-web'), PF.visibleUrl('')]].filter(Boolean))}
    </div></section>`);
    if (prof.intro) out.push(psec('intro', t('en.about'), t('page.intro'), '', `<div class="about">${prof.intro.split(/\n+/).filter((l) => l.trim()).map((l) => `<p>${bold(l)}</p>`).join('')}</div>`));
    if ((pf.skills || []).length) out.push(psec('stack', t('en.skills'), t('page.stack'), t('page.stack-note'), `<ul class="skills">${pf.skills.map((s) => `<li class="skill">
      <h3>${esc(s.name)}</h3><ul>${(s.evidence || []).map((e) => `<li><span>${inline(e.text)}</span>${BYID[e.project] ? link({ href: `#pr-p-${e.project}`, label: esc(BYID[e.project].title), kind: 'anchor', cls: 'chip' }) : ''}</li>`).join('')}</ul></li>`).join('')}</ul>`, 'tint'));
    projects.forEach((p, j) => {
      const no = t('page.project-no', { no: pad2(j + 1), total });
      out.push(projectIntro(p, no, psec, btn, printUrls));
      const fe = features(p, no, psec, btn);
      if (fe) out.push(fe);
    });
    if (projects.length) out.push(psec('glance', t('en.glance'), t('page.glance'), '', `<ul class="glance">${projects.map((p) => `<li>
      <div class="g-t">${link({ href: `#pr-p-${p.id}`, label: esc(p.title), kind: 'anchor' })}<p>${esc(PF.teamLabel(p.team))}</p></div>
      <div class="g-b">${p.tagline ? `<p>${inline(p.tagline)}</p>` : ''}${(p.tags || []).length ? `<p class="g-tags">${esc(p.tags.slice(0, 4).join(' · '))}</p>` : ''}
        ${p.team?.role ? `<p class="g-role"><b>${T('name.role-short')}</b> ${inline(p.team.role)}</p>` : ''}</div>
      <div class="g-l">${projLinks(p)}</div></li>`).join('')}</ul>`, 'tint'));
    out.push(`<footer id="pr-contact" class="sec contact"><div class="wrap">
      <p class="eyebrow">${T('en.contact')}</p>
      <div class="ct">
        <div class="ct-me"><p class="ct-name">${esc(nameT)}</p>
          ${prof.email ? `<p class="em">${link({ href: `mailto:${prof.email}`, label: esc(prof.email), kind: 'mail' })}</p>` : ''}
          ${isUrl(prof.github) ? `<p>${link({ href: prof.github, label: `<span class="url">${esc(shortUrl(prof.github))}</span>` })}</p>` : ''}
          ${profLinks.map((l) => `<p><span class="k">${esc(l.label)}</span> ${link({ href: l.url, label: `<span class="url">${esc(shortUrl(l.url))}</span>` })}</p>`).join('')}
          <p class="print-only"><span class="url">${esc(PF.visibleUrl(''))}</span></p></div>
        <div class="ct-lk">${projects.map((p) => `<div><b>${esc(p.title)}</b><span class="row">${projLinks(p)}</span></div>`).join('')}</div>
      </div></div></footer>`);
    return out.join('');
  }

  // 프로젝트 소개(인쇄): 대표 이미지 · 메타(장르·기간·인원·환경) · 내 역할 · 개발 의도 · 태그 · 링크
  function projectIntro(p, no, sec, btn, printUrls) {
    const meta = (p.meta || []).map((m) => `<div><dt>${esc(m.label)}</dt><dd>${inline(m.value)}</dd></div>`);
    if (p.team?.role) meta.push(`<div class="wide"><dt>${T('name.role')}</dt><dd>${inline(p.team.role)}</dd></div>`);
    const extra = (p.links?.extra || []).filter((l) => isUrl(l.url));
    const urls = [[t('name.deck'), PF.visibleUrl(PF.projectUrl(p.id)), PF.projectUrl(p.id), 'page'], [t('name.doc'), PF.visibleUrl(PF.docUrl(p.id)), PF.docUrl(p.id), 'page'],
      isUrl(p.links?.github) && ['GitHub', shortUrl(p.links.github), p.links.github, 'external'], isUrl(p.links?.video) && [t('name.video'), shortUrl(p.links.video), p.links.video, 'external'],
      ...extra.map((l) => [l.label, shortUrl(l.url), l.url, 'external'])].filter(Boolean);
    const cover = p.cover ? `<figure class="cover"><img src="${esc(PF.srcPath(p.id, p.cover))}" alt="${esc(p.title)} 대표 화면"></figure>` : '';
    const body = `${p.tagline ? `<p class="tagline">${inline(p.tagline)}</p>` : ''}
      <div class="pi${cover ? '' : ' nocover'}">${cover}<div class="pi-r">
        ${meta.length ? `<dl class="meta">${meta.join('')}</dl>` : ''}
        ${p.intent?.text ? `<div class="intent"><p class="k">${T('name.intent')}</p><p>${inline(p.intent.text)}</p></div>` : ''}
        ${(p.tags || []).length ? `<ul class="tags">${p.tags.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${printUrls(urls)}</div></div>`;
    return sec(`p-${p.id}`, no, p.title, PF.teamLabel(p.team), body, 'proj');
  }

  // 기능 소개(인쇄): 화면은 왼쪽(기능 번호와 함께), 기능 설명과 [발표 덱에서 보기]는 오른쪽 목록
  function features(p, no, sec) {
    const hl = (p.highlights || []).slice(0, 4);
    if (!hl.length) return '';
    const shots = hl.map((h, i) => ({ h, i })).filter(({ h }) => h.image?.src);
    const tiles = shots.map(({ h, i }) => {
      const d = h.image.w && h.image.h ? ` width="${h.image.w}" height="${h.image.h}"` : '';
      return `<figure class="shot" data-fi="${i}"><div class="shot-m"><img src="${esc(PF.srcPath(p.id, h.image.src))}" alt="${esc(capText(h.image.caption) || h.title)}"${d}></div>
        <figcaption><span class="n">${pad2(i + 1)}</span><span>${inline(capText(h.image.caption) || h.title)}</span></figcaption></figure>`;
    }).join('');
    const rows = hl.map((h, i) => `<li data-fi="${i}"><div class="fr-t"><p class="fk">${T('en.feature')} ${pad2(i + 1)}</p><h3>${inline(h.title)}</h3>${h.what ? `<p>${inline(h.what)}</p>` : ''}</div>
      <div class="fr-a">${link({ href: PF.projectUrl(p.id, PF.deckSceneFor(p, h.section)), label: T('page.see-in-deck'), kind: 'page', cls: 'pill',
        attrs: `aria-label="${esc(PF.normTitle(h.title))} — ${T('page.see-in-deck')} (새 탭)"` })}</div></li>`).join('');
    const body = `<div class="fe${shots.length ? '' : ' noshot'}" style="--shots:${shots.length}">${shots.length ? `<div class="shots">${tiles}</div>` : ''}
      <div class="fe-r"><ol class="flist">${rows}</ol></div></div>`;
    return sec(`p-${p.id}-core`, `${no} · ${t('page.features')}`, p.title, PF.teamLabel(p.team), body, 'tint core');
  }

  function projLinks(p) {
    return [link({ href: PF.projectUrl(p.id), label: T('name.deck'), kind: 'page' }), link({ href: PF.docUrl(p.id), label: T('name.doc-short'), kind: 'page' }),
      isUrl(p.links?.github) && link({ href: p.links.github, label: 'GitHub' }), isUrl(p.links?.video) && link({ href: p.links.video, label: T('name.video') })].filter(Boolean).join('');
  }

  // ── 움직임·조작 ─────────────────────────────────────────────────────────
  function bind(projects) {
    const top = root.querySelector('.s-top');
    const bar = root.querySelector('.s-prog span');
    const burger = root.querySelector('.s-burger');
    // 위 메뉴: 첫 화면을 지나면 바탕을 칠하고, 진행 막대는 읽은 만큼
    const onScroll = () => {
      top?.classList.toggle('solid', scrollY > 24);
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    // 화면 가운데 줄에 걸린 것으로 "지금" 정하기
    const center = (cb, margin = '-50% 0px -50% 0px') => new IntersectionObserver((ents) => ents.forEach(cb), { rootMargin: margin });
    // 지금 보고 있는 절에 메뉴 강조
    const links = new Map([...root.querySelectorAll('[data-nav]')].map((a) => [a.dataset.nav, a]));
    const spy = center((e) => { if (e.isIntersecting) links.forEach((a, id) => a.toggleAttribute('aria-current', id === e.target.id)); });
    info.sections.forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
    // 좁은 화면 메뉴
    burger?.addEventListener('click', () => { const open = !top.classList.contains('open'); top.classList.toggle('open', open); burger.setAttribute('aria-expanded', String(open)); });
    top?.querySelectorAll('.s-top-in nav a').forEach((a) => a.addEventListener('click', () => { top.classList.remove('open'); burger?.setAttribute('aria-expanded', 'false'); }));
    bindContactForm();
    // 화면에 들어올 때 살짝 떠오르기(움직임 줄이기 설정이면 없음)
    if (!reduced && 'IntersectionObserver' in window) {
      html.classList.add('rv');
      const io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
      root.querySelectorAll('.scr [data-reveal]').forEach((el) => io.observe(el));
    }
    // 프로젝트 카드: 세로로 긴 대표 화면은 자르지 않고 흐린 배경 위에 전체를 보임
    root.querySelectorAll('.pc-m img.still').forEach((i) => {
      const fit = () => i.naturalWidth && i.closest('.pc-m').classList.toggle('tall', i.naturalWidth / i.naturalHeight < 1.25);
      if (i.complete) fit(); else i.addEventListener('load', fit, { once: true });
    });
    // 프로젝트 카드: 마우스를 올리면 GIF(올렸을 때 처음 받음)
    const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    root.querySelectorAll('.pc').forEach((c) => {
      const anim = c.querySelector('img.anim');
      if (!anim || !canHover) return;
      c.addEventListener('pointerenter', () => {
        if (!anim.getAttribute('src')) { anim.addEventListener('load', () => c.classList.contains('hov') && c.classList.add('play'), { once: true }); anim.src = anim.dataset.src; }
        else c.classList.add('play');
        c.classList.add('hov');
      });
      c.addEventListener('pointerleave', () => c.classList.remove('hov', 'play'));
    });
    // 상세 창 열기(카드 · 한눈에 보기의 제목)·닫기·그림 넘기기
    root.addEventListener('click', (e) => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return;   // 새 탭으로 열기는 브라우저에 맡김
      const o = e.target.closest('[data-open]');
      if (o) { e.preventDefault(); openProject(o.dataset.open); }
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) return closeModal();                    // 창 바깥(배경)
      if (e.target.closest('[data-close]')) return closeModal();
      const th = e.target.closest('[data-gi]');
      if (th) return showShot(+th.dataset.gi);
      const st = e.target.closest('[data-step]');
      if (st) return showShot(shotNow() + +st.dataset.step);
    });
    modal.addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.closest('.pm-gal')) { e.preventDefault(); showShot(shotNow() + (e.key === 'ArrowRight' ? 1 : -1)); }
    });
    modal.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(); });
    addEventListener('resize', () => layoutMedia(), { passive: true });
    addEventListener('beforeprint', () => eager());                    // Ctrl+P: 아직 받지 않은 그림을 바로 받기 시작(할 수 있는 만큼)
  }

  const eager = () => document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
  const loaded = (i) => (i.complete ? null : new Promise((r) => {     // decode()·rAF는 쓰지 않음: 가려진 창에서 끝나지 않음(발표 덱 키트와 같은 이유)
    i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));

  // 준비: 데스크톱 기기면 인쇄용 그림을 미리 다 받아 Ctrl+P도 빠짐없이 인쇄(휴대폰·데이터 절약 모드는 Ctrl+P를 누를 때 받기 시작)
  async function settle() {
    const desk = matchMedia('(pointer: fine)').matches && !(navigator.connection && navigator.connection.saveData);
    if (desk) eager();
    await Promise.race([Promise.all([...document.querySelectorAll('img:not([loading="lazy"])')].map(loaded)), new Promise((r) => setTimeout(r, 20000))]);
    if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]);
    if (!userMoved) {                                                  // 글꼴이 바뀌며 절 높이가 달라져 도착 위치가 밀린 만큼 다시 맞춤
      const el = arrived && document.getElementById(arrived);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      else if (restoreY) scrollTo({ top: restoreY, behavior: 'instant' });
    }
    html.dataset.pfReady = 'yes';
    resolveReady(report());
    if (new URLSearchParams(location.search).get('pf-audit') === '1') writeAudit();
  }

  function report() {
    const imgs = [...document.images].filter((i) => i.getAttribute('src'));
    return {
      page: 'portfolio', ready: html.dataset.pfReady, sections: info.sections, projects: info.projects,
      images: { total: imgs.length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
                pending: imgs.filter((i) => !i.complete).map((i) => i.getAttribute('src')) },
      cardGifs: [...document.querySelectorAll('.pc img.anim')].map((i) => i.dataset.src),
      deckLinks: [...document.querySelectorAll('.prt .flist a.pill')].map((a) => a.getAttribute('href')),
      overflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      errors: info.errors, strings: PF.stringsReport(),
    };
  }
  function writeAudit() {
    let pre = document.getElementById('pf-audit');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'pf-audit'; pre.hidden = true; document.body.appendChild(pre); }
    const bytes = new TextEncoder().encode(JSON.stringify(report()));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    pre.textContent = btoa(bin);
  }
})();
