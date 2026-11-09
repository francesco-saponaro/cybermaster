// The five arcade games: one bonus round per zone, opened by the zone's boss.
// What each one is called, who sends you in, how to play it, and the scores
// its stars need.

import type { ZoneId } from './types';
import type { Speaker } from './story';

export type GameId = 'packet-runner' | 'tower-defence' | 'network-sweeper' | 'lockdown' | 'triage-rush';

export interface ArcadeGame {
  id: GameId;
  zone: ZoneId;
  title: string;
  /** One line for the arcade list. */
  tagline: string;
  /** What a run teaches, in one sentence. */
  teaches: string;
  /** The teammate's line on the start screen, tied to the case. */
  speaker: Speaker;
  line: string;
  /** Three short lines on how to play. */
  howTo: [string, string, string];
  /** Keys and what they do; the touch buttons are on screen. */
  controls: { keys: string; does: string }[];
  /** Scores for one, two and three stars. */
  stars: [number, number, number];
  /** About how long a run lasts, in seconds. */
  seconds: number;
}

export const ARCADE: ArcadeGame[] = [
  {
    id: 'packet-runner',
    zone: 'wire',
    title: 'Packet Runner',
    tagline: 'Let the customers in, stop the forged requests',
    teaches: 'Spotting an edited cookie, a missing login, a foreign Origin, an unsigned or expired token and a copied session at a glance.',
    speaker: 'Bruno',
    line: "This is Monday night's traffic at the shop's front door, sped up. Let the customers through and stop what the attacker sent.",
    howTo: [
      'Requests slide along three lanes towards the gate on the right.',
      'Pick a lane, then allow or block the request waiting in its gate.',
      'A wrong call costs a life. Right calls in a row build a multiplier.',
    ],
    controls: [
      { keys: 'Up / Down or W / S', does: 'Change lane' },
      { keys: 'Right or A', does: 'Allow' },
      { keys: 'Left or B', does: 'Block' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [2000, 7000, 15000],
    seconds: 90,
  },
  {
    id: 'tower-defence',
    zone: 'arena',
    title: 'Hold the Line',
    tagline: 'Put the right fix in front of each attack',
    teaches: 'Which fix stops which attack: a parameterised query stops SQL injection and nothing else, and a WAF slows everything but stops nothing.',
    speaker: 'Ines',
    line: 'Every attack in the log is heading for the database again. Put the right fix in its way. The firewall only slows them down.',
    howTo: [
      'Attacks walk the path to the database. Each wave is shown before it starts.',
      'Pick a fix and place it on a tile beside the path. It covers the path tiles around it.',
      'A fix stops only the attack it really fixes. Anything else walks past it.',
    ],
    controls: [
      { keys: '1 to 7', does: 'Pick a fix' },
      { keys: 'Arrow keys', does: 'Move the cursor' },
      { keys: 'Enter or Space', does: 'Place the fix' },
      { keys: 'N', does: 'Send the next wave now' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [1200, 2400, 3400],
    seconds: 110,
  },
  {
    id: 'network-sweeper',
    zone: 'perimeter',
    title: 'Network Sweeper',
    tagline: 'Find the weak host before the attacker does',
    teaches: 'Recon in order: find live hosts, then ports, then versions, then the CVE, and trust a banner over a scanner guess.',
    speaker: 'Ines',
    line: "Harbor's network again, and someone else is scanning it right now. Find the weak machine first, and stay inside the scope we signed.",
    howTo: [
      'The grid is the network. Ping a block to see which hosts are up.',
      'Port scan a host, check its version, then look the version up.',
      'Flag every vulnerable host before the attacker bar fills. Leave the hatched area alone.',
    ],
    controls: [
      { keys: 'Arrow keys', does: 'Move between hosts' },
      { keys: '1 to 4', does: 'Ping, ports, version, look up' },
      { keys: 'F', does: 'Flag as vulnerable' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [500, 1000, 1300],
    seconds: 100,
  },
  {
    id: 'lockdown',
    zone: 'cloud',
    title: 'Lockdown',
    tagline: 'Close every attacker path, keep every user working',
    teaches: 'Least privilege across firewall rules, bucket policies and roles: assume a server will be broken into, and make sure that gets the attacker nothing.',
    speaker: 'Yasmin',
    line: "Lantern's account, one diagram at a time. Close every way in for the attacker without locking out the people who work there.",
    howTo: [
      'Red lines are routes the attacker has. Green lines are people who need access.',
      'Change a rule: tap it and pick a setting, or drag a setting from the tray onto it.',
      'Clear each diagram in as few changes as you can. The clock runs for the whole set.',
    ],
    controls: [
      { keys: 'Tab and Enter', does: 'Pick a rule' },
      { keys: '1 to 4', does: 'Choose a setting' },
      { keys: 'R', does: 'Undo all changes on this diagram' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [600, 1200, 1700],
    seconds: 120,
  },
  {
    id: 'triage-rush',
    zone: 'report',
    title: 'Triage Rush',
    tagline: 'Rank each finding before the next one lands',
    teaches: 'How severity follows from the facts: who can reach it, whether a login or a click is needed, and what it exposes.',
    speaker: 'Ines',
    line: "Claire wants every finding ranked before her board meeting. Quick and right: her developers will fix them in this order.",
    howTo: [
      'Findings arrive one at a time with the evidence that matters.',
      'Set the severity before its timer runs out. Right answers in a row build a streak.',
      'For a bonus, first pick the fact that drives the score.',
    ],
    controls: [
      { keys: '1 to 4', does: 'Low, Medium, High, Critical' },
      { keys: 'Q, W, E', does: 'Pick the driver (bonus)' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [900, 1800, 2700],
    seconds: 90,
  },
];

export const ARCADE_BY_ID = Object.fromEntries(ARCADE.map((g) => [g.id, g])) as Record<GameId, ArcadeGame>;
export const ARCADE_BY_ZONE = Object.fromEntries(ARCADE.map((g) => [g.zone, g])) as Record<ZoneId, ArcadeGame>;
