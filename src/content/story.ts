// The case the levels add up to. The player joins the Watch, a small security
// consultancy in Lyon, the morning Lantern & Co. finds its customers' invoices
// for sale. Each zone follows the attacker one step further: the front door,
// what they did inside the shop, the machine they came through, where the
// data went, and the write-up.

import type { ZoneId } from './types';

export type Speaker = 'Ines' | 'Bruno' | 'Yasmin' | 'Claire';

export const CAST: Record<Speaker, { role: string }> = {
  Ines: { role: 'Your lead' },
  Bruno: { role: 'Logs and forensics' },
  Yasmin: { role: 'Cloud and infrastructure' },
  Claire: { role: "Lantern & Co.'s CTO" },
};

export const CLIENT = {
  name: 'Lantern & Co.',
  what: 'A lamp maker in Lyon with an online shop and a warehouse on the docks, called Harbor.',
};

export interface Line {
  who: Speaker;
  text: string;
}

/** The short scene before each zone. */
export const BEATS: Record<ZoneId, { title: string; lines: Line[] }> = {
  basics: {
    title: 'Monday, 07:30',
    lines: [
      { who: 'Ines', text: 'Welcome to the Watch. Before any client calls, you need to know our own network and our own server.' },
      { who: 'Yasmin', text: 'lab-01 is our practice box. It has been on the internet all weekend and nobody has looked at it.' },
      { who: 'Bruno', text: 'Learn where our network ends and what the box runs. Every job after this assumes you can.' },
    ],
  },
  wire: {
    title: 'Monday, 08:10',
    lines: [
      { who: 'Ines', text: "Lantern & Co. called at eight. Their customers' invoices are for sale on a forum, names and addresses included." },
      { who: 'Bruno', text: 'Mara Okafor got an email quoting her real order. Someone was inside her account.' },
      { who: 'Ines', text: "We start at the front door: the shop's own traffic. Find how they got close." },
    ],
  },
  arena: {
    title: 'Monday, 13:30',
    lines: [
      { who: 'Bruno', text: "Theo's staff notes pointed at an old admin login. The server log shows someone used it at 02:14." },
      { who: 'Ines', text: 'Every attack they ran is in the log. Find the line of code each one went through, and close it.' },
      { who: 'Yasmin', text: 'And look at that link preview. Something in it called home to the cloud.' },
    ],
  },
  perimeter: {
    title: 'Tuesday, 09:00',
    lines: [
      { who: 'Yasmin', text: 'The stolen cloud key was used from inside the warehouse network, not from the internet.' },
      { who: 'Bruno', text: 'So they had a machine at Harbor first. Find the one they came through.' },
      { who: 'Ines', text: 'Stay inside the signed scope. We prove things, we do not guess.' },
    ],
  },
  cloud: {
    title: 'Wednesday, 10:20',
    lines: [
      { who: 'Yasmin', text: 'Got the trail. The invoices left through a public bucket and an export nobody locked.' },
      { who: 'Ines', text: "Close every door they used without breaking the shop. Claire's team is watching." },
      { who: 'Bruno', text: 'And find where that key came from. Someone committed it.' },
    ],
  },
  report: {
    title: 'Thursday, 16:00',
    lines: [
      { who: 'Ines', text: 'We know what happened. Now Claire needs it in a form her developers can act on.' },
      { who: 'Bruno', text: 'Use what we found. Every claim with its evidence.' },
      { who: 'Yasmin', text: 'Then a lab, so their team can practise somewhere that is not production.' },
    ],
  },
  scanner: {
    title: 'Friday, 09:30',
    lines: [
      { who: 'Claire', text: 'I never want to learn about a hole from a forum again. How do we see them first?' },
      { who: 'Yasmin', text: 'They have a Greenbone box in the office: OpenVAS and a feed of tests. A contractor installed it in 2024 and nobody has touched it since.' },
      { who: 'Ines', text: 'Then that is the last job. Fresh feed, the right targets, honest results, and a scan every week.' },
    ],
  },
};

