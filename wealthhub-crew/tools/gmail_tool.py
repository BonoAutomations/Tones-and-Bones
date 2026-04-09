import os
import base64
import json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


class GmailSender:
    """Send emails with optional PDF attachment via Gmail API."""

    SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

    def __init__(self):
        creds = Credentials(
            token=None,
            refresh_token=os.getenv("GMAIL_REFRESH_TOKEN"),
            client_id=os.getenv("GMAIL_CLIENT_ID"),
            client_secret=os.getenv("GMAIL_CLIENT_SECRET"),
            token_uri="https://oauth2.googleapis.com/token",
        )
        self.service = build("gmail", "v1", credentials=creds)
        self.sender = os.getenv("GMAIL_SENDER", "hello@wealthhub.llc")

    def send(
        self,
        to: str,
        subject: str,
        body_html: str,
        attachment_path: str | None = None,
        attachment_name: str | None = None,
    ) -> dict:
        """Send an email, optionally with a PDF attachment."""
        msg = MIMEMultipart("mixed")
        msg["From"] = self.sender
        msg["To"] = to
        msg["Subject"] = subject

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body_html, "html"))
        msg.attach(alt)

        if attachment_path:
            with open(attachment_path, "rb") as f:
                part = MIMEBase("application", "pdf")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            fname = attachment_name or os.path.basename(attachment_path)
            part.add_header("Content-Disposition", f'attachment; filename="{fname}"')
            msg.attach(part)

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        result = self.service.users().messages().send(
            userId="me", body={"raw": raw}
        ).execute()
        return result
