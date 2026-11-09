import type { Briefing } from '../types';

// The 60-second interactive prologue, shown once the first time the game opens.
// It teaches the two things every mission relies on: reading a packet, and the
// reticle you catch with. One real packet is caught at the end.

export const PROLOGUE: Briefing = {
  missionId: '__prologue__',
  mentor: 'Ines',
  beats: [
    {
      id: 'welcome',
      concepts: ['http-anatomy'],
      say: 'Welcome to the Watch. I am Ines. Everything a web app does is a request and a response. Here is a response. Tap the status line at the top.',
      material: {
        kind: 'lines',
        title: 'A response',
        lines: ['HTTP/1.1 200 OK', 'Content-Type: text/html', 'Set-Cookie: sid=9f2a; Path=/'],
      },
      action: { kind: 'tap-line', line: 0 },
      then: 'That is the status line: 200 means it worked. Under it come the headers, where all the interesting things live.',
    },
    {
      id: 'the-cookie',
      concepts: ['cookie-flags'],
      say: 'The last line is a Set-Cookie. It hands the browser a session id with no HttpOnly flag, so any script on the page can read it. Tap that Set-Cookie line.',
      material: {
        kind: 'lines',
        title: 'A response',
        lines: ['HTTP/1.1 200 OK', 'Content-Type: text/html', 'Set-Cookie: sid=9f2a; Path=/'],
      },
      action: { kind: 'tap-line', line: 2 },
      then: 'Good eye. A missing flag like that is the kind of thing you will be paid to find. The briefing before every mission shows you the idea first, like this.',
    },
    {
      id: 'the-reticle',
      concepts: ['http-anatomy'],
      say: 'In the action missions, packets stream across the screen through your proxy. You catch the bad ones with the reticle. This one carries a token in the URL, which leaks. Catch it.',
      material: {
        kind: 'cards',
        cards: [{ id: 'leak', title: 'GET /account', lines: ['GET /account?token=eyJ0.sKx HTTP/1.1', 'Host: app.example'] }],
      },
      action: { kind: 'tap-card', card: 'leak' },
      then: 'Caught. That is the whole game: learn the idea in the briefing, then prove it under pressure. You are on the roster. Head to the first mission when you are ready.',
    },
  ],
};