/** One line in the level header, from a teammate, about what the case has turned up so far. */
export const REMARKS: Record<string, Line & { needs?: string }> = {
  'net-subnet': { who: 'Yasmin', text: 'Your notes have two blocks in them. Find out where each one starts and ends.' },
  'net-dns-nat': { who: 'Ines', text: "Lantern's IT wants an address to allow-list. Make sure you send the right one." },
  'net-tcp-udp': { who: 'Bruno', text: 'The router has something on it the last audit missed. They only scanned TCP.' },
  'linux-perms': { who: 'Yasmin', text: 'On lab-01 now. Start with who can read what in the shop folder.' },
  'linux-services': { who: 'Bruno', text: 'Something on lab-01 answers the whole office and nobody remembers installing it.' },
  'linux-firewall': { who: 'Yasmin', text: 'Someone is guessing passwords on lab-01 right now. Close the door, and do not lock yourself out.', needs: 'linux-services' },
  'wire-robots': { who: 'Ines', text: 'Start where anyone would: what the shop shows, and what it would rather you did not see.' },
  'wire-cookie-role': { who: 'Bruno', text: "Theo's notes say the old admin is still up. Let's see how the shop decides who is admin.", needs: 'wire-robots' },
  'wire-replay': { who: 'Bruno', text: 'Mara shops from the café by the quai. Let us see what that Wi-Fi carried.' },
  'wire-httponly': { who: 'Yasmin', text: "If a script can read the session, that is one more way Mara's could have been copied. Close it.", needs: 'wire-replay' },
  'wire-jwt': { who: 'Bruno', text: "The API log shows admin calls made with Sam's token. Sam is not an admin." },
  'wire-cors': { who: 'Ines', text: 'Last door at the front: the payment API answers any website that asks.' },
  'arena-sqli': { who: 'Bruno', text: 'This is the /admin-old login from the staff notes. 02:14, no password.', needs: 'wire-robots' },
  'arena-xss': { who: 'Yasmin', text: "The phishing link sent to Mara went through the shop's own search page." },
  'arena-idor': { who: 'Bruno', text: "Once inside, they walked the invoice numbers one by one. 1042 was Mara's." },
  'arena-cmdi': { who: 'Ines', text: 'The staff tools sit behind that admin login, and one of them ran more than ping.', needs: 'arena-sqli' },
  'arena-ssrf': { who: 'Yasmin', text: "Here is the call home. The preview fetched the server's own cloud credentials." },
  'arena-mass': { who: 'Ines', text: 'Last trick in the log: they gave themselves an account to come back with.' },
  'perimeter-sweep': { who: 'Yasmin', text: 'The stolen key was used from 10.0.8.something. Let us see what lives there.', needs: 'arena-ssrf' },
  'perimeter-ports': { who: 'Bruno', text: 'The notes say the database should only talk to web-01. Check that it does.' },
  'perimeter-versions': { who: 'Bruno', text: 'files.harbor.lan has not been patched since it was installed. That smells like our door.' },
  'perimeter-false-positive': { who: 'Ines', text: "Their own scanner says web-01 is critical. Don't take a scanner's word for it." },
  'perimeter-scope': { who: 'Ines', text: 'Claire wants staging looked at too. Make sure it is actually hers first.' },
  'perimeter-boss': { who: 'Bruno', text: 'The dock network next door uses the same file server login. There is one real hole there.', needs: 'perimeter-versions' },
  'cloud-bucket': { who: 'Yasmin', text: 'Here it is: the invoices bucket. Anyone with a link could download every one.' },
  'cloud-iam': { who: 'Yasmin', text: 'The export job that copied them was allowed to do anything in the account. Anything.' },
  'cloud-sg': { who: 'Bruno', text: 'From the warehouse box they reached the database straight over the internet. Firewall time.', needs: 'perimeter-versions' },
  'cloud-keys': { who: 'Bruno', text: 'The key used from the warehouse came out of a commit in the booking API, three days before.' },
  'cloud-scan': { who: 'Yasmin', text: 'Their code scanner flagged five things last month. Nobody read them.' },
  'cloud-gateway': { who: 'Ines', text: '48,211 customers went out through one unlocked export route. Close it while they are still trying.' },
  'report-phases': { who: 'Ines', text: 'Before we write anything, lay out the engagement the way Claire will read it.' },
  'report-cvss': { who: 'Bruno', text: "Sam opening Mara's invoice is our cleanest proof. Score it honestly.", needs: 'arena-idor' },
  'report-finding': { who: 'Ines', text: "The login bypass started all of it. Write it so Claire's developers cannot misread it.", needs: 'arena-sqli' },
  'report-retest': { who: 'Yasmin', text: 'Their developers pushed a fix overnight. Check it before anyone says closed.' },
  'report-lab': { who: 'Yasmin', text: "Last thing: a lab, so Theo's team can practise on something that is not the shop." },
  'scan-feed': { who: 'Yasmin', text: 'Before anything else, see how old this thing\'s knowledge is.' },
  'scan-target': { who: 'Ines', text: 'Same rules as the warehouse: we scan what Claire signed for and nothing else.' },
  'scan-task': { who: 'Bruno', text: 'Run it once properly and let us see what it says about the office.' },
  'scan-qod': { who: 'Yasmin', text: 'Two Apache Highs, both at 30%. One of them is noise and one is not.' },
  'scan-auth': { who: 'Bruno', text: 'db-02 looked clean from outside. I do not believe it.' },
  'scan-kev': { who: 'Bruno', text: 'Seven results and one morning. Find out which ones attackers are already using.' },
  'scan-boss': { who: 'Ines', text: 'A week has passed. Make this a habit, and tell Claire what comes next.' },
};

