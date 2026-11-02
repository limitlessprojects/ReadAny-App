#!/usr/bin/env python3
"""Second test paper (different content) for the import scene."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

OUT = "/home/z/my-project/ReadAny/tests/fixtures/test-paper-2.pdf"

styles = getSampleStyleSheet()
title = ParagraphStyle("T2", parent=styles["Title"], fontSize=15, leading=19)
abstract = ParagraphStyle("A2", parent=styles["Normal"], fontSize=9, leading=13, leftIndent=18, rightIndent=18)
body = ParagraphStyle("B2", parent=styles["Normal"], fontSize=9.5, leading=14)
h2 = ParagraphStyle("H2b", parent=styles["Heading2"], fontSize=11.5, spaceBefore=10)

flow = [
    Paragraph("Retrieval Kernels for Low-Latency Reading Assistants", title),
    Spacer(1, 4),
    Paragraph("M. Wanjiru, T. Baldini, and S. Ochieng — Systems Group, East African Institute of Computing", abstract),
    Spacer(1, 8),
    Paragraph("<b>Abstract</b> — Reading assistants that answer questions about long documents need retrieval that keeps up with streaming inference. We present a BM25-first retrieval kernel with lazy vector escalation that answers grounded queries in under 40 ms on documents exceeding 100k tokens, reserving embedding search for the 6% of queries where lexical scoring is uncertain. On a 200-question benchmark across academic PDFs, the hybrid kernel matches dense-retrieval answer quality at one-fifteenth of the compute, and its lexical-first design produces passage-level citations that users can verify at a glance.", abstract),
    Spacer(1, 10),
    Paragraph("1. Introduction", h2),
    Paragraph("Latency budgets for interactive reading assistants are unforgiving: a grounded answer that arrives after the reader has scrolled past the section is worthless. Dense retrieval dominates benchmarks but pays for it at query time, especially on devices without accelerators. We observe that for in-document question answering, the corpus is small, the vocabulary is concentrated, and users ask questions whose keywords collide with the paper's own terminology — conditions under which lexical scoring is not a fallback but a first-class strategy.", body),
    Paragraph("2. Design", h2),
    Paragraph("The kernel indexes sections into an inverted index at import time. At query time it scores sections with BM25F, then routes to vector search only when the top score gap falls below a calibrated margin. Citations attach to the highest-scoring passages before generation, so every answer links back to the exact text it was grounded in. The router's margin was tuned once on held-out questions and never per-document.", body),
    Paragraph("3. Results", h2),
    Paragraph("Across 14 academic PDFs, lexical-first retrieval answered 94% of questions without escalation, at a median of 31 ms on a mid-range phone. Answer quality matched a dense baseline within noise while using 15x less compute. Readers rated cited answers as significantly more trustworthy in a 24-participant study.", body),
    Paragraph("4. Conclusion", h2),
    Paragraph("For reading assistants, lexical-first retrieval with lazy escalation is faster, cheaper, and easier to trust. The full kernel ships as part of an open reading stack.", body),
]

doc = SimpleDocTemplate(OUT, pagesize=A4, topMargin=20*mm, bottomMargin=18*mm, leftMargin=22*mm, rightMargin=22*mm, title="Retrieval Kernels for Low-Latency Reading Assistants", author="M. Wanjiru; T. Baldini; S. Ochieng")
doc.build(flow)
print("wrote", OUT)
