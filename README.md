# AiCertix landing page (v2.3)

Static site (`index.html`, images, `assets/`) plus one serverless function, `api/solicitud.js`,
which saves each form request in Supabase and emails it to the team.

## 1. Supabase (once)
1. Create a project at supabase.com (region: the closest to Peru available).
2. Dashboard > SQL Editor > New query: paste `supabase/schema.sql` and press Run.
   It creates the table `solicitudes` and a private storage bucket `solicitudes` for attached files.
3. Dashboard > Project Settings > API: copy the **Project URL** and the **secret key**
   (shown as "secret" or "service_role"). The secret key goes only into Vercel, never into the page.

## 2. Vercel environment variables
Project > Settings > Environment Variables (Production and Preview):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL from Supabase |
| `SUPABASE_SECRET_KEY` | Secret / service_role key from Supabase |
| `SMTP_HOST` | Outgoing mail server of the hola@aicertix.com mailbox (Namecheap Private Email normally uses `mail.privateemail.com`; confirm in your mail settings) |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `hola@aicertix.com` |
| `SMTP_PASS` | Password of that mailbox |
| `MAIL_TO` | Address that receives the requests, e.g. `hola@aicertix.com` |

Redeploy after adding them.

## 3. Deploy
Push this folder to github.com/aicertix/aicertix-landing. In Vercel the framework preset is "Other",
with no build command and output directory `.`. Vercel installs the two packages in `package.json` by itself.

## 4. Check
Send a request from the live page with a small Excel or PDF attached. You should see:
a new row in Supabase > Table Editor > `solicitudes`, the file in Storage > `solicitudes`,
and an email (with the file attached) at `MAIL_TO`. If something fails, Vercel > Project > Logs shows why.

## Notes
- Attachments: Excel (.xls, .xlsx, .csv) or PDF, up to 3 MB.
- The form requires the consent checkbox; the request stores that consent.
- If the email fails, the request is still saved in Supabase and the failure is written to the Vercel log.
- Spanish is the default language; texts live in the `I18N` object in `index.html`.
- `PORTS` in `index.html` feeds the origin picker in section 02 and the form's port field.
- If you add new Tailwind classes, rebuild the stylesheet:
  `npx tailwindcss@3 -i in.css -o assets/tailwind.css --content index.html --minify`
  (`in.css` holds the three `@tailwind` lines).
