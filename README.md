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
docker-compose.yml     # Full production stack
.env.example           # Environment variable template
```

---

## Deploying on Amazon Web Services (EC2)

The full stack (Next.js app + Gitea + Postgres + Nginx) runs on a single EC2 instance via Docker Compose. Supabase is used as a managed service for auth and the app database; only Gitea (the git server) is self-hosted.

### Prerequisites

- AWS account
- A domain name with DNS hosted in Route 53 (or any registrar)
- A Supabase project (free tier works for development)
- A Stripe account

---

### Step 1 — Launch an EC2 instance

1. Open the [EC2 console](https://console.aws.amazon.com/ec2) and click **Launch instance**.
2. Choose **Ubuntu 24.04 LTS (x86_64)**.
3. Instance type: **t3.medium** minimum (Gitea + Postgres + Next.js; upgrade to t3.large for production load).
4. Storage: **30 GB gp3** root volume (increase to 50+ GB if you expect heavy diagram history).
5. Security group — open these inbound ports:

   | Port | Protocol | Source    | Purpose              |
   |------|----------|-----------|----------------------|
   | 22   | TCP      | Your IP   | SSH                  |
   | 80   | TCP      | 0.0.0.0/0 | HTTP (certbot)       |
   | 443  | TCP      | 0.0.0.0/0 | HTTPS (app + Gitea)  |

6. Create or select a key pair, then launch.
7. **Allocate and associate an Elastic IP** to the instance so the address doesn't change on restart:
   - EC2 → Elastic IPs → Allocate → Associate → select your instance.

---

### Step 2 — Point DNS to the instance

In Route 53 (or your registrar), create two **A records** pointing to the Elastic IP:

| Record name           | Type | Value         |
|-----------------------|------|---------------|
| `app.yourdomain.com`  | A    | `<Elastic IP>`|
| `git.yourdomain.com`  | A    | `<Elastic IP>`|

DNS propagation takes a few minutes.

---

### Step 3 — Install Docker on the instance

```bash
ssh -i your-key.pem ubuntu@<Elastic IP>

# Install Docker + Compose plugin
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

# Allow ubuntu user to run docker without sudo
sudo usermod -aG docker ubuntu
newgrp docker
```

---

### Step 4 — Clone the repo and configure environment

```bash
git clone https://github.com/your-org/swimlane-cloud.git
cd swimlane-cloud

# Copy the env template and fill in values
cp .env.example .env
nano .env
```

Required values to set in `.env`:

| Variable | Where to get it |
|---|---|
| `APP_DOMAIN` | Your app subdomain, e.g. `app.yourdomain.com` |
| `GITEA_DOMAIN` | Your Gitea subdomain, e.g. `git.yourdomain.com` |
| `CERTBOT_EMAIL` | Your email for Let's Encrypt notifications |
| `GITEA_DB_PASSWORD` | Generate: `openssl rand -hex 20` |
| `GITEA_SECRET_KEY` | Generate: `openssl rand -hex 32` |
| `GITEA_INTERNAL_TOKEN` | Generate: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API |
| `NEXTAUTH_SECRET` | Generate: `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Webhooks |

---

### Step 5 — Configure Nginx virtual hosts

Update the placeholder domain names in the Nginx config:

```bash
sed -i "s/APP_DOMAIN_PLACEHOLDER/$(grep APP_DOMAIN .env | cut -d= -f2)/g" nginx/conf.d/app.conf
sed -i "s/GITEA_DOMAIN_PLACEHOLDER/$(grep GITEA_DOMAIN .env | cut -d= -f2)/g" nginx/conf.d/app.conf
```

---

### Step 6 — Obtain SSL certificates

Run Certbot once before starting Nginx with SSL (it uses the HTTP challenge):

```bash
# Start just Nginx in HTTP-only mode temporarily
docker compose up -d nginx

# Request certificates for both domains
docker compose run --rm certbot

# Restart Nginx to pick up the certificates
docker compose restart nginx
```

---

### Step 7 — Start the full stack

```bash
docker compose up -d
```

Check that all services are healthy:

```bash
docker compose ps
docker compose logs -f
```

---

### Step 8 — Create the Gitea bot account

Gitea's web installer is disabled (`INSTALL_LOCK=true`). Create the admin account via CLI:

```bash
docker compose exec gitea gitea admin user create \
  --admin \
  --username swimlane-bot \
  --password "$(openssl rand -hex 16)" \
  --email bot@yourdomain.com
```

Then generate an API token:

```bash
docker compose exec gitea gitea admin user generate-access-token \
  --username swimlane-bot \
  --token-name saas-api \
  --raw
```

Copy the token and add it to `.env` as `GITEA_ADMIN_TOKEN`, then restart the app:

```bash
docker compose restart app
```

---

### Step 9 — Set up Supabase

1. In your Supabase project, go to **SQL Editor** and run the schema migrations from `apps/saas/supabase/migrations/` (in order).
2. Enable **Row Level Security** on all tenant-scoped tables.
3. Create the **`svg-blobs` Storage bucket** (or whichever name you set in `SVG_STORAGE_BUCKET`), set it to private.
4. Enable **Magic Link** auth under Authentication → Providers.

---

### Step 10 — Automate SSL renewal

Add a cron job on the host to renew certificates monthly:

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

Zero-downtime: Nginx keeps serving the old container until the new one passes its health check.

---

### Recommended production hardening

- Enable **EC2 Instance Connect** or use AWS Systems Manager Session Manager instead of open SSH.
- Attach an **IAM role** to the instance with `s3:PutObject` / `s3:GetObject` if you use S3 for SVG storage instead of Supabase Storage.
- Enable **Amazon CloudWatch** log agent to ship container logs off-instance.
- Snapshot the EBS volume weekly via **AWS Backup**.
- Set up a **Stripe webhook endpoint** at `https://app.yourdomain.com/api/billing/webhook` in the Stripe dashboard.

---

## Local development

```bash
# Install dependencies (requires Node 20+, pnpm)
pnpm install

# Run the engine package tests
cd packages/diagram-converter
pnpm test
```

Full local stack (app + Gitea) coming once `apps/saas` is scaffolded.
