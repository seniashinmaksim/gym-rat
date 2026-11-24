/** Part 8 UI: the short forward warning renders both kinds and the two buttons, in English and Russian. */
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { ForwardWarning } from '../src/ui/components/ForwardWarning';
import type { ForwardFinding } from '../src/domain/sequence';
import { setLang } from '../src/i18n/core';

const limit: ForwardFinding = { check: 'interference', severity: 'limit', date: '2026-11-17', muscle: 'biceps', affectsExerciseId: 'pull_up', hoursLeft: 12, text: "May reduce Tuesday's pull-up — biceps still recovering." };
const noop = () => undefined;

describe('ForwardWarning', () => {
  it('a real limit: label, the short text, the better day and both buttons', () => {
    const html = renderToString(h(ForwardWarning, { findings: [limit], moveDate: '2026-11-17', clean: true, onMove: noop, onKeep: noop }));
    expect(html).toContain('Recovery limit');
    expect(html).toContain('May reduce Tuesday');
    expect(html).toMatch(/Better on Tue/);
    expect(html).toMatch(/Move to Tue/);
    expect(html).toContain('Keep today');
    expect(html).not.toMatch(/truncate|line-clamp/);
  });
  it('a recommendation looks different; "still overlaps" when no clean day exists', () => {
    const html = renderToString(h(ForwardWarning, { findings: [{ ...limit, severity: 'recommendation' }], moveDate: '2026-11-19', clean: false, onKeep: noop }));
    expect(html).toContain('Tip');
    expect(html).toMatch(/best option, but still overlaps/);
    expect(html).not.toContain('Move to');
  });
  it('nothing to show → nothing rendered', () => {
    expect(renderToString(h(ForwardWarning, { findings: [], moveDate: null, clean: true }))).toBe('');
  });
  it('Russian labels', () => {
    setLang('ru');
    try {
      const html = renderToString(h(ForwardWarning, { findings: [limit], moveDate: '2026-11-17', clean: true, onMove: noop, onKeep: noop }));
      expect(html).toContain('Предел восстановления');
      expect(html).toContain('Оставить сегодня');
      expect(html).toContain('Перенести');
    } finally { setLang('en'); }
  });
});
