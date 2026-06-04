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
  nginx.conf           # Reverse proxy base config
  conf.d/app.conf      # Virtual hosts for app + Gitea
docker-compose.yml     # Self-hosted services (Gitea + app + Nginx)
.env.example           # Environment variable template
```

---

## Deploying on Amazon Web Services

### Infrastructure overview

| What | Where | Cost |
|---|---|---|
| Next.js app + Gitea + Nginx | EC2 t3.medium (Docker Compose) | ~$30/mo |
| Gitea Postgres | Docker volume on the same EC2 | included |
| SVG blob storage | **S3** | ~$0.023/GB — negligible |
| Transactional email | **SES** | $0.10/1000 emails |
| Auth + app database | Supabase (managed SaaS) | free tier |
| DNS | Route 53 | $0.50/zone |
| Billing | Stripe (managed SaaS) | % of revenue |

Everything that runs as a managed service is pay-per-use with no server to maintain. The single EC2 instance hosts only what must be self-managed: Gitea and the app itself.

---

### Prerequisites

- AWS account
- Domain with DNS hosted in Route 53 (or any registrar)
- Supabase project (free tier works for development)
- Stripe account

---

### Step 1 — Create the S3 bucket

SVG blobs (the canonical diagram renders) are stored in S3 instead of running a storage server.

1. Open [S3 → Create bucket](https://s3.console.aws.amazon.com/s3/bucket/create).
2. Name: `swimlane-svg-blobs` (or your preferred name — set `S3_SVG_BUCKET` to match).
3. Region: choose where your EC2 will live (e.g. `us-east-1`).
4. Block all public access: **on** (the app serves SVGs via signed URLs or proxy).
5. Versioning: off.
6. Click **Create bucket**.

---

### Step 2 — Create an IAM role for the EC2 instance

Using an IAM role means zero credentials in your `.env` — the AWS SDK picks them up automatically.

1. Open [IAM → Roles → Create role](https://console.aws.amazon.com/iam/home#/roles).
2. Trusted entity type: **AWS service → EC2**.
3. Attach a new **inline policy** (or a named policy) with these permissions:

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
      "Sid": "SesEmail",
      "Effect": "Allow",
      "Action": "ses:SendRawEmail",
      "Resource": "*"
    }
  ]
}
```

4. Name the role `swimlane-ec2-role` and create it.

---

### Step 3 — (Optional) Set up SES for email

Skip this step if you don't need email notifications. Gitea and the app will run without it.

