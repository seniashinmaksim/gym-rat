/**
 * Back gesture vs open sheets (src/ui/backClose.ts), on a fake browser history whose back() / forward() arrive
 * later, as in a browser. Owner's report 2026-11-26: after adding a weigh-in, and after using the More menu, Back
 * did not return to the screen he came from (it skipped it).
 */
import { describe, expect, it } from 'vitest';
import { createBackClose, SHEET_MARK } from '../src/ui/backClose';

function browser(start: string) {
  const entries: { state: unknown; href: string }[] = [{ state: { idx: 0 }, href: start }];
  let i = 0;
  let t = 0;
  const pending: (() => void)[] = [];
  let onPop: ((s: unknown) => void) | null = null;
  const go = (d: number) => pending.push(() => {
    const j = i + d;
    if (j < 0 || j >= entries.length) return; // nothing there: no popstate, as in a browser
    i = j;
    onPop?.(entries[i].state);
  });
  const env = {
    history: {
      get state() { return entries[i].state; },
      pushState(state: unknown) { entries.splice(i + 1); entries.push({ state, href: entries[i].href }); i++; },
      back: () => go(-1),
      forward: () => go(1),
    },
    href: () => entries[i].href,
    listen: (fn: (s: unknown) => void) => { onPop = fn; },
    now: () => t,
  };
  const bc = createBackClose(env);
  /** Let the queued history steps arrive (each may queue another). */
  const settle = () => { let n = 0; while (pending.length) { pending.shift()!(); if (++n > 20) throw new Error('loop'); } };
  return {
    bc,
    /** The router's own navigation (a link tap): a new entry with a new URL. */
    navigate(href: string) { entries.splice(i + 1); entries.push({ state: { idx: i + 1 }, href }); i++; },
    back() { go(-1); settle(); },
    forward() { go(1); settle(); },
    get page() { return entries[i].href; },
    get length() { return entries.length; },
    tick(ms: number) { t += ms; },
    entries,
    pending,
  };
}

/** A sheet as the app mounts it: registered while open; `close` unregisters (as the unmount does). */
function sheet(b: ReturnType<typeof browser>) {
  const s = { open: true, unregister: () => undefined as void };
  s.unregister = b.bc.register(() => { s.open = false; s.unregister(); });
  return { get open() { return s.open; }, close() { s.open = false; s.unregister(); } };
}

describe('Back with sheets and menus (owner 2026-11-26)', () => {
  it('History -> More -> Body -> Back shows History (it went to the Week screen)', () => {
    const b = browser('/');
    b.navigate('/history');
    const more = sheet(b); // the More menu
    b.navigate('/body'); // tap Body in the menu ...
    more.close(); // ... the menu closes because the path changed
    b.back();
    expect(b.page).toBe('/history');
    b.back();
    expect(b.page).toBe('/');
  });

  it('weigh-in saved on Body, then another screen, then Back shows Body', () => {
    const b = browser('/');
    b.navigate('/body');
    const add = sheet(b);
    add.close(); // Save
    b.navigate('/history');
    b.back();
    expect(b.page).toBe('/body');
    b.back();
    expect(b.page).toBe('/');
  });

  it('weigh-in saved, then Back right away leaves Body in ONE press (the entry under it is the same page)', () => {
    const b = browser('/');
    b.navigate('/body');
    sheet(b).close();
    b.back();
    expect(b.page).toBe('/');
  });

  it('Back with a sheet open closes it and stays on the page; the next Back leaves', () => {
    const b = browser('/');
    b.navigate('/body');
    const add = sheet(b);
    b.back();
    expect(add.open).toBe(false);
    expect(b.page).toBe('/body');
    b.back();
    expect(b.page).toBe('/');
  });

  it('two sheets: Back closes the top one, then the one below, then leaves', () => {
    const b = browser('/');
    b.navigate('/log');
    const lower = sheet(b);
    const upper = sheet(b);
    expect(b.length).toBe(3); // one mark for both
    b.back();
    expect([upper.open, lower.open, b.page]).toEqual([false, true, '/log']);
    b.back();
    expect([lower.open, b.page]).toEqual([false, '/log']);
    b.back();
    expect(b.page).toBe('/');
  });

  it('Forward after Back passed a left-over mark goes on to the later page', () => {
    const b = browser('/');
    b.navigate('/history');
    const more = sheet(b);
    b.navigate('/body');
    more.close();
    b.back();
    expect(b.page).toBe('/history');
    b.forward();
    expect(b.page).toBe('/body');
    b.back();
    expect(b.page).toBe('/history');
  });

  it('a sheet opened again on a page with a left-over mark reuses it (no extra entries)', () => {
    const b = browser('/');
    b.navigate('/body');
    sheet(b).close();
    const n = b.length;
    sheet(b).close();
    expect(b.length).toBe(n);
  });

  it('a step the app took that never arrives does not swallow a real Back later', () => {
    const b = browser('/body'); // first entry of the tab
    sheet(b).close(); // left-over mark on the only page
    b.back(); // same page under it -> the app steps back from the first entry: nothing there, no popstate
    expect(b.page).toBe('/body');
    b.tick(2000);
    const add = sheet(b);
    b.back(); // a real Back much later must close the sheet
    expect(add.open).toBe(false);
  });

  it('marks carry the router state of the page under them and an id', () => {
    const b = browser('/');
    b.navigate('/body');
    sheet(b);
    const st = b.entries[b.entries.length - 1].state as Record<string, unknown>;
    expect(st.idx).toBe(1);
    expect(typeof st[SHEET_MARK]).toBe('string');
  });
});
