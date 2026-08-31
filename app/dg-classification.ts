export const DG_ENGAGEMENT_TYPES = [
  'Post/article written by DG Sir',
  'Quote given by DG Sir',
  'Conversation with DG Sir',
] as const;

export type DgEngagementType = (typeof DG_ENGAGEMENT_TYPES)[number];

const DG_MARKERS = [
  'prashant girbane', 'प्रशांत गिरबने', 'प्रशांत गिरबाणे', 'प्रशांत गिरभने',
  'mccia director general', 'director general mccia', 'dg sir',
  'एमसीसीआयएचे महासंचालक', 'एमसीसीआयए महासंचालक',
];

export function normalizeDgEngagementType(value: unknown): DgEngagementType | null {
  const candidate = String(value ?? '').trim();
  return DG_ENGAGEMENT_TYPES.find((item) => item === candidate) ?? null;
}

export function mentionsDg(value: unknown) {
  const text = String(value ?? '').toLowerCase();
  return DG_MARKERS.some((marker) => text.includes(marker));
}

export function inferDgEngagementType(value: unknown): DgEngagementType | null {
  const text = String(value ?? '').toLowerCase().replace(/\s+/g, ' ');
  if (!mentionsDg(text)) return null;

  const authored = [
    /\b(?:article|post|column|op[- ]?ed|blog|note)\s+by\s+(?:mr\.?\s+)?prashant\s+girbane\b/,
    /\bprashant\s+girbane(?:'s)?\s+(?:article|post|column|op[- ]?ed|blog|note)\b/,
    /\b(?:written|authored|penned)\s+by\s+(?:mr\.?\s+)?prashant\s+girbane\b/,
    /प्रशांत\s+गिरब(?:ने|ाणे|भने).{0,45}(?:लेख|स्तंभ|ब्लॉग|लिखित)/,
  ];
  if (authored.some((pattern) => pattern.test(text))) return DG_ENGAGEMENT_TYPES[0];

  const conversation = [
    /\b(?:interview|conversation|dialogue|podcast|webinar|fireside chat|q\s*&\s*a)\b[^.!?\n]{0,35}\b(?:with|featuring|guest:?|of)\s+(?:mr\.?\s+)?prashant\s+girbane\b/,
    /\bprashant\s+girbane(?:'s)?\b[^.!?\n]{0,18}\b(?:interview|conversation|dialogue|podcast|webinar)\b/,
    /\bprashant\s+girbane\b[^.!?\n]{0,45}\b(?:was interviewed|interviewed by|in conversation with|speaks with|talks to)\b/,
    /(?:मुलाखत|संवाद|पॉडकास्ट|वेबिनार)[^।.!?\n]{0,35}(?:मध्ये|यांच्याशी|सोबत)\s*प्रशांत\s+गिरब(?:ने|ाणे|भने)/,
    /प्रशांत\s+गिरब(?:ने|ाणे|भने)[^।.!?\n]{0,18}(?:मुलाखत|संवाद|पॉडकास्ट|वेबिनार)/,
  ];
  if (conversation.some((pattern) => pattern.test(text))) return DG_ENGAGEMENT_TYPES[2];

  const quote = [
    /\b(?:mr\.?\s+)?prashant\s+girbane\b[^.!?\n]{0,55}\b(?:said|says|stated|told|noted|commented|remarked|pointed out|observed|reacted|emphasised|emphasized)\b/,
    /\b(?:said|says|stated|told|according to|noted|commented|remarked|pointed out|observed|emphasised|emphasized)\b[^.!?\n]{0,55}\b(?:mr\.?\s+)?prashant\s+girbane\b/,
    /प्रशांत\s+गिरब(?:ने|ाणे|भने)[^।.!?\n]{0,55}(?:म्हणाले|सांगितले|नमूद केले|मत व्यक्त|प्रतिक्रिया दिली|स्पष्ट केले)/,
    /(?:म्हणाले|सांगितले|नमूद केले|मत व्यक्त|प्रतिक्रिया दिली|स्पष्ट केले)[^।.!?\n]{0,55}प्रशांत\s+गिरब(?:ने|ाणे|भने)/,
  ];
  if (quote.some((pattern) => pattern.test(text))) return DG_ENGAGEMENT_TYPES[1];
  return null;
}

export function resolveDgEngagementType(explicit: unknown, evidence: unknown) {
  return normalizeDgEngagementType(explicit) ?? inferDgEngagementType(evidence);
}

export type DgClassifiableRecord = {
  dgEngagementType?: unknown;
  title?: unknown;
  description?: unknown;
  presence?: unknown;
  topic?: unknown;
  notes?: unknown;
  publisher?: unknown;
  format?: unknown;
};

export function recordDgEvidence(record: DgClassifiableRecord) {
  return `${record.title ?? ''} ${record.description ?? ''} ${record.presence ?? ''} ${record.topic ?? ''} ${record.notes ?? ''} ${record.publisher ?? ''} ${record.format ?? ''}`;
}

export function resolveRecordDgEngagementType(record: DgClassifiableRecord): DgEngagementType | null {
  const explicit = normalizeDgEngagementType(record.dgEngagementType);
  if (explicit) return explicit;

  const presence = String(record.presence ?? '').toLowerCase();
  const format = String(record.format ?? '').toLowerCase().trim();
  if (/\b(?:authored|co-authored)(?:\b|;)/.test(presence)) return DG_ENGAGEMENT_TYPES[0];
  if (/\binterview(?:;\s*named)?\b/.test(presence) || ['interview', 'news interview', 'tv interview'].includes(format)) {
    return DG_ENGAGEMENT_TYPES[2];
  }
  if (/\bquoted(?:;\s*named)?\b|\bname,\s*quote\b|\bdg quote recorded\b/.test(presence)) {
    return DG_ENGAGEMENT_TYPES[1];
  }
  if (presence.includes('named or pictured in clipping')) return null;
  return inferDgEngagementType(recordDgEvidence(record));
}
