import { prettyDate, validPublicationDate } from './media-metadata.js';
import { topicLabel } from './topic-labels.js';
const publisherAliases = {
    'sakal': 'Sakal', 'सकाळ': 'Sakal', 'esakal.com': 'Sakal', 'sakal (marathi)': 'Sakal', 'sakal/esakal (marathi)': 'Sakal',
    'loksatta': 'Loksatta', 'loksatta (marathi)': 'Loksatta', 'lokstta': 'Loksatta', 'losatta': 'Loksatta',
    'lokamt': 'Lokmat', 'lokmat': 'Lokmat', 'ratrasanchar': 'Rashtra Sanchar',
    'times of india': 'Times of India', 'the times of india': 'Times of India',
    'indian express': 'Indian Express', 'the indian express': 'Indian Express',
    'hindustan times': 'Hindustan Times', 'financial express': 'Financial Express',
    'the hindu businessline': 'The Hindu BusinessLine', 'the hindu business line': 'The Hindu BusinessLine', 'business line': 'The Hindu BusinessLine',
    'pune time mirrior': 'Pune Times Mirror', 'pune times mirror': 'Pune Times Mirror', 'punemirror': 'Pune Mirror',
    'navbharat': 'Navbharat', 'navabharat': 'Navbharat', 'navrashtra': 'Navarashtra', 'navarashtra': 'Navarashtra',
    'saamna': 'Saamana', 'samana': 'Saamana', 'saamana': 'Saamana', 'aaj ka anand': 'Aaj Ka Anand', 'aaj ka aanand': 'Aaj Ka Anand',
    'agrovan': 'Agrowon', 'the hindu': 'The Hindu', 'business standard': 'Business Standard',
    'e-sakal (pune district edition': 'Sakal', 'pudhari pcmc edition': 'Pudhari',
    'sakal times': 'Sakal Times', 'sunday times of india': 'Times of India',
    'pibs / mccia': 'Press Information Bureau', 'indianembassyqatar': 'Indian Embassy Qatar',
    'zee business / linkedin': 'Zee Business',
};
const hostPublishers = {
    'timesofindia.indiatimes.com': 'Times of India', 'economictimes.indiatimes.com': 'Economic Times',
    'esakal.com': 'Sakal', 'loksatta.com': 'Loksatta', 'lokmat.com': 'Lokmat', 'maharashtratimes.com': 'Maharashtra Times',
    'indianexpress.com': 'Indian Express', 'hindustantimes.com': 'Hindustan Times', 'financialexpress.com': 'Financial Express',
    'thehindubusinessline.com': 'The Hindu BusinessLine', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',
    'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'twitter.com': 'Twitter/X', 'x.com': 'Twitter/X',
    'facebook.com': 'Facebook', 'instagram.com': 'Instagram', 'punemirror.com': 'Pune Mirror', 'punekarnews.in': 'Punekar News',
    'livemint.com': 'Mint', 'mcciapune.com': 'MCCIA', 'mccia.medium.com': 'MCCIA',
    'agrospectrumindia.com': 'Agro Spectrum India', 'cnbctv18.com': 'CNBC TV18',
    'ddnews.gov.in': 'DD News', 'eoibogota.gov.in': 'Embassy of India Bogota',
    'eoibelgrade.gov.in': 'Indian Embassy Belgrade', 'hcimalta.gov.in': 'High Commission of India Malta',
    'ipfonline.com': 'IPF Online', 'knnindia.co.in': 'KNN India', 'thekarbhari.com': 'The Karbhari',
    'thewire.in': 'The Wire', 'icci.it': 'Indian Chamber of Commerce in Italy', 'kpit.com': 'KPIT',
    'marathi.abplive.com': 'ABP Majha', 'mid-day.com': 'Mid-Day', 'mypunepulse.com': 'Pune Pulse',
    'newindianexpress.com': 'New Indian Express', 'pib.gov.in': 'Press Information Bureau',
    'puneinternationalcentre.org': 'Pune International Centre', 'sudhirmehta.in': 'Sudhir Mehta',
    'swarajyamag.com': 'Swarajya', 'thebridgechronicle.com': 'The Bridge Chronicle', 'zeenews.india.com': 'Zee News',
};
export function canonicalPublisher(value, sourceUrl) {
    const label = value.trim().replace(/\s+/g, ' ');
    const hostOf = (url) => { try {
        return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase();
    }
    catch {
        return '';
    } };
    const labelHost = hostOf(label);
    if (hostPublishers[labelHost])
        return hostPublishers[labelHost];
    if (publisherAliases[label.toLowerCase()])
        return publisherAliases[label.toLowerCase()];
    if (/^linkedin\b/i.test(label))
        return 'LinkedIn';
    if (/^youtube\b/i.test(label))
        return 'YouTube';
    const sourcePublisher = sourceUrl ? hostPublishers[hostOf(sourceUrl)] : undefined;
    if (sourcePublisher)
        return sourcePublisher;
    if (!label || /^(?:unknown|—|publisher not recorded|newspaper not recorded|pune)$/i.test(label) || /^(?:https?:\/\/|part of\b)/i.test(label) || /^\S+\.\S+$/.test(label) || label.length > 90 || label.includes(' + '))
        return sourcePublisher || 'Publisher requires review';
    return label;
}
export function canonicalTopic(value, publisher = '') {
    const label = value.trim();
    if (!label || /^(general|linkedin.*|youtube.*|wikipedia|scribd|tedxpune|podcast|(?:weekly|daily) google news alert|internal media tracking|mccia \/ prashant girbane media monitoring)$/i.test(label))
        return 'Topic not assigned';
    if (label.toLowerCase() === publisher.toLowerCase() || Object.values(hostPublishers).some(p => p.toLowerCase() === label.toLowerCase()))
        return 'Topic not assigned';
    if (/^MCCIA newspaper/i.test(label))
        return 'MCCIA coverage';
    if (/^MCCIA publications?$/i.test(label))
        return 'MCCIA publication';
    return label;
}
export function normalizeCategories(item) {
    const publisher = canonicalPublisher(item.publisher, item.url);
    const topic = item.topic === undefined ? undefined : topicLabel(canonicalTopic(item.topic, publisher), item.title);
    return { ...item, publisher, ...(topic === undefined ? {} : { topic }), originalPublisher: item.originalPublisher || item.publisher, originalTopic: item.originalTopic || item.topic };
}
export function csvCell(value) {
    let text = String(value ?? '');
    // Quoting alone does not stop spreadsheet formula execution.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
        text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
}
export function validPublicationMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && validPublicationDate(`${value}-01`) ? value : null; }
export function publicationLabel(item) {
    const month = validPublicationMonth(item.publicationMonth);
    if (item.datePrecision === 'month' && month)
        return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
    return item.date ? prettyDate(item.date) : item.year ? `Date unavailable · ${item.year}` : 'Date unavailable';
}
export function publicationSortDate(item) { return item.date || (validPublicationMonth(item.publicationMonth) ? `${item.publicationMonth}-01` : ''); }
export const QUALITY_FILTERS = ['All', 'Date unavailable', 'OCR not completed', 'OCR needs review', 'Ambiguous connection', 'Original unavailable', 'Full OCR unavailable', 'Language not recorded', 'Person not recorded'];
export function qualityMatches(item, filter) {
    switch (filter) {
        case 'Date unavailable': return !validPublicationDate(item.date) && !validPublicationMonth(item.publicationMonth);
        case 'OCR not completed': return item.ocrStatus !== 'Completed';
        case 'OCR needs review': return !/^Reviewed(?: by| during|$)/i.test(item.ocrReviewStatus || '');
        case 'Ambiguous connection': return /ambiguous|manual.*review/i.test(item.matchStatus || '');
        case 'Original unavailable': return !item.originalImageUrl;
        case 'Full OCR unavailable': return !item.ocrText;
        case 'Language not recorded': return !item.language || item.language === 'Language not recorded';
        case 'Person not recorded': return !item.presence || item.presence === 'Person not recorded';
        default: return true;
    }
}
export function clippingHeadline(item, record) {
    if (item.correctedHeadline)
        return item.correctedHeadline;
    if ('automated' in item && item.automated && item.ocrHeadline && !/^[>_=]|\bSRA\b|requires.*review/i.test(item.ocrHeadline))
        return item.ocrHeadline;
    if (record?.title && record.title !== item.ocrHeadline && !/^[>_=]|\bSRA\b/.test(record.title))
        return record.title;
    if (/^Reviewed(?: by| during|$)/i.test(item.ocrReviewStatus || '') && item.ocrHeadline)
        return item.ocrHeadline;
    return `${item.publisher || 'Newspaper'} clipping · headline needs review`;
}
export function clippingSearchText(item, record) {
    return [item.id, item.matchedRecordId, record?.id, ...(record?.mergedRecordIds || []), record?.title, item.ocrHeadline, item.ocrExcerpt, item.ocrText, item.publisher, item.originalFilename, item.presence, item.reviewDecision].filter(Boolean).join(' ').toLowerCase();
}
export const FILTER_DEFAULTS = { dataset: 'records', search: '', year: 'All', publisher: 'All', type: 'All', language: 'All', topic: 'All', status: 'All', source: 'All', sourceCheck: 'All', dgClassification: 'All', entity: 'All', sort: 'Newest', view: 'grid', quality: 'All' };
export function readArchiveState(search) {
    const params = new URLSearchParams(search);
    const state = { ...FILTER_DEFAULTS };
    for (const key of Object.keys(state))
        state[key] = (params.get(key) ?? state[key]).slice(0, 500);
    if (!['records', 'clippings', 'epapers'].includes(state.dataset))
        state.dataset = 'records';
    if (!['grid', 'list'].includes(state.view))
        state.view = 'grid';
    return { ...state, page: Math.max(1, Math.min(100000, Number.parseInt(params.get('page') || '1', 10) || 1)) };
}
export function archiveQuery(state, page) {
    const params = new URLSearchParams();
    for (const key of Object.keys(FILTER_DEFAULTS))
        if (state[key] !== FILTER_DEFAULTS[key])
            params.set(key, state[key]);
    if (page > 1)
        params.set('page', String(page));
    return params.toString();
}
