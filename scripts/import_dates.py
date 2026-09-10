"""Explicit day-first publication dates. Never turn missing dates into today/Jan 1."""
import re
from datetime import date, datetime, timedelta, timezone


def publication_date(value):
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    if isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, date):
        parsed = value
    else:
        text = str(value or '').strip().translate(str.maketrans('०१२३४५६७८९', '0123456789'))
        iso = re.fullmatch(r'(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?', text)
        dmy = re.fullmatch(r'(\d{1,2})[./-](\d{1,2})[./-](\d{4})', text)
        if iso:
            parsed = date(*map(int, iso.groups()))
        elif dmy:
            day, month, year = map(int, dmy.groups())
            parsed = date(year, month, day)
        else:
            parsed = None
            for fmt in ('%B %d, %Y', '%b %d, %Y', '%d %B %Y', '%d %b %Y'):
                try:
                    parsed = datetime.strptime(text, fmt).date()
                    break
                except ValueError:
                    pass
            if parsed is None:
                return ''  # Partial/unknown dates retain only their separately supplied year.
    if parsed > today:
        raise ValueError(f'Future publication date requires source review: {parsed.isoformat()}')
    return parsed.isoformat()


def publication_year(value, published=''):
    if published:
        return int(publication_date(published)[:4])
    text = str(value or '').strip()
    if re.fullmatch(r'(19|20)\d{2}(?:\.0)?', text):
        year = int(float(text))
        if year <= date.today().year:
            return year
    return None


def assign_missing_ids(records):
    """Existing IDs are permanent: clipping links and source audits depend on them."""
    used = {record['id'] for record in records if record.get('id')}
    next_id = max([int(match[1]) for key in used if (match := re.fullmatch(r'PG(\d+)', key))] or [0]) + 1
    for record in records:
        if not record.get('id'):
            while f'PG{next_id:04d}' in used:
                next_id += 1
            record['id'] = f'PG{next_id:04d}'
            used.add(record['id'])
            next_id += 1
