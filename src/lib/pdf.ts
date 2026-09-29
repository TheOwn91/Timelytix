import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ABSENCE_TYPES } from './absences';
import { shareOrDownload } from './device';
import { monthSummary } from './calc';
import { STATES } from './holidays';
import { describeChanges, termsList } from './terms';
import { yearOverview } from './year';
import { MONTHS, WEEKDAYS_SHORT, dateKey, fmtDate, fmtDuration, fmtHoursDecimal, fmtMoney, fmtTime, parseDateKey, pad } from './time';
import type { AppState, Project } from './types';

/** Die Standardschriften von jsPDF kennen nur WinAnsi – U+2212 (Minus) ersetzen. */
const pdfSafe = (s: string) => s.replace(/\u2212/g, '-');

export function buildMonthReport(state: AppState, project: Project, year: number, month0: number, now = Date.now()) {
  const sum = monthSummary(state, project, year, month0, now);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const title = `Monatsbericht ${MONTHS[month0]} ${year}`;
  const hasRate = sum.hasRate;
  const activeRules = sum.surcharges.map((s) => s.rule);

  doc.setFontSize(18);
  doc.text(title, 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text(`Arbeitgeber / Projekt: ${project.name}`, 14, 25);
  doc.text(
    `Soll/Tag: ${fmtDuration(sum.endTerms.dailyTargetHours * 60)} h  ·  Feiertage: ${STATES[project.state] ?? '–'}`,
    14,
    30,
  );
  doc.text(`Erstellt am ${new Date(now).toLocaleDateString('de-DE')}`, pageWidth - 14, 18, { align: 'right' });

  // Änderungen von Stundenlohn, Soll, Zuschlägen … innerhalb dieses Monats
  const first = sum.days[0].date;
  const last = sum.days[sum.days.length - 1].date;
  const allTerms = termsList(project);
  const changes = allTerms
    .map((t, i) => ({ t, prev: allTerms[i - 1] }))
    .filter(({ t }) => t.from >= first && t.from <= last)
    .map(({ t, prev }) => `Ab ${fmtDate(t.from, false)}: ${describeChanges(prev, t, project).join(', ')}`);
  let tableTop = 36;
  if (changes.length) {
    doc.setFontSize(9);
    changes.forEach((line, i) => doc.text(pdfSafe(line), 14, 35 + i * 4.5));
    tableTop = 38 + changes.length * 4.5;
  }
  doc.setTextColor(0);

  const body = sum.days.map((d): string[] => {
    const date = parseDateKey(d.date);
    const times = d.sessions
      .map(
        (s) =>
          `${fmtTime(s.start)}${dateKey(s.start) !== d.date ? ' (-1)' : ''}–${
            s.end ? fmtTime(s.end) + (dateKey(s.end) !== d.date ? ' (+1)' : '') : 'läuft'
          }`,
      )
      .join('\n');
    const remarks: string[] = [];
    if (d.holiday) remarks.push(d.holiday);
    if (d.absence) remarks.push(ABSENCE_TYPES[d.absence.type].label + (d.absence.note ? `: ${d.absence.note}` : ''));
    const autoPauses = [
      ...d.sessions.flatMap((s) => s.pauses.filter((p) => p.auto && p.end !== undefined).map((p) => [p.start, p.end!] as const)),
      ...d.autoBreaks.map((b) => [b.start, b.start + b.minutes * 60_000] as const),
    ];
    for (const [a, b] of autoPauses) remarks.push(`autom. Pause ${fmtTime(a)}–${fmtTime(b)}`);
    if (d.interruption > 0) remarks.push(`Unterbrechung ${fmtDuration(d.interruption)} h`);
    for (const s of d.sessions) if (s.note) remarks.push(s.note);
    const surcharges = activeRules
      .filter((r) => (d.surcharges[r.id] ?? 0) > 0)
      .map((r) => `${r.name} ${fmtDuration(d.surcharges[r.id])}`)
      .join('\n');
    return [
      `${WEEKDAYS_SHORT[date.getDay()]} ${pad(date.getDate())}.${pad(month0 + 1)}.`,
      times,
      d.sessions.length ? fmtDuration(d.pause) : '',
      d.sessions.length ? fmtDuration(d.worked) : d.credit ? `(${fmtDuration(d.credit)})` : '',
      d.target ? fmtDuration(d.target) : '',
      surcharges,
      remarks.join('\n'),
    ];
  });

  autoTable(doc, {
    startY: tableTop,
    head: [['Datum', 'Zeiten', 'Pause', 'Arbeit', 'Soll', 'Zulagen', 'Bemerkung']],
    body: body.map((r) => r.map(pdfSafe)),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.4, valign: 'middle' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 26 },
      2: { cellWidth: 13, halign: 'right' },
      3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 13, halign: 'right' },
      5: { cellWidth: 36 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const day = sum.days[data.row.index];
      if (!day.isWorkday || day.holiday) data.cell.styles.fillColor = [241, 245, 249];
      if (day.untracked) data.cell.styles.fillColor = [254, 242, 242];
    },
  });

  // Zusammenfassung
  const summaryRows: string[][] = [
    ['Gearbeitete Tage', String(sum.workedDays), ''],
    ['Arbeitszeit', `${fmtDuration(sum.worked)} h`, `${fmtHoursDecimal(sum.worked)} h`],
    ['Gutschrift (Urlaub, Krank …)', `${fmtDuration(sum.credit)} h`, `${fmtHoursDecimal(sum.credit)} h`],
    ['Soll', `${fmtDuration(sum.target)} h`, `${fmtHoursDecimal(sum.target)} h`],
    ['Saldo (Über-/Minusstunden)', `${fmtDuration(sum.balance, true)} h`, `${fmtHoursDecimal(sum.balance)} h`],
  ];
  const { fromAccount, uncovered, added } = sum.shortTime;
  const overview = yearOverview(state, project, year, now);
  const account = overview.overtime.months[month0];
  if (fromAccount + uncovered > 0) {
    const total = fromAccount + uncovered;
    summaryRows.push(['Kurzarbeitstage', `${fmtDuration(total)} h`, `${fmtHoursDecimal(total)} h`]);
    if (fromAccount > 0)
      summaryRows.push(['− mit Überstunden verrechnet', `${fmtDuration(-fromAccount)} h`, `${fmtHoursDecimal(-fromAccount)} h`]);
    if (added > 0)
      summaryRows.push(['+ fehlende Stunden des Monats', `${fmtDuration(added, true)} h`, `${fmtHoursDecimal(added)} h`]);
    const remaining = uncovered + added;
    summaryRows.push(['= Kurzarbeit gesamt', `${fmtDuration(remaining)} h`, `${fmtHoursDecimal(remaining)} h`]);
    summaryRows.push(['Stundenkonto danach', `${fmtDuration(account?.total ?? 0, true)} h`, `${fmtHoursDecimal(account?.total ?? 0)} h`]);
  }
  const pct = sum.endTerms.overtimeSurchargePercent ?? 0;
  if (pct > 0) {
    summaryRows.push([
      `Überstundenzuschlag (${pct} %)${account.complete ? '' : ' – am Monatsende'}`,
      `${fmtDuration(account.surcharge, true)} h`,
      `${fmtHoursDecimal(account.surcharge)} h`,
    ]);
  }
  summaryRows.push([
    account.complete ? 'Überstundenkonto zum Monatsende' : 'Überstundenkonto (Stand heute)',
    `${fmtDuration(account.total, true)} h`,
    `${fmtHoursDecimal(account.total)} h`,
  ]);
  summaryRows.push([`Resturlaub ${year}`, `${overview.vacation.remaining.toLocaleString('de-DE')} Tag(e)`, '']);
  for (const [type, count] of Object.entries(sum.absenceCounts)) {
    summaryRows.push([ABSENCE_TYPES[type as keyof typeof ABSENCE_TYPES].label, `${count.toLocaleString('de-DE')} Tag(e)`, '']);
  }
  if (hasRate) summaryRows.push(['Grundlohn', fmtMoney(sum.baseWage), '']);

  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const summaryHeight = Math.max(summaryRows.length, sum.surcharges.length + 2) * 5.5 + 12;
  let y = finalY() + 8;
  if (y + summaryHeight > 285) {
    doc.addPage();
    y = 18;
  }
  const blockTop = y;
  const half = (pageWidth - 28 - 6) / 2;
  doc.setFontSize(12);
  doc.text('Zusammenfassung', 14, y);
  autoTable(doc, {
    startY: y + 2,
    body: summaryRows.map((r) => r.map(pdfSafe)),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', cellWidth: 22 }, 2: { halign: 'right', cellWidth: 20 } },
    margin: { left: 14 },
    tableWidth: half,
  });
  let bottom = finalY();

  if (sum.surcharges.length) {
    const left = 14 + half + 6;
    doc.setFontSize(12);
    doc.text('Zulagen', left, blockTop);
    const rows = sum.surcharges.map((s) => [
      s.rule.name,
      `${s.rule.percent} %`,
      `${fmtDuration(s.minutes)} h`,
      hasRate ? fmtMoney(s.amount) : '–',
    ]);
    if (hasRate) rows.push(['Summe', '', '', fmtMoney(sum.surchargeTotal)]);
    autoTable(doc, {
      startY: blockTop + 2,
      head: [['Zulage', 'Satz', 'Stunden', 'Betrag']],
      body: rows,
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 1.4 },
      headStyles: { fillColor: [100, 116, 139] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (data) => {
        if (hasRate && data.section === 'body' && data.row.index === rows.length - 1) data.cell.styles.fontStyle = 'bold';
      },
      margin: { left },
      tableWidth: half,
    });
    bottom = Math.max(bottom, finalY());
  }

  // Unterschriften
  y = bottom + 22;
  if (y > 280) {
    doc.addPage();
    y = 40;
  }
  doc.setFontSize(9);
  doc.setDrawColor(120);
  doc.line(14, y, 84, y);
  doc.line(pageWidth - 84, y, pageWidth - 14, y);
  doc.text('Datum, Unterschrift Arbeitnehmer', 14, y + 4);
  doc.text('Datum, Unterschrift Arbeitgeber', pageWidth - 84, y + 4);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${project.name} · ${title} · Seite ${i}/${pages}`, pageWidth / 2, 290, { align: 'center' });
  }

  const fileName = `Monatsbericht_${project.name.replace(/[^\wäöüÄÖÜß-]+/g, '_')}_${year}-${pad(month0 + 1)}.pdf`;
  return { doc, fileName };
}

export function exportMonthPdf(state: AppState, project: Project, year: number, month0: number) {
  const { doc, fileName } = buildMonthReport(state, project, year, month0);
  return shareOrDownload(doc.output('blob'), fileName);
}
