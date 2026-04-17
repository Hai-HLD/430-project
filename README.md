# 430-project

## RentIS Transparency Portal

Static pages live in the repo root (`pages/`, `css/`, `js/`). Tickets are stored in **SQLite** using the schema in `database/schema.sql` (`Ticket` and `Messages` tables). The existing database file is `database/Ticket.db`.

### Run the site with the API

Pages call **`/api/tickets`** to list, create, and load tickets. Those requests only work when the site is served from the ASP.NET app (same origin), not when opening HTML files directly from disk.

From the `api` folder:

```bash
dotnet run
```

Then open **http://localhost:5050/** (or follow the URL shown in the terminal). Use **Submit a ticket** and **My tickets** to exercise the database.

### Staff console (separate from the portal)

The staff UI is **not** linked from tenant pages (`home`, FAQ, submit ticket, my tickets). Open it directly, for example:

**http://localhost:5050/pages/staff.html**

It uses its own layout (`staff.css` / `staff.js` only—no `site.css`). The sidebar lists **ticket numbers** (`Ticket #…`, with **· Closed** when applicable); the panel header shows the **ticket topic** (`TicketTitle`), status (**Open** / **Closed**), and a **Close ticket** control. Staff replies use:

- **POST `/api/staff/tickets/{id}/messages`** — body: `{ "content": "..." }`. Appends **`MessageSender` = `staff`** (plain text) and updates **`LastUpdated`** (ticket stays closed if it was already closed).
- **POST `/api/staff/tickets/{id}/close`** — sets **`TicketStatus`** to **`Closed`** and updates **`LastUpdated`**.

When a **customer** sends **POST `/api/tickets/{id}/messages`**, if the ticket was **closed**, **`TicketStatus`** is set back to **`Open`** automatically (same request as the new message).

List and thread data reuse **GET `/api/tickets`** and **GET `/api/tickets/{id}`**.

The **My tickets** and **Staff** pages poll those endpoints about every **2.5 seconds** (skipped while the browser tab is in the background) so new messages and list changes show up without a manual refresh.

---

- **POST `/api/tickets`** — body: `{ "topicKey": "ranking" | "recommendations" | "pricing" | "custom", "customTitle": string | null, "description": string }`. Creates a `Ticket` row and two `Messages` rows (`MessageSender` **`user`** for the description, **`staff`** for the auto-reply).
- **GET `/api/tickets`** — ticket summaries for the sidebar (newest first).
- **GET `/api/tickets/{id}`** — one ticket plus its messages in order.
- **POST `/api/tickets/{id}/messages`** — body: `{ "content": "..." }`. Appends a user message (`MessageSender` **`user`**), updates **`LastUpdated`**, and **reopens** the ticket if **`TicketStatus`** was **`Closed`** (case-insensitive).
