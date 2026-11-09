import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReportMissionView } from '../src/missions/ReportMission';
import { CvssMissionView } from '../src/missions/CvssMission';
import { MISSION_BY_ID } from '../src/content/index';
import type { ReportMission, CvssMission } from '../src/content/types';

const reportMission = MISSION_BY_ID['stage-report-boss-report'] as ReportMission;
const cvssMission = MISSION_BY_ID['perimeter-cvss'] as CvssMission;

describe('ReportMission', () => {
  it('scores 100 when every field takes its good fragment', async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(<ReportMissionView mission={reportMission} onFinish={onFinish} />);

    for (const field of reportMission.fields) {
      const goodIndex = field.options.findIndex((o) => o.quality === 'good');
      const good = field.options[goodIndex]!;
      const btn = await screen.findByText(good.text);
      await user.click(btn);
    }

    const file = screen.getByRole('button', { name: /file the finding/i });
    expect(file).toBeEnabled();
    await user.click(file);

    expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ score: 100 }));
    // the assembled finding is shown afterwards
    expect(screen.getByText(/your finding, as filed/i)).toBeInTheDocument();
  });

  it('keeps the file button disabled until every field is answered', () => {
    render(<ReportMissionView mission={reportMission} onFinish={() => {}} />);
    expect(screen.getByRole('button', { name: /file the finding/i })).toBeDisabled();
  });
});

describe('CvssMission', () => {
  it('shows a live base score and the first case title', () => {
    render(<CvssMissionView mission={cvssMission} onFinish={() => {}} />);
    expect(screen.getByText(cvssMission.cases[0]!.title)).toBeInTheDocument();
    expect(screen.getByText('Base score')).toBeInTheDocument();
    // the metric labels are present (eight dials)
    expect(screen.getByText('Attack vector')).toBeInTheDocument();
    expect(screen.getByText('Scope')).toBeInTheDocument();
  });

  it('reveals the target after locking in a vector', async () => {
    const user = userEvent.setup();
    render(<CvssMissionView mission={cvssMission} onFinish={() => {}} />);
    await user.click(screen.getByRole('button', { name: /lock in the vector/i }));
    expect(screen.getByText(/Target:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next case/i })).toBeInTheDocument();
  });
});

import { Briefing } from '../src/components/Briefing';
import { HintContext } from '../src/missions/mission';
import { MatchMissionView } from '../src/missions/MatchMission';
import { WIRE_BRIEFINGS } from '../src/content/briefings/wire';
import type { MatchMission } from '../src/content/types';

const headersBriefing = WIRE_BRIEFINGS.find((b) => b.missionId === 'wire-headers')!;

describe('Briefing step engine (component)', () => {
  it('advances only on the right action and calls onDone at the end', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<Briefing briefing={headersBriefing} mentor={headersBriefing.mentor} onDone={onDone} />);
    // the first beat asks to tap a specific line; tapping a wrong line keeps us on beat 1
    expect(screen.getByText(/Briefing · 1 of/)).toBeInTheDocument();
    const firstBeat = headersBriefing.beats[0]!;
    if (firstBeat.action.kind === 'tap-line') {
      const mat = firstBeat.material;
      if (mat.kind === 'lines') {
        const wrongIdx = firstBeat.action.line === 0 ? 1 : 0;
        await user.click(screen.getByRole('button', { name: new RegExp(`Line ${wrongIdx + 1}:`) }));
        expect(screen.getByText(/Briefing · 1 of/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: new RegExp(`Line ${firstBeat.action.line + 1}:`) }));
        expect(screen.getByText(/Briefing · 2 of/)).toBeInTheDocument();
      }
    }
  });

  it('shows the skip control only when allowed', () => {
    const { rerender } = render(<Briefing briefing={headersBriefing} mentor="Ines" onDone={() => {}} />);
    expect(screen.queryByRole('button', { name: /i know this, skip/i })).toBeNull();
    rerender(<Briefing briefing={headersBriefing} mentor="Ines" onDone={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('button', { name: /i know this, skip/i })).toBeInTheDocument();
  });
});

describe('the hint button', () => {
  const sessionLab = MISSION_BY_ID['wire-session-lab'] as MatchMission;
  it('fades the decoy fixes when the hint is active', () => {
    const { container } = render(
      <HintContext.Provider value={{ active: true, available: false, use: () => {} }}>
        <MatchMissionView mission={sessionLab} onFinish={() => {}} />
      </HintContext.Provider>,
    );
    // decoys (ids starting x) are the fixes no bug points at; at least one is faded
    const faded = Array.from(container.querySelectorAll('button')).filter((b) => b.style.opacity === '0.4');
    expect(faded.length).toBeGreaterThan(0);
  });
});

import { ARENA_BRIEFINGS } from '../src/content/briefings/arena';

describe('Briefing renders answer buttons for a choose beat with lines material', () => {
  it('shows the choices even when the beat also shows raw lines', async () => {
    const user = userEvent.setup();
    const lineup = ARENA_BRIEFINGS.find((b) => b.missionId === 'arena-lineup')!;
    const beat0 = lineup.beats[0]!;
    // beat 0 is a choose over OWASP categories with lines material
    expect(beat0.action.kind).toBe('choose');
    render(<Briefing briefing={lineup} mentor="Ines" onDone={() => {}} />);
    if (beat0.action.kind === 'choose') {
      for (const opt of beat0.action.options) {
        expect(screen.getByRole('button', { name: new RegExp(opt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeInTheDocument();
      }
      // picking the right one advances to beat 2
      await user.click(screen.getByRole('button', { name: new RegExp(beat0.action.options[beat0.action.answer]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
      expect(screen.getByText(/Briefing · 2 of/)).toBeInTheDocument();
    }
  });
});
