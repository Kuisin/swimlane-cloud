# Swimlane Cloud

DSL Editor + DSL Management SaaS — two independently shippable products sharing one open-source engine.

See [`plan.md`](plan.md) for full architecture and build order.

---

## Repository layout

```
packages/
  diagram-converter/   # @swimlane-cloud/diagram-converter (open-source engine, MIT)
apps/
  saas/                # Next.js SaaS app (Product B) — to be created
  desktop/             # Electron desktop app (Product A) — to be created
nginx/
  nginx.conf           # Base nginx config (HTTP→HTTPS redirect)
  conf.d/app.conf      # Gitea virtual host (SSL + security headers)
docker-compose.yml     # Gitea server stack (Gitea + Postgres + Nginx)
.env.example           # EC2 environment variables (Gitea server)
.env.vercel.example    # Vercel environment variables (Next.js app)
```

---

## Infrastructure overview

| What | Where | Est. cost |
|---|---|---|
| Gitea + Postgres + Nginx | EC2 t3.small (Docker Compose) | ~$15/mo |
| Next.js SaaS app | Vercel | free → ~$20/mo |
| SVG blob storage | S3 | ~$0.023/GB |
| Transactional email | SES | $0.10/1 000 emails |
| Auth + app database | Supabase (managed) | free tier |
| DNS | Route 53 | $0.50/zone |
| Billing | Stripe (managed) | % of revenue |

Gitea is the only service that must be self-hosted (it stores all git repos). Everything else is pay-per-use with no server to operate.

---

## Part 1 — Gitea server (EC2)

### Step 1 — Create the S3 bucket

SVG blobs (canonical diagram renders) go to S3 — no storage server needed.

1. Open [S3 → Create bucket](https://s3.console.aws.amazon.com/s3/bucket/create).
2. Name: `swimlane-svg-blobs` (set `S3_SVG_BUCKET` in Vercel env to match).
3. Region: pick the region your EC2 will be in (e.g. `us-east-1`).
4. Block all public access: **on**.
5. Click **Create bucket**.

---

### Step 2 — Create IAM roles and users

**EC2 IAM role** (for Gitea server — SES email only):

1. [IAM → Roles → Create role](https://console.aws.amazon.com/iam/home#/roles) → EC2.
2. Attach this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "ses:SendRawEmail",
    "Resource": "*"
  }]
}
```

3. Name it `swimlane-gitea-role`. Attach it when launching the EC2 instance (Step 4).

**App IAM user** (for Vercel — S3 + SES; Vercel has no IAM role support):

1. [IAM → Users → Create user](https://console.aws.amazon.com/iam/home#/users) → name: `swimlane-app`.
2. Attach this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SvgBlobs",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::swimlane-svg-blobs/*"
    },
    {
      "Sid": "SvgBlobsList",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::swimlane-svg-blobs"
    },
    {
      "Sid": "AppEmail",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "*"
    }
  ]
}
```

3. Under **Security credentials**, create an **Access key** (use case: Application running outside AWS). Save the key ID and secret — you'll add them to Vercel in Part 2.

---

### Step 3 — (Optional) Set up SES

Skip if you don't need email. Gitea and the app will run without it.

