import os
from datetime import date, timedelta
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT


class InvoicePDF:
    """Generate a professional WealthHub invoice PDF."""

    def generate(
        self,
        output_path: str,
        invoice_number: str,
        recipient_name: str,
        recipient_email: str,
        line_items: list[dict],
        notes: str = "",
    ) -> str:
        """
        Generate invoice PDF. line_items: [{"description": ..., "qty": ..., "rate": ..., "amount": ...}]
        Returns the output path.
        """
        doc = SimpleDocTemplate(
            output_path,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        styles = getSampleStyleSheet()
        gold = colors.HexColor("#C9A84C")
        dark = colors.HexColor("#1A1A2E")
        light_gray = colors.HexColor("#F5F5F5")

        story = []

        # Header
        header_style = ParagraphStyle("Header", fontSize=28, fontName="Helvetica-Bold",
                                      textColor=dark, spaceAfter=4)
        sub_style = ParagraphStyle("Sub", fontSize=11, fontName="Helvetica",
                                   textColor=colors.HexColor("#555555"), spaceAfter=2)
        story.append(Paragraph("WealthHub.llc", header_style))
        story.append(Paragraph("AI-Powered Agency Automation", sub_style))
        story.append(Paragraph("hello@wealthhub.llc | wealthhub.llc", sub_style))
        story.append(HRFlowable(width="100%", thickness=2, color=gold, spaceAfter=12))

        # Invoice meta
        today = date.today()
        due = today + timedelta(days=14)
        meta_data = [
            ["INVOICE", f"#{invoice_number}"],
            ["Date", today.strftime("%B %d, %Y")],
            ["Due Date", due.strftime("%B %d, %Y")],
            ["Bill To", f"{recipient_name}\n{recipient_email}"],
        ]
        meta_table = Table(meta_data, colWidths=[1.5 * inch, 4 * inch])
        meta_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 11),
            ("TEXTCOLOR", (0, 0), (0, 0), gold),
            ("FONTSIZE", (0, 0), (0, 0), 18),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(meta_table)
        story.append(Spacer(1, 20))

        # Line items table
        table_data = [["Description", "Qty", "Rate", "Amount"]]
        total = 0
        for item in line_items:
            amount = item.get("amount", item.get("qty", 1) * item.get("rate", 0))
            total += amount
            table_data.append([
                item["description"],
                str(item.get("qty", 1)),
                f"${item.get('rate', amount):,.2f}",
                f"${amount:,.2f}",
            ])

        table_data.append(["", "", "TOTAL", f"${total:,.2f}"])

        col_widths = [3.8 * inch, 0.6 * inch, 1.2 * inch, 1.2 * inch]
        items_table = Table(table_data, colWidths=col_widths)
        items_table.setStyle(TableStyle([
            # Header row
            ("BACKGROUND", (0, 0), (-1, 0), dark),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("ALIGN", (0, 0), (0, -1), "LEFT"),
            # Body rows
            ("FONTNAME", (0, 1), (-1, -2), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 10),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, light_gray]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            # Total row
            ("FONTNAME", (2, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (2, -1), (-1, -1), 12),
            ("TEXTCOLOR", (3, -1), (3, -1), gold),
            ("LINEABOVE", (2, -1), (-1, -1), 1.5, dark),
            ("GRID", (0, 0), (-1, -2), 0.25, colors.HexColor("#DDDDDD")),
        ]))
        story.append(items_table)
        story.append(Spacer(1, 20))

        if notes:
            notes_style = ParagraphStyle("Notes", fontSize=9, fontName="Helvetica",
                                         textColor=colors.HexColor("#666666"), leading=14)
            story.append(Paragraph(f"<b>Notes:</b> {notes}", notes_style))
            story.append(Spacer(1, 10))

        # Footer
        footer_style = ParagraphStyle("Footer", fontSize=9, fontName="Helvetica",
                                      textColor=colors.HexColor("#888888"), alignment=TA_CENTER)
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#DDDDDD"), spaceAfter=8))
        story.append(Paragraph("Payment due within 14 days. Thank you for your business.", footer_style))

        doc.build(story)
        return output_path
