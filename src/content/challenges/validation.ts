import type { TerminalLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import { dockNetwork, DOCK, type DockPlan } from '../levels/validation';

const guided = (id: string) => LEVEL_BY_ID[id] as TerminalLevel;

function dock(rng: Rng): DockPlan {
  const lan = `10.${rng.int(1, 60)}.${rng.int(1, 250)}`;
  const [ftp, ftpFixed, vsftpd, win, winOk, nas] = rng.sample(Array.from({ length: 200 }, (_, i) => i + 6), 6) as [number, number, number, number, number, number];
  return { ...DOCK, lan, ftp, ftpFixed, vsftpd, win, winOk, nas, me: rng.int(230, 254) };
}

const at = (p: DockPlan, n: number) => `${p.lan}.${n}`;

const modules: ChallengeGenerator = (rng) => {
  const p = dock(rng);
  const pick = rng.pick([
    { term: 'proftpd', answer: 'exploit/unix/ftp/proftpd_modcopy_exec', what: 'ProFTPD 1.3.5' },
    { term: 'ms17', answer: 'auxiliary/scanner/smb/smb_ms17_010', what: 'MS17-010, without exploiting it' },
    { term: 'samba', answer: 'exploit/linux/samba/is_known_pipename', what: 'Samba 4.5 (CVE-2017-7494)' },
    { term: 'apache', answer: 'exploit/multi/http/apache_normalize_path_rce', what: 'Apache 2.4.49' },
  ]);
  const level = asChallenge(guided('msf-modules'), {
    goal: `Find the Metasploit module for ${pick.what} and submit its full name.`,
    instruction: 'Search the module library and read before you choose.',
    network: dockNetwork(p),
    goals: [
      { id: 'scope', facts: ['cat:scope.txt'] },
      { id: 'start', facts: ['msf-start'] },
      { id: 'search', facts: [`msf-search:${pick.term}`] },
      { id: 'info', facts: [`msf-info:${pick.answer}`] },
      { id: 'answer', answers: [pick.answer] },
    ],
    wrong: [],
    otherwise: 'Submit the full module name as search printed it.',
  });
  return {
    level,
    signature: `${pick.term}:${p.lan}`,
    hints: ['Read scope.txt, then open msfconsole.', `\`search ${pick.term}\` lists the candidates; \`info <name>\` describes one.`, 'Submit the name exactly as printed, type prefix included.'],
    solution: { kind: 'terminal', commands: ['cat scope.txt', 'msfconsole', `search ${pick.term}`, `info ${pick.answer}`, `submit ${pick.answer}`] },
  };
};

const auxiliary: ChallengeGenerator = (rng) => {
  const p = dock(rng);
  const level = asChallenge(guided('msf-auxiliary'), {
    goal: `List the FTP servers on ${p.lan}.0/24 with an auxiliary scanner and submit the one running ProFTPD 1.3.5 exactly.`,
    instruction: 'One scanner, the whole range, then read the versions closely.',
    network: dockNetwork(p),
    goals: [
      { id: 'start', facts: ['msf-start'] },
      { id: 'use', facts: ['msf-use:auxiliary/scanner/ftp/ftp_version'] },
      { id: 'options', facts: ['msf-options:auxiliary/scanner/ftp/ftp_version'] },
      { id: 'rhosts', facts: [`msf-opt:RHOSTS=${p.lan}.0/24`] },
      { id: 'run', facts: [`msf-run:auxiliary/scanner/ftp/ftp_version:${p.lan}.0/24`] },
      { id: 'answer', answers: [at(p, p.ftp)] },
    ],
    wrong: [{ answers: [at(p, p.ftpFixed)], reason: '1.3.5a is the fixed release.' }],
    otherwise: 'Submit the address whose banner says ProFTPD 1.3.5 with no letter after it.',
  });
  return {
    level,
    signature: `${p.lan}:${p.ftp}:${p.ftpFixed}`,
    hints: ['The FTP version scanner lives under auxiliary/scanner/ftp.', `\`set RHOSTS ${p.lan}.0/24\` then \`run\`.`, '1.3.5a is fixed; 1.3.5 is not.'],
    solution: { kind: 'terminal', commands: ['msfconsole', 'use auxiliary/scanner/ftp/ftp_version', 'show options', `set RHOSTS ${p.lan}.0/24`, 'run', `submit ${at(p, p.ftp)}`] },
  };
};

const nse: ChallengeGenerator = (rng) => {
  const p = dock(rng);
  const level = asChallenge(guided('msf-nse'), {
    goal: `Confirm anonymous FTP on ${at(p, p.ftp)} and MS17-010 on ${at(p, p.win)} with safe scripts. Submit the CVE.`,
    instruction: 'Read the categories, run only safe scripts.',
    network: dockNetwork(p),
    goals: [
      { id: 'help', facts: ['nse-help:ftp-anon'] },
      { id: 'anon', facts: [`nse:ftp-anon:${at(p, p.ftp)}`] },
      { id: 'bad', facts: ['nse-help:ftp-vsftpd-backdoor'] },
      { id: 'smb', facts: [`nse:smb-vuln-ms17-010:${at(p, p.win)}`] },
      { id: 'answer', answers: ['CVE-2017-0143', 'MS17-010'] },
    ],
    wrong: [],
    otherwise: 'Submit the CVE on the IDs line of the SMB result.',
  });
  return {
    level,
    signature: `${p.lan}:${p.ftp}:${p.win}`,
    hints: ['`nmap --script-help <name>` shows categories; read ftp-anon and ftp-vsftpd-backdoor.', `\`nmap -p 21 --script ftp-anon ${at(p, p.ftp)}\`.`, `\`nmap -p 445 --script smb-vuln-ms17-010 ${at(p, p.win)}\`.`],
    solution: { kind: 'terminal', commands: ['nmap --script-help ftp-anon', `nmap -p 21 --script ftp-anon ${at(p, p.ftp)}`, 'nmap --script-help ftp-vsftpd-backdoor', `nmap -p 445 --script smb-vuln-ms17-010 ${at(p, p.win)}`, 'submit CVE-2017-0143'] },
  };
};

const payload: ChallengeGenerator = (rng) => {
  const p = dock(rng);
  const pl = rng.pick(['cmd/unix/reverse_netcat', 'cmd/unix/reverse_perl', 'cmd/unix/reverse_python']);
  const level = asChallenge(guided('msf-exploit-payload'), {
    goal: `Set up the ProFTPD module with a reverse payload calling ${at(p, p.me)}, then say which part decides what runs.`,
    instruction: 'Exploit and payload are chosen separately.',
    network: dockNetwork(p),
    goals: [
      { id: 'use', facts: ['msf-use:exploit/unix/ftp/proftpd_modcopy_exec'] },
      { id: 'payloads', facts: ['msf-payloads'] },
      { id: 'payload', facts: ['msf-payload:reverse'] },
      { id: 'lhost', facts: [`msf-opt:LHOST=${at(p, p.me)}`] },
      { id: 'answer', answers: ['payload'] },
    ],
    wrong: [{ answers: ['exploit'], reason: 'The exploit opens the door; something else decides what walks through.' }],
    otherwise: 'Answer payload or exploit.',
  });
  return {
    level,
    signature: `${p.lan}:${p.me}:${pl}`,
    hints: ['`show payloads` lists them; reverse ones call back to you.', `\`set PAYLOAD ${pl}\` then \`set LHOST ${at(p, p.me)}\`.`, 'Which part is the code left running?'],
    solution: { kind: 'terminal', commands: ['msfconsole', 'use exploit/unix/ftp/proftpd_modcopy_exec', 'show payloads', `set PAYLOAD ${pl}`, `set LHOST ${at(p, p.me)}`, 'submit payload'] },
  };
};

const check: ChallengeGenerator = (rng) => {
  const p = dock(rng);
  const level = asChallenge(guided('msf-check'), {
    goal: `Check ${at(p, p.ftp)}, ${at(p, p.ftpFixed)} and the vsftpd server ${at(p, p.vsftpd)}. Submit the one you can report as confirmed.`,
    instruction: 'Ask each server, and note where no check exists.',
    network: dockNetwork(p),
    goals: [
      { id: 'appears', facts: [`msf-check:${at(p, p.ftp)}:appears`] },
      { id: 'safe', facts: [`msf-check:${at(p, p.ftpFixed)}:safe`] },
      { id: 'refused', facts: ['msf-refused-run'] },
      { id: 'nocheck', facts: ['msf-nocheck:exploit/unix/ftp/vsftpd_234_backdoor'] },
      { id: 'answer', answers: [at(p, p.ftp)] },
    ],
    wrong: [
      { answers: [at(p, p.ftpFixed)], reason: 'check said it is not exploitable.' },
      { answers: [at(p, p.vsftpd)], reason: 'Nothing was verified there: the module has no check.' },
    ],
    otherwise: 'Submit the address whose check said it appears vulnerable.',
  });
  return {
    level,
    signature: `${p.lan}:${p.ftp}:${p.ftpFixed}:${p.vsftpd}`,
    hints: ['proftpd_modcopy_exec has a check; vsftpd_234_backdoor does not.', 'set RHOSTS to each address and run `check`; try `run` once to see the rules.', 'Report only what check confirmed.'],
    solution: { kind: 'terminal', commands: ['msfconsole', 'use exploit/unix/ftp/proftpd_modcopy_exec', `set RHOSTS ${at(p, p.ftp)}`, 'check', `set RHOSTS ${at(p, p.ftpFixed)}`, 'check', 'run', 'use exploit/unix/ftp/vsftpd_234_backdoor', `set RHOSTS ${at(p, p.vsftpd)}`, 'check', `submit ${at(p, p.ftp)}`] },
  };
};

const boss: ChallengeGenerator = (rng) => {
  const p = dock(rng);
  const level = asChallenge(guided('msf-boss'), {
    goal: `Port 445 is being probed across ${p.lan}.0/24. Find and confirm the machine vulnerable to MS17-010.`,
    instruction: 'Detector first, then the exploit module\'s check, never its run.',
    network: dockNetwork(p),
    goals: [
      { id: 'scan', facts: [`msf-run:auxiliary/scanner/smb/smb_ms17_010:${p.lan}.0/24`] },
      { id: 'check', facts: [`msf-check:${at(p, p.win)}:vulnerable`] },
      { id: 'answer', answers: [at(p, p.win)] },
    ],
    wrong: [{ answers: [at(p, p.winOk), at(p, p.nas)], reason: 'The detector cleared that one.' }],
    otherwise: 'Submit the address flagged by the scan and confirmed by check.',
  });
  return {
    level,
    signature: `${p.lan}:${p.win}:${p.winOk}`,
    hints: ['auxiliary/scanner/smb/smb_ms17_010 over the whole range.', 'Then exploit/windows/smb/ms17_010_eternalblue, set RHOSTS to the flagged address, and `check`.', 'Submit the confirmed address.'],
    solution: { kind: 'terminal', commands: ['msfconsole', 'use auxiliary/scanner/smb/smb_ms17_010', `set RHOSTS ${p.lan}.0/24`, 'run', 'use exploit/windows/smb/ms17_010_eternalblue', `set RHOSTS ${at(p, p.win)}`, 'check', `submit ${at(p, p.win)}`] },
  };
};

export const VALIDATION_CHALLENGES: Record<string, ChallengeGenerator> = {
  'msf-modules': modules,
  'msf-auxiliary': auxiliary,
  'msf-nse': nse,
  'msf-exploit-payload': payload,
  'msf-check': check,
  'msf-boss': boss,
};