1. [SES → Verified identities → Create identity](https://console.aws.amazon.com/ses/home#/verified-identities) → verify your domain.
2. Add the DNS records SES provides in Route 53.
3. If your account is in the **SES sandbox**, request production access.
4. For Gitea's SMTP relay specifically: [SES → SMTP settings → Create SMTP credentials](https://console.aws.amazon.com/ses/home#/smtp). This creates a separate IAM user; save the SMTP username and password for `.env`.

---

### Step 4 — Launch the EC2 instance

1. [EC2 → Launch instance](https://console.aws.amazon.com/ec2).
2. **AMI:** Ubuntu 24.04 LTS (x86_64).
3. **Instance type:** t3.small (2 vCPU, 2 GB RAM — sufficient for Gitea + Postgres alone).
4. **IAM instance profile:** `swimlane-gitea-role` (from Step 2).
5. **Storage:** 30 GB gp3. Add a CloudWatch alarm on disk at 80% — git repos grow over time.
6. **Security group** — inbound rules only:

   | Port | Protocol | Source    | Purpose              |
   |------|----------|-----------|----------------------|
   | 22   | TCP      | Your IP   | SSH (remove after setup; use SSM instead) |
   | 80   | TCP      | 0.0.0.0/0 | HTTP (Let's Encrypt challenge) |
   | 443  | TCP      | 0.0.0.0/0 | HTTPS (Gitea)        |

7. Launch, then **allocate and associate an Elastic IP**:
   - EC2 → Elastic IPs → Allocate → Associate → select your instance.

---

### Step 5 — Point DNS to the instance

In Route 53, create one **A record**:

| Name                  | Type | Value          |
|-----------------------|------|----------------|
| `git.yourdomain.com`  | A    | `<Elastic IP>` |

Wait a few minutes for propagation before continuing.

---

### Step 6 — Install Docker

```bash
ssh -i your-key.pem ubuntu@<Elastic IP>

sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo usermod -aG docker ubuntu
newgrp docker
```

---

### Step 7 — Clone and configure

```bash
git clone https://github.com/your-org/swimlane-cloud.git
cd swimlane-cloud

cp .env.example .env
nano .env
```

| Variable | How to get it |
|---|---|
| `GITEA_DOMAIN` | e.g. `git.yourdomain.com` |
| `CERTBOT_EMAIL` | Your email for Let's Encrypt expiry notices |
| `GITEA_DB_PASSWORD` | `openssl rand -hex 20` |
| `GITEA_SECRET_KEY` | `openssl rand -hex 32` |
| `GITEA_INTERNAL_TOKEN` | `openssl rand -hex 32` |
| `AWS_REGION` | Region from Step 1 |
| `GITEA_MAILER_ENABLED` | `true` if SES is set up; leave `false` otherwise |
| `GITEA_SES_FROM` | Verified SES sender address |
| `SES_SMTP_USER` / `SES_SMTP_PASSWORD` | SES SMTP credentials from Step 3 |

---

### Step 8 — Configure Nginx and obtain SSL certificate

Substitute the domain placeholder, then issue a certificate:

```bash
source .env
sed -i "s/GITEA_DOMAIN_PLACEHOLDER/${GITEA_DOMAIN}/g" nginx/conf.d/app.conf

# Start Nginx in HTTP-only mode for the ACME challenge
docker compose up -d nginx

# Issue the certificate
docker compose run --rm certbot

# Restart Nginx with SSL
docker compose restart nginx
```

---

### Step 9 — Start the full stack

```bash
docker compose up -d
docker compose ps        # gitea-db, gitea, nginx should be healthy/running
```

---

### Step 10 — Create the Gitea bot account

```bash
docker compose exec gitea gitea admin user create \
  --admin \
  --username swimlane-bot \
  --password "$(openssl rand -hex 16)" \
  --email "bot@yourdomain.com"

docker compose exec gitea gitea admin user generate-access-token \
  --username swimlane-bot \
  --token-name saas-api \
  --raw
```

Copy the printed token. Add it to `.env` as `GITEA_ADMIN_TOKEN` (for reference) and to Vercel as `GITEA_ADMIN_TOKEN` (Part 2, Step 3).

---

### Step 11 — Automate SSL renewal

```bash
(crontab -l 2>/dev/null; echo "0 3 1 * * cd /home/ubuntu/swimlane-cloud && docker compose run --rm certbot renew && docker compose restart nginx") | crontab -
```

---

## Part 2 — Next.js app (Vercel)

### Step 1 — Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → run migrations from `apps/saas/supabase/migrations/` in order.
3. Enable **Row Level Security** on all tenant-scoped tables.
4. Authentication → Providers → enable **Magic Link**.
5. SVG blobs are stored in S3 (Part 1, Step 1) — no Supabase Storage bucket needed.

---

### Step 2 — Deploy to Vercel

```bash
# From your local machine
npx vercel --cwd apps/saas
```

Or use the Vercel dashboard: New Project → Import from GitHub → select this repo → set root to `apps/saas`.

---

### Step 3 — Set environment variables in Vercel

Copy `.env.vercel.example` and fill in each value in **Vercel → Project → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `NEXTAUTH_URL` | `https://app.yourdomain.com` |
| `APP_URL` | `https://app.yourdomain.com` |
| `GITEA_URL` | `https://git.yourdomain.com` |
| `GITEA_ADMIN_TOKEN` | Token from Part 1, Step 10 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `AWS_REGION` | Region from Part 1, Step 1 |
| `AWS_ACCESS_KEY_ID` | IAM user key from Part 1, Step 2 |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret from Part 1, Step 2 |
| `S3_SVG_BUCKET` | `swimlane-svg-blobs` |
| `SES_FROM_EMAIL` | Verified SES sender |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys |

---

### Step 4 — Point your app domain to Vercel

In Vercel → Project → Settings → Domains, add `app.yourdomain.com`.

In Route 53, create a **CNAME record** pointing `app.yourdomain.com` to the value Vercel provides (e.g. `cname.vercel-dns.com`).

---

### Step 5 — Register the Stripe webhook

In the Stripe dashboard → Webhooks → Add endpoint:
- URL: `https://app.yourdomain.com/api/billing/webhook`
- Events: `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

Copy the signing secret to `STRIPE_WEBHOOK_SECRET` in Vercel.

---

## Updating

**Gitea server:**

```bash
# On the EC2 instance
cd swimlane-cloud
git pull
docker compose pull gitea
docker compose up -d gitea
```

**App:**

Push to the connected GitHub branch — Vercel deploys automatically.

---

## Production hardening checklist

- [ ] Disable SSH (port 22) on the EC2 security group after setup; use **AWS Systems Manager Session Manager** instead.
- [ ] Enable **Amazon CloudWatch** agent on EC2 for container log shipping.
- [ ] Schedule weekly EBS snapshots via **AWS Backup**.
- [ ] Set an **S3 lifecycle rule** to expire orphaned SVG blobs after 1 year.
- [ ] Enable **S3 server-side encryption** (SSE-S3) on the bucket.
- [ ] Add a **CloudWatch disk alarm** on the EC2 volume at 80% usage (git repos grow steadily).

---

## Local development

```bash
# Requires Node 20+ and pnpm
pnpm install

# Engine tests
cd packages/diagram-converter
pnpm test
```

For local S3 access, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in your shell (or use [LocalStack](https://localstack.cloud) for a fully offline S3 emulator).
