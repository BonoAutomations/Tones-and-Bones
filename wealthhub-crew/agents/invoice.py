import os
import uuid
from datetime import date
from .base import BaseAgent
from tools import GmailSender, InvoicePDF


class InvoiceAgent(BaseAgent):
    """
    INVOICE — Generates a PDF invoice and sends it via Gmail.
    """

    def run(self) -> bool:
        print("\n💰 INVOICE: Generating and sending invoice...")
        recipient_email = os.getenv("INVOICE_RECIPIENT_EMAIL", "")
        recipient_name = os.getenv("INVOICE_RECIPIENT_NAME", "Valued Client")

        if not recipient_email:
            print("  ⚠️  INVOICE_RECIPIENT_EMAIL not set — skipping send")
            return False

        invoice_number = f"WH-{date.today().strftime('%Y%m')}-{str(uuid.uuid4())[:4].upper()}"
        price = int(self.price)

        line_items = [
            {
                "description": "AI-Powered Client Acquisition Automation (Monthly Retainer)",
                "qty": 1,
                "rate": price,
                "amount": price,
            },
            {
                "description": "Prospect Discovery & Enrichment (5 prospects/week)",
                "qty": 1,
                "rate": 0,
                "amount": 0,
            },
            {
                "description": "Personalized Outreach Sequences (3-touch)",
                "qty": 1,
                "rate": 0,
                "amount": 0,
            },
            {
                "description": "Weekly Performance Reports & Analytics",
                "qty": 1,
                "rate": 0,
                "amount": 0,
            },
        ]

        pdf_path = f"output/invoices/invoice_{invoice_number}.pdf"
        os.makedirs("output/invoices", exist_ok=True)

        pdf = InvoicePDF()
        pdf.generate(
            output_path=pdf_path,
            invoice_number=invoice_number,
            recipient_name=recipient_name,
            recipient_email=recipient_email,
            line_items=line_items,
            notes="Thank you for partnering with WealthHub.llc. Your invoice is due within 14 days.",
        )
        print(f"  PDF generated: {pdf_path}")

        # Generate email body with Claude
        email_body = self._write_invoice_email(recipient_name, invoice_number)

        # Send via Gmail
        try:
            gmail = GmailSender()
            gmail.send(
                to=recipient_email,
                subject=f"WealthHub Invoice {invoice_number} — {date.today().strftime('%B %Y')}",
                body_html=email_body,
                attachment_path=pdf_path,
                attachment_name=f"WealthHub_Invoice_{invoice_number}.pdf",
            )
            print(f"  ✅ Invoice sent to {recipient_email}")
            return True
        except Exception as e:
            print(f"  ⚠️  Gmail send failed: {e}")
            print(f"  📄 PDF saved locally: {pdf_path}")
            return False

    def _write_invoice_email(self, recipient_name: str, invoice_number: str) -> str:
        system = "You write professional, warm invoice delivery emails for a boutique AI agency."
        prompt = (
            f"Write a short HTML invoice email to {recipient_name} from WealthHub.llc.\n"
            f"Invoice #{invoice_number} for ${self.price}/mo retainer.\n"
            "3 short paragraphs: gratitude, what the invoice covers, payment instructions.\n"
            "Sign off as 'The WealthHub Team'. Return only the HTML body content (no <html>/<body> tags)."
        )
        return self.ask(system, prompt, max_tokens=400)
