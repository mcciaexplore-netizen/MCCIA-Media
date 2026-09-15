/** Deterministic suggestions from article text; these do not assert editorial review. */
export function detectMediaMetadata(input) {
  const text = String(input || '').normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').toLowerCase().replace(/\s+/g, ' ').slice(0, 100000);
  const words = new Set(text.replace(/[^\p{L}\p{M}]+/gu, ' ').split(' '));
  const hits = terms => terms.filter(term => words.has(term)).length;
  const dev = (text.match(/[\u0900-\u097f]/g) || []).length;
  const latin = (text.match(/[a-z]/g) || []).length;
  const mr = hits(['आहे','आहेत','यांनी','यांचे','यांच्या','मध्ये','आणि','असे','म्हणाले','होणार','असून','साठी','करणार','केले','झाले']);
  const hi = hits(['है','हैं','में','और','ने','कहा','होगा','लिए','किया','हुए','करने','इसके','साथ']);
  const en = hits(['the','and','with','for','said','from','this','will','has','have','was','in','to','over','since','via']);
  let language = 'Language not recorded';
  if (dev >= 12) {
    language = mr >= 2 && mr > hi ? 'Marathi' : hi >= 2 && hi > mr ? 'Hindi' : 'Marathi / Hindi';
    if (latin > dev * 0.35 && en >= 3) language = language === 'Marathi' ? 'English / Marathi' : 'Multilingual';
  } else if (latin >= 25 && en >= 2) language = 'English';
  const dg = /prashan(?:t|th)\s+girban[ei]|प्रशांत\s+गिरब(?:ने|ाणे|णे|भने)/.test(text);
  const org = /\bmccia\b|ma[hr]*atta chamber|maratha chamber|एमसीसी[आइ]यए|एमसीसीआयए|एमसीसीआईए|मराठा चेंबर/.test(text);
  const president = /mccia.{0,20}president|president.{0,20}mccia|एमसीसीआयए.{0,15}अध्यक्ष/.test(text);
  const people = [];
  if (dg) people.push('Prashant Girbane — Director General');
  if (president) people.push('MCCIA President');
  if (/sudhanwa kopardekar|सुधन्वा कोपर्डेकर/.test(text)) people.push('Sudhanwa Kopardekar');
  if (org) people.push('MCCIA');
  const name = '(?:prashan(?:t|th)\\s+girban[ei]|प्रशांत\\s+गिरब(?:ने|ाणे|णे|भने))';
  let dgEngagementType = null;
  if (new RegExp('(?:article|column|op[- ]?ed|post|written|authored)\\s+by\\s+(?:mr\\.?\\s+)?' + name).test(text) || new RegExp(name + '\\s+(?:यांचा\\s+लेख|यांनी\\s+लिहिलेला|writes|wrote)').test(text)) dgEngagementType = 'Post/article written by DG Sir';
  else if (new RegExp('(?:interview|conversation|podcast|dialogue)\\s+with\\s+(?:mr\\.?\\s+)?' + name).test(text) || new RegExp(name + '\\s+(?:यांची\\s+मुलाखत|यांच्याशी\\s+संवाद|in conversation with)').test(text)) dgEngagementType = 'Conversation with DG Sir';
  else if (new RegExp(name + '[^.!?।]{0,45}(?:\\bsaid\\b|\\bsays\\b|\\bstated\\b|म्हणाले|सांगितले|नमूद केले)').test(text)) dgEngagementType = 'Quote given by DG Sir';
  const rules = [
    ['Exports & trade', /\bexport|\btrade\b|निर्यात|व्यापार/],
    ['Skills & education', /\bskill|\btraining\b|\beducation\b|कौशल्य|प्रशिक्षण|शिक्षण/],
    ['Policy & regulation', /\bpolicy\b|\bbudget\b|\bregulation|\blabour code|धोरण|अर्थसंकल्प|नियम|आयुक्तालय/],
    ['Technology & innovation', /\bsemiconductor|\bartificial intelligence\b|\bai\b|\bcyber|तंत्रज्ञान|सेमीकंडक्टर|कृत्रिम बुद्धिमत्ता/],
    ['Manufacturing', /\bmanufactur|\bfactory|\bproduction\b|उत्पादन|कारखान/],
    ['Events & awards', /\bsummit\b|\bconclave\b|\bconference\b|\bawards?\b|परिषद|पुरस्कार|मेळावा/],
    ['MSME support', /\bmsmes?\b|एमएसएमई|लघु उद्योग/],
    ['Health & environment', /\bhealth\b|\bsustainab|\bclimate\b|आरोग्य|पर्यावरण/]
  ];
  const topic = (rules.find(rule => rule[1].test(text)) || ['Topic not assigned'])[0];
  return {language, topic, presence: people.join('; ') || 'Person not recorded', dgEngagementType};
}