1. Open [SES → Verified identities → Create identity](https://console.aws.amazon.com/ses/home#/verified-identities).
2. Verify your sending domain (e.g. `yourdomain.com`) by adding the DNS records SES provides.
3. If your account is in the **SES sandbox**, request production access so you can send to any address.
4. For Gitea's SMTP relay, create SMTP credentials:
   - SES → SMTP settings → Create SMTP credentials → this generates an IAM user with `ses:SendRawEmail`.
   - Save the SMTP username and password — set them as `SES_SMTP_USER` / `SES_SMTP_PASSWORD` in `.env`.

---

### Step 4 — Launch an EC2 instance

1. Open [EC2 → Launch instance](https://console.aws.amazon.com/ec2).
2. **AMI:** Ubuntu 24.04 LTS (x86_64).
3. **Instance type:** t3.medium (Gitea + Postgres + Next.js). Upgrade to t3.large for heavy load.
4. **IAM instance profile:** select `swimlane-ec2-role` created in Step 2.
5. **Storage:** 30 GB gp3 root volume (50+ GB if you expect large git repositories).
6. **Security group** — inbound rules:

   | Port | Protocol | Source    | Purpose             |
   |------|----------|-----------|---------------------|
   | 22   | TCP      | Your IP   | SSH                 |
   | 80   | TCP      | 0.0.0.0/0 | HTTP (Let's Encrypt)|
   | 443  | TCP      | 0.0.0.0/0 | HTTPS               |

7. Select or create a key pair, then launch.
8. **Allocate and associate an Elastic IP** so the address survives reboots:
   - EC2 → Elastic IPs → Allocate → Associate → select your instance.

---

### Step 5 — Point DNS to the instance

In Route 53 (or your registrar) create two **A records** pointing to the Elastic IP:

| Name                  | Type | Value          |
|-----------------------|------|----------------|
| `app.yourdomain.com`  | A    | `<Elastic IP>` |
| `git.yourdomain.com`  | A    | `<Elastic IP>` |

Wait a few minutes for DNS to propagate before the next step.

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

Values to fill in:

| Variable | How to get it |
|---|---|
| `APP_DOMAIN` | e.g. `app.yourdomain.com` |
| `GITEA_DOMAIN` | e.g. `git.yourdomain.com` |
| `CERTBOT_EMAIL` | Your email for Let's Encrypt expiry notices |
| `GITEA_DB_PASSWORD` | `openssl rand -hex 20` |
| `GITEA_SECRET_KEY` | `openssl rand -hex 32` |
| `GITEA_INTERNAL_TOKEN` | `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `AWS_REGION` | Region you chose in Step 1 |
| `S3_SVG_BUCKET` | Bucket name from Step 1 |
| `SES_FROM_EMAIL` | Verified SES sender (Step 3, or leave blank) |
| `SES_SMTP_USER` / `SES_SMTP_PASSWORD` | SES SMTP credentials (Step 3, or leave blank) |
| `GITEA_SES_FROM` | Same as `SES_FROM_EMAIL` (or leave blank) |
| `NEXTAUTH_SECRET` | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks |

---

### Step 8 — Configure Nginx virtual hosts

Substitute the placeholder domain names in the Nginx config:

```bash
source .env
sed -i "s/APP_DOMAIN_PLACEHOLDER/${APP_DOMAIN}/g" nginx/conf.d/app.conf
sed -i "s/GITEA_DOMAIN_PLACEHOLDER/${GITEA_DOMAIN}/g" nginx/conf.d/app.conf
```

---

### Step 9 — Obtain SSL certificates

```bash
# Start Nginx in HTTP-only mode so Certbot can complete the challenge
docker compose up -d nginx

# Issue certificates for both domains
docker compose run --rm certbot

# Restart Nginx with SSL enabled
docker compose restart nginx
```

---

### Step 10 — Start the full stack

```bash
docker compose up -d
docker compose ps        # all services should show "healthy" / "Up"
docker compose logs -f   # tail logs
```

---

### Step 11 — Create the Gitea bot account

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

Copy the printed token, add it to `.env` as `GITEA_ADMIN_TOKEN`, then:

```bash
docker compose restart app
```

---

### Step 12 — Set up Supabase auth and database

1. In your Supabase project → **SQL Editor**, run the migrations from `apps/saas/supabase/migrations/` in order.
2. Enable **Row Level Security** on all tenant-scoped tables.
3. Under **Authentication → Providers**, enable **Magic Link**.
4. SVG blobs are stored in S3 (Step 1) — no Supabase Storage bucket needed.

---

### Step 13 — Automate SSL renewal

```bash
(crontab -l 2>/dev/null; echo "0 3 1 * * cd /home/ubuntu/swimlane-cloud && docker compose run --rm certbot renew && docker compose restart nginx") | crontab -
```

---

### Updating the app

```bash
cd swimlane-cloud
git pull
docker compose build app
docker compose up -d app
```

Nginx continues serving the old container until the new one passes its health check.

---

### Production hardening checklist

- [ ] Use **AWS Systems Manager Session Manager** instead of exposing port 22.
- [ ] Enable **Amazon CloudWatch** agent on the instance to ship container logs.
- [ ] Schedule weekly EBS snapshots via **AWS Backup**.
- [ ] Register the Stripe webhook at `https://app.yourdomain.com/api/billing/webhook`.
- [ ] Set a **S3 lifecycle rule** to delete orphaned SVG blobs after 1 year.
- [ ] Enable **S3 server-side encryption** (SSE-S3) on the bucket.

---

## Local development

```bash
# Requires Node 20+ and pnpm
pnpm install

# Run engine tests
cd packages/diagram-converter
pnpm test
```

For local S3, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env` (or use a local S3-compatible service like LocalStack). On EC2, the IAM role supplies credentials automatically — no keys in the file.
