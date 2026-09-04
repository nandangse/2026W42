/**
 * The HR Queries form — the Google Form "How can we help you? / हम आपकी
 * किस प्रकार मदद कर सकते हैं?" as Genie asks it (Dr Raghu, 4 Sep 2026).
 *
 * Kept as data so the screen, the summary line and the printed query all
 * read the same list. Every line carries its Hindi, as the form did: the
 * people it is for read one or the other.
 */
export interface FormItem { key: string; en: string; hi?: string }
export interface FormSection { key: string; en: string; hi?: string; items: FormItem[]; other?: boolean }

export const INTRO_EN =
  "The HR team would like to collect all your queries so that we can find appropriate ways to address them promptly. Please use this form to highlight any issues or assistance that you may need from HR.";
export const INTRO_HI =
  "एचआर टीम आपके सभी प्रश्न/शंकाएँ एकत्र करना चाहती है ताकि हम उन्हें शीघ्रता से और उपयुक्त तरीके से संबोधित कर सकें। कृपया इस फॉर्म का उपयोग करके उन समस्याओं या सहायता की जानकारी दें जिसकी आपको एचआर से आवश्यकता है।";

export const SECTIONS: FormSection[] = [
  {
    key: "attendance", en: "I have an issue with attendance or OT calculations", hi: "मुझे उपस्थिति (Attendance) या ओटी (OT) कैलकुलेशन से संबंधित समस्या है",
    items: [
      { key: "less_salary", en: "Less salary amount received", hi: "मुझे अपेक्षित से कम वेतन राशि प्राप्त हुई है" },
      { key: "wrong_ot", en: "Wrong OT calculation", hi: "ओवरटाइम (OT) की गणना में त्रुटि है" },
      { key: "ot_days", en: "Mismatch in number of OT days", hi: "ओटी दिनों की गिनती मेल नहीं खा रही है" },
      { key: "ot_arrears", en: "Arrears for OT not received", hi: "ओवरटाइम (OT) का बकाया भुगतान नहीं मिला है" },
      { key: "attendance_wrong", en: "Attendance is wrong", hi: "मेरी उपस्थिति (Attendance) गलत दर्ज की गई है" },
      { key: "rate_wrong", en: "Salary rate is wrong", hi: "वेतन दर गलत लागू की गई है" },
      { key: "designation_wrong", en: "Designation is wrong", hi: "पदनाम गलत है — कृपया जाँच/सुधार करें" },
    ],
  },
  {
    key: "loans", en: "I need help with advances and loans", hi: "एडवांसेस एवं लोन संबंधी विषय में मुझे सहायता की आवश्यकता है",
    items: [
      { key: "adv_not_received", en: "Advance approved but not received", hi: "अप्रूव्ड एडवांसेस अभी तक नहीं मिले हैं" },
      { key: "adv_less", en: "Less advance amount received", hi: "एडवांस राशि कम प्राप्त हुई है" },
      { key: "loan_not_received", en: "Loan approved but not received", hi: "लोन अप्रूव्ड हुआ लेकिन प्राप्त नहीं हुआ" },
      { key: "loan_less", en: "Less loan amount approved", hi: "कम लोन राशि स्वीकृत हुई" },
      { key: "loan_eligibility", en: "Need to know loan and advance eligibility and criteria", hi: "लोन और अग्रिम (एडवांस) की पात्रता और मानदंड जानने की आवश्यकता है" },
    ],
  },
  {
    key: "pf", en: "I need help related to PF & UAN", hi: "मुझे PF और UAN से संबंधित सहायता चाहिए",
    items: [
      { key: "uan_unknown", en: "Do not know UAN number", hi: "UAN नंबर नहीं पता है" },
      { key: "uan_portal", en: "Do not know how to use the UAN portal / activate UAN", hi: "UAN पोर्टल का उपयोग कैसे करना है और UAN को कैसे एक्टिवेट करें, यह नहीं पता है" },
      { key: "pf_passbook", en: "How to see the passbook for PF balance", hi: "PF बैलेंस देखने के लिए पासबुक कैसे देखें" },
      { key: "pf_merge", en: "How to merge / transfer previous companies' PF into one", hi: "सभी पिछली कंपनियों के PF को एक ही कंपनी में मर्ज या ट्रांसफर कैसे करें" },
      { key: "pf_old", en: "Have a very old PF number — how to generate a UAN for it", hi: "बहुत पुराना PF नंबर है, इसके लिए UAN नंबर कैसे जनरेट करें" },
      { key: "pf_mismatch", en: "Cannot withdraw / transfer PF because records do not match Aadhaar", hi: "रिकॉर्ड के अनुसार डेटा आधार विवरण से मेल नहीं खाता, इसलिए PF निकाल या ट्रांसफर नहीं कर पा रहे" },
      { key: "uan_correct", en: "How to correct wrong details in UAN (date of birth, name, father's name…)", hi: "UAN में गलत विवरण जैसे जन्मतिथि, नाम, पिता का नाम आदि को कैसे सुधारें" },
    ],
    other: true,
  },
  {
    key: "aadhaar", en: "I have an issue related to Aadhaar card", hi: "मुझे आधार कार्ड से संबंधित समस्या है",
    items: [
      { key: "aadhaar_details", en: "Aadhaar details need correction (full name, date of birth…)", hi: "आधार विवरण में सुधार (पूरा नाम, जन्मतिथि आदि)" },
      { key: "aadhaar_mobile", en: "Mobile number to be linked with Aadhaar", hi: "मोबाइल नंबर आधार से लिंक करना है" },
      { key: "aadhaar_bank", en: "Bank name should match the Aadhaar details", hi: "बैंक का नाम आधार विवरण से मेल खाना चाहिए" },
      { key: "aadhaar_pan", en: "PAN details not matching with Aadhaar", hi: "पैन विवरण आधार से मेल नहीं खा रहा" },
    ],
    other: true,
  },
  {
    key: "slip", en: "I need help with my salary slip", hi: "मुझे अपनी वेतन पर्ची में सहायता चाहिए",
    items: [
      { key: "slip_missing", en: "Salary slip not received", hi: "वेतन पर्ची नहीं मिली" },
      { key: "slip_amount", en: "Correction in salary amount", hi: "वेतन राशि में सुधार" },
      { key: "slip_arrears", en: "Arrears amount issue", hi: "बकाया राशि की समस्या" },
      { key: "slip_designation", en: "Designation or information on the salary slip to be corrected", hi: "वेतन पर्ची पर पदनाम या जानकारी में सुधार" },
    ],
    other: true,
  },
  {
    key: "other", en: "Anything else", hi: "कोई अन्य",
    items: [
      { key: "mediclaim_pending", en: "My mediclaim is pending", hi: "मेरा मेडिक्लेम लंबित है" },
      { key: "mediclaim_card", en: "Details on the mediclaim card are incorrect", hi: "मेडिक्लेम कार्ड में विवरण गलत है" },
      { key: "loan_not_passed", en: "My loan is not passed yet", hi: "मेरा लोन अभी पास नहीं हुआ" },
      { key: "role_clarity", en: "I want more clarity on my role and guidance towards better performance", hi: "मुझे अपनी भूमिका पर अधिक स्पष्टता और बेहतर प्रदर्शन के लिए मार्गदर्शन चाहिए" },
      { key: "training", en: "I'd like more training (will mention below)", hi: "मुझे और प्रशिक्षण चाहिए (नीचे बताऊँगा)" },
      { key: "team_support", en: "I need support for dealing with a team member (confidential)", hi: "मुझे किसी टीम सदस्य से निपटने में सहायता चाहिए (गोपनीय)" },
      { key: "cross_functional", en: "I need cross-functional support", hi: "मुझे क्रॉस-फंक्शनल सहायता चाहिए" },
      { key: "tech_training", en: "Training on technology", hi: "तकनीक पर प्रशिक्षण" },
      { key: "resign", en: "I want to resign", hi: "मैं इस्तीफ़ा देना चाहता/चाहती हूँ" },
    ],
    other: true,
  },
  {
    key: "khalapur", en: "Questions about the move to the Khalapur factory", hi: "खालापुर फैक्ट्री में स्थानांतरण से जुड़े प्रश्न",
    items: [
      { key: "kh_shifting", en: "Khalapur shifting related", hi: "खालापुर शिफ्टिंग संबंधी" },
      { key: "kh_hours", en: "Working hours & OT related", hi: "कार्य समय और ओटी संबंधी" },
      { key: "kh_rate", en: "Salary rate related", hi: "वेतन दर संबंधी" },
      { key: "kh_travel", en: "Travelling related", hi: "यात्रा संबंधी" },
      { key: "kh_health", en: "Health and age related", hi: "स्वास्थ्य और आयु संबंधी" },
      { key: "kh_employment", en: "Employment related", hi: "रोज़गार संबंधी" },
      { key: "kh_accommodation", en: "Accommodation related", hi: "आवास संबंधी" },
    ],
    other: true,
  },
];

