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

    expect(onFinish).toHaveBeenCalledWith(100);
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