/** What each cleared level pins to the case board: the evidence, and what it proved. */
export const PINS: Record<string, { title: string; proved: string }> = {
  'net-subnet': { title: 'Printer on the guest Wi-Fi', proved: 'Every visitor can reach it: the /27 includes .201.' },
  'net-dns-nat': { title: 'Our public address', proved: 'Tests leave the office from 203.0.113.45, behind NAT.' },
  'net-tcp-udp': { title: 'SNMP on the router', proved: 'UDP 161 answers with "public", missed by TCP scans.' },
  'linux-perms': { title: 'Secrets readable by all', proved: '.env was 644 and deploy.sh 777 on lab-01.' },
  'linux-services': { title: 'Redis open to the office', proved: 'Listening on 0.0.0.0:6379, used by nothing.' },
  'linux-firewall': { title: 'No firewall on lab-01', proved: 'SSH open to the internet, under a brute-force run.' },
  'wire-robots': { title: "Theo's staff notes", proved: 'The notes were public and named /admin-old.' },
  'wire-cookie-role': { title: 'A cookie that says admin', proved: 'The shop let the browser decide who was staff.' },
  'wire-replay': { title: "Mara's session, replayed", proved: 'Her session id was copied on open Wi-Fi and worked for anyone.' },
  'wire-httponly': { title: 'Session readable by scripts', proved: 'Any script on the page could read the session cookie.' },
  'wire-jwt': { title: 'Unsigned admin token', proved: 'API v1 accepted a token with no signature at all.' },
  'wire-cors': { title: 'Payment API open to any site', proved: "Any website could read a signed-in customer's details." },
  'arena-sqli': { title: 'Login bypass on /admin-old', proved: 'The way in at 02:14: a name that rewrote the SQL query.' },
  'arena-xss': { title: 'Search page that runs markup', proved: "The phishing link ran in the shop's own page." },
  'arena-idor': { title: 'Invoices by number', proved: "Any customer could read anyone's invoice." },
  'arena-cmdi': { title: 'The ping tool', proved: 'A staff tool ran a second command on the server.' },
  'arena-ssrf': { title: 'Link preview credentials', proved: "The preview handed out the server's cloud credentials." },
  'arena-mass': { title: 'Self-made account', proved: 'Sign-up saved any field it was sent, role included.' },
  'perimeter-sweep': { title: 'Warehouse network map', proved: 'Five machines live on 10.0.8.0/24.' },
  'perimeter-ports': { title: 'Database open to the office', proved: 'db-02 answered every desk, not only web-01.' },
  'perimeter-versions': { title: 'files.harbor.lan', proved: "The foothold: vsftpd 2.3.4, the version with a backdoor." },
  'perimeter-false-positive': { title: 'web-01 is fine', proved: 'The scanner was out of date: Apache was already patched.' },
  'perimeter-scope': { title: 'Staging is not theirs', proved: 'staging.harbor.example sits on a hosting company, out of scope.' },
  'perimeter-boss': { title: 'Dock files server', proved: 'ProFTPD 1.3.5 next door, verified from its banner.' },
  'cloud-bucket': { title: 'Public invoices bucket', proved: 'Where the invoices went: a bucket anyone could read.' },
  'cloud-iam': { title: 'An export job allowed everything', proved: 'One job could read, delete and create keys anywhere.' },
  'cloud-sg': { title: 'Database port on the internet', proved: 'The firewall opened SSH, RDP and the database to everyone.' },
  'cloud-keys': { title: 'Key in git history', proved: 'The deploy key was readable by anyone who cloned the repo.' },
  'cloud-scan': { title: 'Ignored scanner alerts', proved: 'Two of five alerts were real and nobody had looked.' },
  'cloud-gateway': { title: 'The unlocked export', proved: '48,211 customers left through one route with no login.' },
  'report-phases': { title: 'The engagement, in order', proved: 'From signed scope to retest, every phase accounted for.' },
  'report-cvss': { title: 'IDOR scored 6.5', proved: 'Medium: read everything, change nothing.' },
  'report-finding': { title: 'Finding accepted', proved: 'Claire signed off on the login bypass write-up.' },
  'report-retest': { title: 'Their first fix failed', proved: 'A variant still got in, so the finding stayed open.' },
  'report-lab': { title: 'A practice lab', proved: 'Juice Shop and ZAP, reachable from nowhere else.' },
  'scan-feed': { title: 'A scanner two years behind', proved: 'The feed was from June 2024 and missed regreSSHion.' },
  'scan-target': { title: 'The office target', proved: 'All of the office, minus the vendor printer, nas-01 included.' },
  'scan-task': { title: 'First full scan', proved: 'Three Highs, worst of all an end-of-life NAS.' },
  'scan-qod': { title: 'One false alarm', proved: 'web-01 was patched; the intranet box was not.' },
  'scan-auth': { title: 'Holes inside db-02', proved: 'PwnKit and Baron Samedit, visible only with a login.' },
  'scan-kev': { title: 'Three already exploited', proved: 'SambaCry, PwnKit and Baron Samedit are in KEV; nas-01 goes first.' },
  'scan-boss': { title: 'A weekly scan', proved: 'Four fixes in a week, one new kiosk, db-02 next.' },
};

