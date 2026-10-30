#!/usr/bin/env python3
"""Serve the partner page and store lead-form submissions in SQLite."""

import hmac
import html
import json
import mimetypes
import secrets
import sqlite3
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "leads.db"
ADMIN_PASSWORD = "#1234"
BUSINESS_TYPES = (
    "Mutual Fund Distributors",
    "Lending Platforms",
    "Stock Brokers",
    "Financial Superapps",
    "Wealth Managers",
    "Others",
)
EXTRA_COLUMNS = ("mobile", "business_type", "arn", "aum")
HOST = "127.0.0.1"
PORT = 8765
MAX_BODY = 16_384

sessions = set()


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL DEFAULT '',
            mobile TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL,
            company_name TEXT NOT NULL,
            business_type TEXT NOT NULL DEFAULT '',
            arn TEXT NOT NULL DEFAULT '',
            aum TEXT NOT NULL DEFAULT '',
            comments TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
        """
    )
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(leads)")}
    for column in EXTRA_COLUMNS:
        if column not in columns:
            conn.execute(f"ALTER TABLE leads ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
    return conn


def save_lead(lead):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO leads
                (first_name, last_name, mobile, email, company_name, business_type, arn, aum,
                 comments, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                lead["first_name"],
                lead["last_name"],
                lead["mobile"],
                lead["email"],
                lead["company_name"],
                lead["business_type"],
                lead["arn"],
                lead["aum"],
                lead["comments"],
                datetime.now().astimezone().isoformat(timespec="seconds"),
            ),
        )


def list_leads():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM leads ORDER BY id DESC"
        ).fetchall()
    return rows


def clean(value, limit):
    text = " ".join(str(value or "").split())
    return text[:limit]


def valid_email(value):
    if len(value) > 120 or "@" not in value:
        return False
    local, _, domain = value.partition("@")
    return bool(local and "." in domain and " " not in value)


def valid_mobile(value):
    return len(value) == 10 and value.isdigit() and value[0] in "6789"


def parse_lead(payload):
    first_name = clean(payload.get("firstName"), 80)
    last_name = clean(payload.get("lastName"), 80)
    mobile = clean(payload.get("mobile"), 10)
    email = clean(payload.get("email"), 120)
    company = clean(payload.get("company"), 120)
    business_type = clean(payload.get("businessType"), 60)
    arn = clean(payload.get("arn"), 20)
    aum = clean(payload.get("aum"), 40)
    comments = str(payload.get("comments") or "").strip()[:1000]
    if not first_name or not email or not company or not valid_email(email):
        return None
    if not valid_mobile(mobile) or business_type not in BUSINESS_TYPES:
        return None
    return {
        "first_name": first_name,
        "last_name": last_name,
        "mobile": mobile,
        "email": email,
        "company_name": company,
        "business_type": business_type,
        "arn": arn,
        "aum": aum,
        "comments": comments,
    }


def esc(value):
    return html.escape(str(value or ""), quote=True)


def format_when(value):
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return value
    return moment.strftime("%d %b %Y, %I:%M %p")


def page(title, body):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<link rel="stylesheet" href="/css/admin.css">
</head>
<body>
{body}
</body>
</html>
"""


def login_page(error=""):
    message = f'<p class="admin-error">{esc(error)}</p>' if error else ""
    return page(
        "Admin login",
        f"""
<main class="admin-login">
  <form class="admin-card" method="post" action="/admin">
    <p class="admin-kicker">Shriram Credit</p>
    <h1>Partner leads</h1>
    <p class="admin-note">Enter the admin password to see submitted leads.</p>
    {message}
    <label>
      Password
      <input type="password" name="password" autocomplete="current-password" required autofocus>
    </label>
    <button type="submit">Continue</button>
  </form>
</main>
""",
    )


