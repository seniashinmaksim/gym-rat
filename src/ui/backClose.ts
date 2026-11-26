/**
 * The phone's back gesture / browser Back closes the top-most open sheet instead of leaving the page.
 *
 * Opening a sheet pushes ONE marked history entry with the same URL as the page under it ("the mark"); further sheets
 * reuse it. A sheet closed normally (Save, ✕, a link inside it) leaves the mark in place — removing it with
 * history.back() would race with a navigation right after closing. Back handles the left-over marks instead:
 *
 * - Back with a sheet open → the sheet closes (a sheet still open below gets a mark again).
 * - Back from the page that was shown ON a mark (a sheet was closed there) → the entry under it shows the same page,
 *   so it is passed straight through: Back never has to be pressed twice.
 * - Back from a LATER page that arrives on a left-over mark → passed through to the page under it, and that page is
 *   SHOWN. (Bug fixed 2026-11-26: the arrival on that page was taken for "same page again" and skipped as well, so
 *   History → More → Body → Back went to the Week screen instead of History, and saving a weigh-in on Body, opening
 *   another screen and pressing Back skipped Body.)
 * - Forward onto a mark that Back passed through → passed through forwards.
 *
 * The steps the app takes itself (history.back() / forward()) are recognised when their popstate arrives and never
 * trigger another step. Pure logic on an injected history so that every case is unit-tested (tests/back-close.test.ts).
 */

export const SHEET_MARK = 'gymratSheet';

export interface BackEnv {
  history: { readonly state: unknown; pushState(state: unknown, unused: string): void; back(): void; forward(): void };
  /** The current URL (location.href). */
  href(): string;
  /** Subscribe to popstate (called once, on the first sheet). */
  listen(onPop: (state: unknown) => void): void;
  now(): number;
}

/** How long a step the app took itself may take to arrive (a step that never arrives must not swallow a real Back). */
const SELF_STEP_MS = 1500;

export function createBackClose(env: BackEnv) {
  const stack: { close: () => void }[] = [];
  const markOf = (st: unknown): string | null => {
    const v = (st as Record<string, unknown> | null | undefined)?.[SHEET_MARK];
    return v ? String(v) : null; // older builds stored `true`
  };
  let seq = 0;
  let onMark = markOf(env.history.state) != null;
  let markHref = onMark ? env.href() : '';
  /** Pops the app caused itself and has already decided about. */
  let selfPops = 0;
  let selfUntil = 0;
  /** The mark Back last passed through: arriving on it again means Forward. */
  let passed: string | null = null;
  let listening = false;

  function pushMark() {
    const base = (env.history.state && typeof env.history.state === 'object' ? env.history.state : {}) as Record<string, unknown>;
    env.history.pushState({ ...base, [SHEET_MARK]: `${env.now().toString(36)}-${++seq}` }, '');
    onMark = true;
    markHref = env.href();
  }
  function step(dir: 'back' | 'forward') {
    selfPops++;
    selfUntil = env.now() + SELF_STEP_MS;
    if (dir === 'back') env.history.back();
    else env.history.forward();
  }
  function onPop(state: unknown) {
    const wasMark = onMark;
    const fromHref = markHref;
    const id = markOf(state);
    onMark = id != null;
    if (onMark) markHref = env.href();
    if (selfPops > 0) {
      const mine = env.now() <= selfUntil;
      selfPops--;
      if (mine) return; // our own step has arrived: it was decided when it was taken
      selfPops = 0;
    }
    const top = stack[stack.length - 1];
    if (top) {
      top.close();
      // A sheet below is still open: it gets its own entry again (whether or not `close` unregistered the top one yet).
      if (stack.some((e) => e !== top)) pushMark();
      return;
    }
    if (id != null) {
      // A mark left under a later page (no sheet is open on it): show the page under it, or go on forwards.
      if (passed === id) { passed = null; step('forward'); } else { passed = id; step('back'); }
      return;
    }
    // Back from the page shown on a mark lands on the same page again: pass it through.
    if (wasMark && env.href() === fromHref) step('back');
  }

  return {
    register(close: () => void): () => void {
      if (!listening) { env.listen(onPop); listening = true; }
      const entry = { close };
      stack.push(entry);
      if (markOf(env.history.state) == null) pushMark();
      else { onMark = true; markHref = env.href(); }
      return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    /** For tests: open sheets. */
    get open() { return stack.length; },
  };
}
