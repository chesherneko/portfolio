// 화면 모드(밝게·어둡게) — 포트폴리오 문서·발표 덱·상세 문서 공용. <head>에서 CSS보다 먼저 실어 첫 화면부터 그 모드로 그림(깜빡임 없음)
//   html[data-mode="light"|"dark"]만 정하고, 색은 각 페이지 CSS의 html[data-mode="dark"] 블록(화면 전용 — 인쇄·PDF는 늘 밝게)이 바꿈
//   고른 모드는 localStorage 'pf-mode'에 남아 세 페이지가 같이 따름(처음 열면 밝게). 다른 탭에서 바꾸면 이 탭도 따라감
//   단추: PFMode.button()이 만든 [data-pf-mode] — 누르면 바뀜. 바뀔 때마다 window에 'pf-mode' 이벤트(detail = 모드)
const PFMode = (() => {
  const KEY = 'pf-mode';
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
  const get = () => (root.dataset.mode === 'dark' ? 'dark' : 'light');
  function sync() {
    const dark = get() === 'dark';
    document.querySelectorAll('[data-pf-mode]').forEach((b) => b.setAttribute('aria-checked', String(dark)));
  }
  function set(mode, save) {
    root.dataset.mode = mode === 'dark' ? 'dark' : 'light';
    if (save) { try { localStorage.setItem(KEY, get()); } catch { /* 저장이 막힌 창(시크릿 등): 이 페이지에서만 바뀜 */ } }
    sync();
    dispatchEvent(new CustomEvent('pf-mode', { detail: get() }));
  }
  const toggle = () => set(get() === 'dark' ? 'light' : 'dark', true);
  // 스위치 단추(해 ↔ 달). cls로 페이지별 자리 맞춤 클래스를 더함
  const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>';
  const button = (cls = '') => `<button type="button" class="pf-mode${cls ? ' ' + cls : ''}" role="switch" aria-checked="${get() === 'dark'}" aria-label="다크 모드" title="다크 모드" data-pf-mode>`
    + `<span class="pf-mode-track"><span class="pf-mode-i sun">${SUN}</span><span class="pf-mode-i moon">${MOON}</span><span class="pf-mode-knob"></span></span></button>`;

  set(read());
  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-pf-mode]')) toggle(); });
  addEventListener('storage', (e) => { if (e.key === KEY) set(e.newValue === 'dark' ? 'dark' : 'light'); });
  return { get, set, toggle, button, sync };
})();