def leads_page(rows):
    if rows:
        body = []
        for row in rows:
            body.append(
                "<tr>"
                f"<td>{row['id']}</td>"
                f"<td>{esc(format_when(row['created_at']))}</td>"
                f"<td>{esc(row['first_name'])}</td>"
                f"<td>{esc(row['last_name'])}</td>"
                f"<td>{esc(row['mobile'])}</td>"
                f"<td><a href=\"mailto:{esc(row['email'])}\">{esc(row['email'])}</a></td>"
                f"<td>{esc(row['company_name'])}</td>"
                f"<td>{esc(row['business_type'])}</td>"
                f"<td>{esc(row['arn'])}</td>"
                f"<td>{esc(row['aum'])}</td>"
                f"<td>{esc(row['comments'])}</td>"
                "</tr>"
            )
        table = (
            '<div class="admin-table-wrap"><table>'
            "<thead><tr>"
            "<th>ID</th><th>Submitted</th><th>First name</th><th>Last name</th>"
            "<th>Mobile</th><th>Email</th><th>Company name</th><th>Nature of business</th>"
            "<th>ARN</th><th>AUM</th><th>Comments</th>"
            "</tr></thead><tbody>"
            + "".join(body)
            + "</tbody></table></div>"
        )
    else:
        table = '<p class="admin-empty">No leads yet.</p>'

    count = len(rows)
    label = "lead" if count == 1 else "leads"
    return page(
        "Partner leads",
        f"""
<header class="admin-bar">
  <div>
    <p class="admin-kicker">Shriram Credit</p>
    <h1>Partner leads</h1>
  </div>
  <form method="post" action="/admin/logout">
    <button type="submit" class="admin-ghost">Log out</button>
  </form>
</header>
<main class="admin-main">
  <p class="admin-count">{count} {label}</p>
  {table}
</main>
""",
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def cookies(self):
        found = {}
        for part in self.headers.get("Cookie", "").split(";"):
            if "=" not in part:
                continue
            name, value = part.strip().split("=", 1)
            found[name] = value
        return found

    def is_admin(self):
        token = self.cookies().get("admin_session", "")
        return token in sessions

    def send_html(self, status, markup, headers=None):
        data = markup.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or []):
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length < 0 or length > MAX_BODY:
            return None
        return self.rfile.read(length)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/admin":
            if self.is_admin():
                self.send_html(200, leads_page(list_leads()))
            else:
                self.send_html(200, login_page())
            return
        if path.startswith("/api/") or path.startswith("/data/") or path == "/server.py":
            self.send_error(404)
            return
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/leads":
            self.create_lead()
            return
        if path == "/admin":
            self.login()
            return
        if path == "/admin/logout":
            self.logout()
            return
        self.send_error(404)

    def create_lead(self):
        raw = self.read_body()
        if raw is None:
            self.send_json(413, {"error": "Submission is too large."})
            return
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "Send the lead as JSON."})
            return
        if not isinstance(payload, dict):
            self.send_json(400, {"error": "Send the lead as JSON."})
            return
        lead = parse_lead(payload)
        if lead is None:
            self.send_json(400, {"error": "First name, a valid mobile number, email, company name, and nature of business are required."})
            return
        save_lead(lead)
        self.send_json(201, {"ok": True})

    def login(self):
        raw = self.read_body() or b""
        fields = parse_qs(raw.decode("utf-8", errors="replace"))
        password = fields.get("password", [""])[0]
        if not hmac.compare_digest(password, ADMIN_PASSWORD):
            self.send_html(401, login_page("That password is not correct."))
            return
        token = secrets.token_urlsafe(32)
        sessions.add(token)
        self.send_html(
            303,
            "",
            [
                ("Location", "/admin"),
                (
                    "Set-Cookie",
                    f"admin_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200",
                ),
            ],
        )

    def logout(self):
        token = self.cookies().get("admin_session", "")
        sessions.discard(token)
        self.send_html(
            303,
            "",
            [
                ("Location", "/admin"),
                ("Set-Cookie", "admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"),
            ],
        )

    def serve_static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        relative = Path(path.lstrip("/"))
        if relative.is_absolute() or ".." in relative.parts:
            self.send_error(404)
            return
        target = (ROOT / relative).resolve()
        if not target.is_file() or ROOT not in target.parents and target != ROOT:
            self.send_error(404)
            return
        if target == DB_PATH or DB_PATH in target.parents:
            self.send_error(404)
            return
        data = target.read_bytes()
        mime, _ = mimetypes.guess_type(target.name)
        self.send_response(200)
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    connect().close()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Partner page: http://{HOST}:{PORT}/")
    print(f"Admin:        http://{HOST}:{PORT}/admin")
    server.serve_forever()


if __name__ == "__main__":
    main()
