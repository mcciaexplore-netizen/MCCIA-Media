const rules:[string,RegExp][]=[
 ['Policy & regulation',/\b(policy|budget|regulat\w*|tax|tariff|gst|labour code\w*)\b|धोरण|अर्थसंकल्प|नियम|आयुक्तालय/i],
 ['Exports & trade',/\b(export\w*|import\w*|trade|supply chain)\b|निर्यात|आयात|व्यापार/i],
 ['Skills & education',/\b(skill\w*|training|education|students?|apprentice\w*)\b|कौशल्य|प्रशिक्षण|शिक्षण/i],
 ['Technology & innovation',/\b(semiconductor\w*|AI|artificial intelligence|digital|cyber\w*|innovation|technology)\b|तंत्रज्ञान|सेमीकंडक्टर|कृत्रिम बुद्धिमत्ता/i],
 ['Manufacturing',/\b(manufactur\w*|production|factories|factory|engineering)\b|उत्पादन|कारखान/i],
 ['MSME support',/\b(MSMEs?|helpline|small enterprises?)\b|एमएसएमई|लघुउद्योग|हेल्पलाइन/i],
 ['Events & awards',/\b(conference|conclave|summit|awards?|exhibition|expo|seminar|workshop)\b|परिषद|पुरस्कार|मेळाव|प्रदर्शन/i],
 ['Health & environment',/\b(covid|oxygen|vaccin\w*|health|sustainab\w*|renewable|solar)\b|आरोग्य|पर्यावरण|लसीकरण/i],
];
export function topicLabel(current:string,title=''){
 if(!/^(MCCIA coverage|Topic not assigned|MCCIA Events|MCCIA Website|General)$/i.test(current))return current;
 return rules.find(([,pattern])=>pattern.test(title))?.[0]||'Topic not assigned';
}
