# Hestia Mail Setup — mailer.crystaltrading.net

## Completed on server

- Hostname set to **mailer.crystaltrading.net**
- Hestia panel running: **https://mailer.crystaltrading.net** (port 443 — no :8083 needed)
- Hestia user: **ksolaws** (password in `hestia-ksolaws-password.txt`)
- Mail domain: **crystaltrading.pk**
- Mailbox: **sales@crystaltrading.pk** (password in `mail-sales-password.txt`)
- CTC app verified: https://crystaltrading.net/login + /api/health OK
- Backups in this folder + restore script: `scripts/restore-ctc-nginx.sh`

## Nameservers configured on server

- **ns1.crystaltrading.net** → `44.209.22.110`
- **ns2.crystaltrading.net** → `44.209.22.110`

DNS zones managed in Hestia: `crystaltrading.net`, `crystaltrading.pk`

### At your domain registrar (YOU must do this)

For **crystaltrading.net** and **crystaltrading.pk**:

1. Add **glue/host records** (child nameservers):
   - `ns1.crystaltrading.net` → `44.209.22.110`
   - `ns2.crystaltrading.net` → `44.209.22.110`
2. Change domain **nameservers** to:
   - `ns1.crystaltrading.net`
   - `ns2.crystaltrading.net`
3. In **AWS Security Group**, open **port 53 TCP + UDP** (required for public DNS)

Until port 53 is open in AWS, nameservers will not resolve from the internet.


| Type | Name | Value |
|------|------|-------|
| MX | @ | `10 mailer.crystaltrading.net` |
| TXT | @ | `v=spf1 a mx ip4:44.209.22.110 ~all` |
| TXT | mail._domainkey | (see Hestia panel → Mail → crystaltrading.pk → DKIM) |
| TXT | _dmarc | `v=DMARC1; p=none; rua=mailto:sales@crystaltrading.pk` |

`mailer.crystaltrading.net` A record → `44.209.22.110` is already done.

## AWS actions YOU should do

1. **Request port 25 unblock** (EC2 → Account attributes → Email sending)
2. **Set reverse DNS (PTR)** on Elastic IP `44.209.22.110` → `mailer.crystaltrading.net`
3. Ensure security group allows: 25, 587, 465, 993, 995, 80, 443 (8083 not required — panel is proxied on 443)

## Mail client settings

| Setting | Value |
|---------|-------|
| IMAP | mailer.crystaltrading.net:993 (SSL) |
| SMTP | mailer.crystaltrading.net:587 (STARTTLS) |
| Username | sales@crystaltrading.pk |
| Webmail | https://mailer.crystaltrading.net/webmail |

## Important rules

- **Do NOT** add `crystaltrading.net` as a web domain in Hestia
- If site breaks after Hestia changes: `bash scripts/restore-ctc-nginx.sh`

## Optional: point app SMTP to Hestia

Update `backend/.env`:
```
SMTP_HOST=mailer.crystaltrading.net
SMTP_PORT=587
SMTP_USER=sales@crystaltrading.pk
SMTP_PASS=<from mail-sales-password.txt>
```
Then: `pm2 restart backend`
