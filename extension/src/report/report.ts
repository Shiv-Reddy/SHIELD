/**
 * The compliance report: reads the audit log, renders lib/report.ts's numbers.
 *
 * Like the sent-frame page it makes no requests and holds no state of its own.
 * Every figure is recomputed from the log on open, so the report and the
 * downloadable data file can never disagree.
 */

import { auditJson, readAudit, type AuditEntry } from '../lib/audit';
import { complianceSummary } from '../lib/report';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Report markup is missing ${selector}`);
  return element;
}

const number = new Intl.NumberFormat('en-IN');
const dateOnly = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

function text(tag: string, content: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = content;
  if (className) element.className = className;
  return element;
}

function milliseconds(value: number | null): string {
  if (value === null) return '–';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

function render(entries: AuditEntry[]): void {
  const meta = required<HTMLParagraphElement>('#meta');
  const summary = complianceSummary(entries);

  if (entries.length === 0) {
    meta.textContent = `Generated ${dateOnly.format(new Date())}`;
    required<HTMLElement>('#empty').hidden = false;
    return;
  }

  required<HTMLElement>('#report').hidden = false;

  const period =
    summary.firstAt !== null && summary.lastAt !== null
      ? `${dateOnly.format(summary.firstAt)} – ${dateOnly.format(summary.lastAt)}`
      : '';
  meta.textContent = `Period ${period} · Generated ${dateOnly.format(new Date())} · This device`;

  // The one sentence a reviewer reads. Stated from the log, and only as far as
  // the log supports: how many requests reached the AI, and that each went out
  // redacted — which is not a claim but the only way the code can send at all.
  const sent = summary.sentRedacted;
  required<HTMLParagraphElement>('#statement').textContent =
    sent === 0
      ? `Shield protected ${number.format(summary.protectedItems)} private items, and nothing was sent to an AI service in this period.`
      : `Shield protected ${number.format(summary.protectedItems)} private items. ${number.format(sent)} ${sent === 1 ? 'request' : 'requests'} reached the AI service, and every one was redacted on this device and checked for leftovers before it left.`;

  required<HTMLElement>('#k-protected').textContent = number.format(summary.protectedItems);
  required<HTMLElement>('#k-runs').textContent = number.format(summary.runs);
  required<HTMLElement>('#k-scans').textContent = number.format(summary.scans);
  required<HTMLElement>('#k-time').textContent = milliseconds(summary.medianRunMs);

  const categories = required<HTMLOListElement>('#categories');
  const largest = summary.byCategory[0]?.count ?? 1;
  for (const item of summary.byCategory) {
    const row = document.createElement('li');
    row.append(text('span', item.label, 'label'));
    row.append(text('span', `${number.format(item.count)} · ${Math.round(item.share * 100)}%`, 'count'));
    const track = text('span', '', 'track');
    const fill = text('span', '', 'fill');
    fill.style.width = `${Math.max(2, (item.count / largest) * 100)}%`;
    track.append(fill);
    row.append(track);
    categories.append(row);
  }

  const week = required<HTMLDivElement>('#week');
  const peak = Math.max(1, ...summary.lastSevenDays.map((day) => day.items));
  for (const day of summary.lastSevenDays) {
    const cell = text('div', '', 'day');
    cell.append(text('span', day.items > 0 ? number.format(day.items) : '', 'n'));
    const column = text('span', '', day.items > 0 ? 'col' : 'col zero');
    column.style.height = `${day.items > 0 ? Math.max(4, (day.items / peak) * 100) : 2}%`;
    cell.append(column);
    cell.append(text('span', weekday.format(new Date(`${day.day}T12:00:00`)), 'd'));
    week.append(cell);
  }

  const activity = required<HTMLTableSectionElement>('#activity');
  const shown = entries.slice(0, 15);
  for (const entry of shown) {
    const row = document.createElement('tr');
    row.append(text('td', dateTime.format(entry.at)));
    row.append(
      text(
        'td',
        entry.kind === 'run'
          ? 'AI task'
          : entry.examined === 'document-partial'
            ? 'Page scan (partial)'
            : 'Page scan',
      ),
    );
    row.append(text('td', number.format(entry.total), 'num'));
    row.append(
      entry.transmitted ? text('td', 'Yes, redacted', 'sent') : text('td', 'No, stayed on device', 'local'),
    );
    row.append(text('td', milliseconds(entry.durationMs), 'num'));
    activity.append(row);
  }
  required<HTMLParagraphElement>('#activity-note').textContent =
    entries.length > shown.length
      ? `Showing the latest ${shown.length} of ${entries.length}. Download the data for all of them.`
      : '';
}

required<HTMLButtonElement>('#print').addEventListener('click', () => window.print());

required<HTMLButtonElement>('#download').addEventListener('click', () => {
  void readAudit().then((entries) => {
    const blob = new Blob([auditJson(entries)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shield-compliance-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
});

void readAudit().then(render);