export const FREE_TEXT = [
  { key: "other_issue", en: "If there is any other issue where HR can assist and that is not listed above, please mention it here.", hi: "यदि कोई अन्य समस्या है जिसमें एचआर सहायता कर सकता है और जो ऊपर सूचीबद्ध नहीं है, कृपया यहाँ बताएं।" },
  { key: "suggestions", en: "Any suggestions for improving your employment at Nandan GSE", hi: "नंदन जीएसई में आपके रोज़गार को बेहतर बनाने के लिए कोई सुझाव" },
  { key: "khalapur_note", en: "Questions or queries about the move to the Khalapur factory — write in detail, in any language", hi: "खालापुर फैक्ट्री में स्थानांतरण के बारे में प्रश्न — किसी भी भाषा में विस्तार से लिखें" },
];

export interface HrQueryForm {
  ticks: Record<string, string[]>;       // section key → item keys
  other: Record<string, string>;         // section key → "Other:" text
  text: Record<string, string>;          // free-text key → text
  contact: { employee_id: string; name: string; mobile: string; personal_email: string; stay_location: string };
}

const BY_KEY = new Map<string, { s: FormSection; i: FormItem }>();
for (const s of SECTIONS) for (const i of s.items) BY_KEY.set(`${s.key}.${i.key}`, { s, i });

