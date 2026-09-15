# BeSight Dashboard

Next.js CRM backed by Prisma and MariaDB. Member data is synchronized from the existing Supabase Edge Function; lot qualification comes from the BeSight webhook service.

## Local setup

1. Create a MariaDB database and copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and the server-only `CRM_CUSTOMERS_TOKEN`.
3. Generate the client, create the database tables, and seed Indicator entitlements:

```bash
npm run db:generate
npm run db:migrate -- --name init_crm
npm run db:seed
npm run dev
```

Open [http://localhost:3000/crm/members](http://localhost:3000/crm/members) for synchronized customers and [http://localhost:3000/crm/campaigns](http://localhost:3000/crm/campaigns) for lot checking.

## Automatic lot renewal

Schedule a daily authenticated request to:

```text
GET /api/cron/lot-renewals/
Authorization: Bearer <CRON_SECRET>
```

By default it checks the current calendar month for every active, verified Trade ID. Optional `date_from` and `date_to` query parameters accept `YYYY-MM-DD` values. Each member/Indicator/month is processed once, so retries do not extend access twice.

The automatic flow grants only active Indicators configured in `PlanIndicatorEntitlement`. A suspended or manually locked access record is never re-enabled automatically.

## Required secrets

- `DATABASE_URL`: MariaDB connection string. Prisma's `mysql` provider supports MariaDB.
- `SHADOW_DATABASE_URL`: separate empty MariaDB database used only by `prisma migrate dev`.
- `CRM_CUSTOMERS_TOKEN`: bearer token accepted by the Supabase `crm-customers` Edge Function. It is never exposed to browser JavaScript.
- `CRON_SECRET`: protects the scheduled renewal endpoint.

`DEFAULT_REQUIRED_LOTS` defaults to `3`; a member-level override takes precedence. `INDICATOR_RENEWAL_MONTHS` defaults to `1`.
