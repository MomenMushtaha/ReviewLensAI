import re
import unicodedata
from bs4 import BeautifulSoup


def clean_text(text: str) -> str:
    """Strip HTML, normalize unicode, collapse whitespace."""
    if not text:
        return ""
    # Strip HTML tags
    soup = BeautifulSoup(text, "lxml")
    text = soup.get_text(separator=" ")
    # Normalize unicode
    text = unicodedata.normalize("NFKC", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def truncate(text: str, max_chars: int = 300) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "…"