/** Every ticked line, in English, section by section — the query's body. */
export function formToText(f: HrQueryForm): { subject: string; question: string; count: number } {
  const lines: string[] = [];
  let count = 0;
  for (const s of SECTIONS) {
    const t = f.ticks[s.key] || [];
    const o = (f.other[s.key] || "").trim();
    if (!t.length && !o) continue;
    lines.push(`${s.en}:`);
    for (const k of t) { const hit = BY_KEY.get(`${s.key}.${k}`); if (hit) { lines.push(`  • ${hit.i.en}`); count++; } }
    if (o) { lines.push(`  • Other: ${o}`); count++; }
  }
  for (const ft of FREE_TEXT) { const v = (f.text[ft.key] || "").trim(); if (v) { lines.push(`${ft.en}\n  ${v}`); count++; } }
  const firstTick = SECTIONS.flatMap((s) => (f.ticks[s.key] || []).map((k) => BY_KEY.get(`${s.key}.${k}`)?.i.en).filter(Boolean))[0];
  const subject = firstTick ? `${firstTick}${count > 1 ? ` (+${count - 1} more)` : ""}` : count ? "HR query" : "HR query (nothing ticked)";
  return { subject: String(subject).slice(0, 200), question: lines.join("\n") || "(nothing ticked)", count };
}