/** The incident as it happened, revealed as the levels that prove each moment are cleared. */
export const TIMELINE: { time: string; text: string; levelId?: string }[] = [
  { time: 'Sun 22:40', text: "Mara's session is copied on the café Wi-Fi.", levelId: 'wire-replay' },
  { time: 'Mon 01:05', text: "The attacker reads Theo's unlinked staff notes.", levelId: 'wire-robots' },
  { time: 'Mon 01:30', text: 'API v1 accepts their unsigned admin token.', levelId: 'wire-jwt' },
  { time: 'Mon 02:14', text: 'Login bypass on /admin-old, no password.', levelId: 'arena-sqli' },
  { time: 'Mon 02:31', text: 'Invoices walked one number at a time.', levelId: 'arena-idor' },
  { time: 'Mon 02:50', text: 'The link preview leaks cloud credentials.', levelId: 'arena-ssrf' },
  { time: 'Mon 03:10', text: 'Foothold on files.harbor.lan through the vsftpd backdoor.', levelId: 'perimeter-versions' },
  { time: 'Mon 03:40', text: 'The deploy key from git history is used from the warehouse.', levelId: 'cloud-keys' },
  { time: 'Mon 04:05', text: 'The invoices bucket is read without credentials.', levelId: 'cloud-bucket' },
  { time: 'Mon 04:20', text: '48,211 customers exported through the open route.', levelId: 'cloud-gateway' },
  { time: 'Mon 08:00', text: 'Claire calls the Watch.' },
  { time: 'Thu 18:30', text: 'The finding is accepted, and their first fix fails the retest.', levelId: 'report-retest' },
  { time: 'Fri 09:30', text: "Lantern's OpenVAS box gets a fresh feed and its first full scan.", levelId: 'scan-task' },
];

export const ENDING: Line[] = [
  { who: 'Claire', text: 'The forum post is down, the doors are shut, and my developers know exactly what to change. Thank you.' },
  { who: 'Bruno', text: 'For the record: the logs agree with every word of the report.' },
  { who: 'Yasmin', text: 'And the lab is running. Theo already broke into it twice. The scanner runs every Monday at six.' },
  { who: 'Ines', text: 'Good work. You followed it from a café Wi-Fi to a bucket, and proved each step. Welcome to the Watch.' },
];

/** The boss levels run as live incidents: what the attacker is after, and what they leave with if they win. */
export const INCIDENTS: Record<string, { threat: string; records: number; unit: string; loot: string }> = {
  'linux-firewall': { threat: 'An address on the internet is trying passwords on lab-01 over SSH, several a second.', records: 1800, unit: 'passwords tried', loot: 'a shell on lab-01, and from there the office network' },
  'wire-cors': { threat: 'A page on another site is reading customer accounts right now.', records: 1204, unit: 'accounts read', loot: 'account details, IBANs and balances, read through the customers\' own browsers' },
  'arena-mass': { threat: 'Someone is signing up accounts with roles the form never offers, as you watch.', records: 312, unit: 'accounts made', loot: 'new accounts with staff rights, each one a way back in' },
  'perimeter-boss': { threat: 'The attacker is moving through the dock network looking for one more way in.', records: 2400, unit: 'files copied', loot: "the dock file server's shared folder, copied file by file" },
  'cloud-gateway': { threat: 'The export route is being called again from an address nobody knows.', records: 48211, unit: 'customers out', loot: 'customer records: names, emails and delivery addresses' },
  'report-lab': { threat: 'Your lab is reachable from the office Wi-Fi, and something on the network has found it.', records: 96, unit: 'probes answered', loot: 'a foothold on your laptop, through the lab you left open' },
  'scan-boss': { threat: 'Something on the office network is probing every machine for old SSH and Samba as you work.', records: 640, unit: 'probes answered', loot: 'a list of every unpatched machine in the office, ready for the next attacker' },
};
