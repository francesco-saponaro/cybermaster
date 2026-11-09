import type { Briefing } from '../types';

const M = 'Ines';

export const CLOUD_BRIEFINGS: Briefing[] = [
  {
    missionId: 'cloud-bucket',
    mentor: M,
    beats: [
      {
        id: 'public-policy',
        concepts: ['bucket-policy-public'],
        say: 'In the cloud the perimeter is a policy document. A bucket is public when a policy with Principal "*" allows it and nothing blocks it. Tap the policy line that opens this one.',
        material: {
          kind: 'lines',
          title: 'northgate-customer-uploads',
          lines: ['Block Public Access: all four OFF', 'ACL: private', 'Policy: Allow, Principal "*", s3:GetObject, uploads/*'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Right. Anyone can read any object. The private ACL does not matter: the policy grants it and nothing stops it.',
        codex: 's3-public',
      },
      {
        id: 'public-acl',
        concepts: ['bucket-acl-public'],
        say: 'A bucket can also be opened by its ACL. This one grants READ to AllUsers, which is the whole internet. Tap the ACL line.',
        material: {
          kind: 'lines',
          title: 'northgate-backups',
          lines: ['Block Public Access: all four OFF', 'ACL: grants READ to AllUsers', 'Policy: none'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Right. AllUsers means everyone. With Block Public Access off, the objects are readable.',
      },
      {
        id: 'bpa-saves',
        concepts: ['block-public-access'],
        say: 'Block Public Access is the belt and braces. With all four settings on, even a public policy is ignored. Tap the Block Public Access line on this correctly served site.',
        material: {
          kind: 'lines',
          title: 'northgate-static-site',
          lines: ['Block Public Access: all four ON', 'ACL: private', 'Policy: Allow, Principal cloudfront.amazonaws.com, one named distribution'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right. Only one CloudFront distribution may read it, and Block Public Access is on. This is private, done well. Now audit the buckets.',
      },
    ],
  },
  {
    missionId: 'cloud-iam',
    mentor: M,
    beats: [
      {
        id: 'admin-wildcard',
        concepts: ['iam-admin-wildcard', 'least-privilege'],
        say: 'Least privilege means only the actions needed on the resources needed. Action "*" on Resource "*" is full administrator. On a CI user, a leaked key is then the whole account. Tap that policy line.',
        material: {
          kind: 'lines',
          title: 'ci-deploy, attached policy',
          lines: ['Effect Allow, Action "*", Resource "*"'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right, risky. Compare with a role that may GetObject and PutObject on one bucket: that is least privilege, and sound.',
        codex: 'iam-least-privilege',
      },
      {
        id: 'sg-open',
        concepts: ['sg-admin-port-open'],
        say: 'Security groups are the cloud firewall. A public load balancer on 443 is fine; SSH on 22 open to 0.0.0.0/0 is not. Tap the risky line.',
        material: {
          kind: 'lines',
          title: 'sg-app-servers, inbound',
          lines: ['22/tcp from 0.0.0.0/0', '8080/tcp from sg-web-alb'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right. Admin and database ports are never open to the whole internet. Restrict 22 to a bastion, VPN or office range.',
        codex: 'security-groups',
      },
      {
        id: 'root-and-trust',
        concepts: ['root-mfa-keys', 'role-trust-wildcard'],
        say: 'Two account checks. The root user should have MFA and no access keys at all. Tap the line that makes this root risky.',
        material: {
          kind: 'lines',
          title: 'root user',
          lines: ['MFA: not enabled', 'Access keys: 1 active, used 3 days ago', 'Console password: set'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right. Daily use of a root key with no MFA means a leak is the whole account. Also watch trust policies: Principal "*" on AssumeRole lets any account in the world assume the role. Now audit it all.',
      },
    ],
  },
  {
    missionId: 'cloud-api-gate',
    mentor: M,
    beats: [
      {
        id: 'change-the-id',
        concepts: ['ownership-check'],
        say: 'Broken object level authorization is found by changing an id. You are customer 2041. Tap the request for order 2040, which is not yours.',
        material: {
          kind: 'cards',
          cards: [
            { id: 'mine', title: 'yours', lines: ['GET /api/v1/orders/2041'] },
            { id: 'theirs', title: 'not yours', lines: ['GET /api/v1/orders/2040'] },
          ],
        },
        action: { kind: 'tap-card', card: 'theirs' },
        then: 'That is the probe. If it returns someone else\'s order, the server checked that you are logged in but not that the order is yours.',
        codex: 'idor',
      },
      {
        id: 'being-logged-in',
        concepts: ['ownership-check'],
        say: 'Here is the leaking handler. requireLogin checks who you are; nothing checks whose order it is. Tap the line that returns the order with no ownership check.',
        material: {
          kind: 'lines',
          title: 'The handler that leaked',
          lines: ['router.get("/orders/:id", requireLogin, async (req, res) => {', '  const order = await Orders.findById(req.params.id);', '  res.json(order);'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Right. It returns whatever id you ask for. The fix compares order.customerId with req.user.id and returns 404 otherwise.',
        codex: 'api-security',
      },
      {
        id: 'not-uuids',
        concepts: ['uuid-not-a-fix'],
        say: 'A tempting non-fix: switch the ids to UUIDs so they are unguessable. Does that close the hole?',
        material: {
          kind: 'lines',
          title: 'The question',
          lines: ['Replace sequential ids with random UUIDs. Is the IDOR fixed?'],
        },
        action: { kind: 'choose', options: ['Yes, unguessable ids fix it', 'No: any leaked id still opens the door'], answer: 1 },
        then: 'Right. Random ids only hide the door; a shared link or a log still opens it. The ownership check is the fix. Now go break it, then fix it.',
      },
    ],
  },
  {
    missionId: 'cloud-secrets',
    mentor: M,
    beats: [
      {
        id: 'secret-in-env',
        concepts: ['secret-in-repo'],
        say: 'A secret in a commit lives in the history even after it is deleted. This diff adds a .env with the database password. Tap that line.',
        material: {
          kind: 'lines',
          title: 'git diff (.env)',
          lines: ['+DATABASE_URL=postgres://shop:<password>@db.internal:5432/shop', '+AWS_ACCESS_KEY_ID=<access-key>', '+AWS_SECRET_ACCESS_KEY=<secret-key>'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right. Rotate first, then clean the history. The AWS key pair below is just as bad: together they open the account.',
        codex: 'secrets',
      },
      {
        id: 'config-ok',
        concepts: ['env-from-runtime'],
        say: 'Not every config line is a secret. Reading a value from process.env at runtime is the right way. Tap the SESSION_SECRET line that reads from the environment.',
        material: {
          kind: 'lines',
          title: 'git diff (config.ts)',
          lines: ['+export const PORT = Number(process.env.PORT ?? 3000);', '+export const PAYMENT_KEY = "<live-payment-key>";', '+export const SESSION_SECRET = process.env.SESSION_SECRET;'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Right, that line is fine. The PAYMENT_KEY above it is hard-coded in source, which is the catch.',
      },
      {
        id: 'secret-in-image',
        concepts: ['secret-in-image'],
        say: 'Dockerfiles leak too. ENV bakes the value into the image layers, readable by anyone who pulls the image. Tap the ENV line.',
        material: {
          kind: 'lines',
          title: 'Dockerfile',
          lines: ['COPY . .', 'ENV DB_PASSWORD=<password>', 'COPY deploy_key /root/.ssh/id_ed25519'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Right. A private key copied into the image, just below, is the same mistake. Secrets come from a secrets manager at runtime. Now flag them all.',
        codex: 'supply-chain',
      },
    ],
  },
  {
    missionId: 'cloud-pipeline',
    mentor: M,
    beats: [
      {
        id: 'sca',
        concepts: ['sca-update'],
        say: 'The build and the container. When npm audit reports a dependency with a known CVE, you update it and keep the check in CI. Tap that flaw.',
        material: {
          kind: 'lines',
          title: 'What the pipeline does',
          lines: ['npm audit: a dependency with a known prototype-pollution CVE', 'The container runs as root', 'Base image is an end-of-life Node'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right. Update it, and keep software composition analysis in CI so it never silently returns.',
        codex: 'supply-chain',
      },
      {
        id: 'container',
        concepts: ['container-privilege', 'base-image-eol'],
        say: 'Containers should run as a non-root user, and the base image should be supported. Tap the line about running as root.',
        material: {
          kind: 'lines',
          title: 'What the pipeline does',
          lines: ['The container runs as root', 'Base image is an end-of-life Node version', 'The CI runner mounts the host Docker socket'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right, add a USER line. The end-of-life image gets no patches; move to a supported one. The host Docker socket is root on the host: use a rootless builder.',
        codex: 'secrets',
      },
      {
        id: 'build-and-pin',
        concepts: ['build-arg-secret', 'pin-pipeline-steps'],
        say: 'Two more. A secret passed as a build argument ends up in the image history. Tap that line.',
        material: {
          kind: 'lines',
          title: 'What the pipeline does',
          lines: ['A secret passed as a build argument lands in a layer', 'CI pulls a third-party step by a mutable tag'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right, inject secrets at runtime instead. And a mutable tag can be moved to malicious code: pin pipeline steps by commit and verify them. Now match every flaw to its fix.',
      },
    ],
  },
  {
    missionId: 'cloud-boss',
    mentor: M,
    beats: [
      {
        id: 'review-bucket',
        concepts: ['bucket-policy-public', 'sg-admin-port-open'],
        say: 'The Account: audit the config, then break the API. Review. This bucket policy lists everyone with ListBucket and GetObject. Tap it.',
        material: {
          kind: 'lines',
          title: 'harborline-exports',
          lines: ['Block Public Access: OFF', 'Policy: Allow, Principal "*", s3:ListBucket and s3:GetObject'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Right, listing and reading for everyone. A security group with Redis on 6379 from 0.0.0.0/0 is the same kind of mistake.',
      },
      {
        id: 'cloudtrail',
        concepts: ['cloudtrail-logging'],
        say: 'One new thing. Without a CloudTrail there is no record of who did what, so no investigation and no alerting. Tap the line that shows no trail configured.',
        material: {
          kind: 'lines',
          title: 'CloudTrail',
          lines: ['Trail: none configured in this region'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right, risky. An account with no audit trail is blind. Mark it.',
      },
      {
        id: 'review-api',
        concepts: ['ownership-check'],
        say: 'Then the invoice API. Same bug as before: being logged in is not being allowed. Tap the request for an invoice that is not yours.',
        material: {
          kind: 'cards',
          cards: [
            { id: 'mine', title: 'yours', lines: ['GET /api/v1/invoices/7781/pdf'] },
            { id: 'theirs', title: 'not yours', lines: ['GET /api/v1/invoices/7780/pdf'] },
          ],
        },
        action: { kind: 'tap-card', card: 'theirs' },
        then: 'Right. Scope the query to the caller\'s account so another company\'s invoice is simply not found. Audit, then break and fix. Go.',
      },
    ],
  },
];
