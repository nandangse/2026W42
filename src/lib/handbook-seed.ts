/**
 * THE EMPLOYEE HANDBOOK — edition 14, drafted 4 Sep 2026 from v13.0.
 *
 * Dr Raghu: "Put it in a way that is readable and easy to understand. Think
 * of yourself as the world's best CHRO. Please include whatever information
 * you know about Nandan and whatever else is there, and then I will give
 * you comments on improving this."
 *
 * Every rule in v13 is here. What changed is the telling: short sections,
 * second person, a one-line "what this means for you" on each, numbers in
 * tables, and the places v13 contradicted itself or left a blank are marked
 * [CHECK] for his comment rather than silently resolved. Seeded ONCE into
 * hrms_handbook; after that the words belong to the screen, not this file.
 */
export interface SeedSection { slug: string; ord: number; title: string; summary: string; audience?: "all" | "staff" | "workers"; body: string }

export const HANDBOOK_EDITION = "14.0 (draft, Sep 2026)";

const T = (rows: string[][], head = true) =>
  `<table><tbody>${rows.map((r, i) => `<tr>${r.map((c) => (head && i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;

export const HANDBOOK_SEED: SeedSection[] = [
  {
    slug: "welcome", ord: 1, title: "Welcome, and how to use this handbook",
    summary: "This is the one place that says how things work at Nandan. Read it once, come back when you need it, and ask HR here when something is unclear.",
    body: `
<p>Welcome to Team Nandan. We value your being a part of our family.</p>
<p>This handbook sets out the policies, benefits, working terms and the standard of conduct that every one of us follows as a condition of working at Nandan GSE Pvt Ltd ("Nandan GSE" or "the Company"). It is written to be read, not filed: each section starts with what it means for you, and the numbers are in tables.</p>
<h4>Three things to know</h4>
<ul>
<li><b>It is not a contract.</b> Your appointment letter is. Where the two differ, the appointment letter and the law prevail.</li>
<li><b>It changes.</b> The Company may amend, add or withdraw anything here as the law or the business requires. Changes take effect from the date they are made; we will tell you, and this page always shows the current edition. Keeping up with it is part of the job.</li>
<li><b>Only the MD &amp; CEO can make an exception</b>, in writing, for one person, once. An exception is never a precedent.</li>
</ul>
<h4>How to ask a question</h4>
<p>Under every section there is <b>Ask HR about this</b>. Your question goes to HR with the section attached; the answer comes back to you here, and where it helps everyone HR publishes it under the section so the next person does not have to ask. For anything else, the <b>HR Queries</b> form at genie.nandan.co.in/hrms/query is open to every login.</p>
<h4>Our door is open</h4>
<p>If something cannot be settled with your supervisor, take it to the next level of management. The MD &amp; CEO's calendar is open to every employee for exactly this.</p>
<p>Nandan GSE is an equal-opportunity employer. Religion, age, gender, origin, orientation, race or colour play no part in hiring, promotion, development, pay or benefits. Decisions are on merit.</p>
<p><i>Issued by Dr Raghunandan Jagdish, Managing Director &amp; CEO. Reviewed and supported by J.C. Kumar, Chairman.</i></p>
<p>You will be asked to acknowledge that you have read and understood this handbook. The acknowledgement is at the foot of this page.</p>`,
  },
  {
    slug: "about", ord: 2, title: "About Nandan GSE",
    summary: "Thirty-five years, from a six-man workshop to a 200-strong ISO 9001:2015 company that designs and builds lifting and handling equipment for aviation, defence and industry.",
    body: `
<p>Nandan GSE began in 1991 as Nandan Enterprises, a six-person workshop, founded by Mr J.C. Kumar and Dr Raghunandan Jagdish, who between them bring more than seventy years of experience to the business. Today it is a family-owned private limited company, incorporated in Mumbai, with around 200 people in Team Nandan and a brand, NGSE, known across Asia for quality at a fair price.</p>
<h4>What we make</h4>
<p>Aviation ground support equipment (catering hi-lifts, passenger steps, ambulifts, conveyors, toilet and water service units), material handling and aerial access equipment (scissor lifts, manlifts, vehicle-mounted platforms), car parking systems and specialised defence solutions. Hydraulic lifting is our core competence, from concept and design through manufacture, installation and service.</p>
<h4>Where we are</h4>
${T([["Location", "What happens there"], ["Turbhe, Navi Mumbai", "Head office"], ["Marol, Mumbai", "Office"], ["Khalapur, Raigad", "NGSE Factory 3.0, our main manufacturing site"], ["Belapur, Navi Mumbai", "Office"]])}
<p>We hold ISO 9001:2015 certification for our management systems, and we run the company on our own software: the Nandan ERP for orders, jobs and daily reporting, and <b>Genie</b> for planning, people (HRMS), sales and materials.</p>
<h4>Things we are proud of</h4>
<ul>
<li>Asia's largest scissor lift, 40-tonne capacity; India's largest at 17 m x 5 tonne for Sahara Star; a 14 m x 8 m scissor for aircraft engine testing.</li>
<li>One of only eight companies in the world to have built upper-deck catering hi-lifts, for Ambassador's Sky Chefs and Taj SATS.</li>
<li>More than a thousand hi-lifts delivered in two decades to Taj SATS, Sky Gourmet, LSG, EIH (Mauritius), Gate Gourmet, Oberoi, Air India, SriLankan Catering, Maldives Inflight Catering and others.</li>
<li>Steps, ambulifts and conveyors for Air India, Jet Airways, Kingfisher, IndiGo, Menzies, Globe Ground, Saudi Arabian Airlines and Cambata Aviation.</li>
<li>For the nation: bullet-proof vehicles and 25 VSMLs for DRDO, the engine-transfer platform for Project Tejas, food delivery vehicles for Army Headquarters, special conveyors for Leh, GSE for HAL Nashik, and equipment for BEL.</li>
<li>The "I for India" flight simulator ride at Adlabs Imagica, conceived, designed, built and installed in record time.</li>
<li>Fifty multi-stage scissor lifts and a hundred manlifts for infrastructure builders including L&amp;T, Thermax, Patel Engineering and SEW.</li>
</ul>
<h4>Who leads what</h4>
${T([["Area", "Leader", "Reach them"], ["Management, Sales", "Dr Raghunandan Jagdish", "raghu@nandan.co.in"], ["Operations, Service", "Yashavantha Nayak", "yashavantha@nandan.co.in"], ["Quality", "Prashant Patil", "prashant@nandan.co.in"], ["Production", "Rajesh Nayak", "rajeshn@nandan.co.in"], ["Planning (PPC)", "Pankaj Sutar", "pankajs@nandan.co.in"], ["Design", "Dhanesh Patil", "dhanesh@nandan.co.in"], ["R&amp;D", "Dr Sangram Patil", "sangram@nandan.co.in"], ["Purchase, Stores", "Mukesh Tiwari", "mukesh@nandan.co.in"], ["Accounts", "Suresh Lalzare", "suresh@nandan.co.in"], ["HR", "HR desk", "hr@nandan.co.in"]])}
<p class="check">[CHECK] v13 lists Pankaj Sutar under PPC with Mukesh Tiwari's number and e-mail, names Vinay Mande as HR while the POSH committee and the muster messages carry Prasad Tambe, and leaves Quality Assurance blank. Corrected addresses above; please confirm the HR name.</p>`,
  },
  {
    slug: "beliefs", ord: 3, title: "What we believe",
    summary: "Four magic words, Safety, Quality, On-Time and Khushi, and the purpose, mission, values and policies behind them.",
    body: `
<h4>Purpose</h4>
<p>To equip our customers with solutions that enhance efficiency and unlock human potential, and to empower every life we touch to do more purposeful work. We inspire Team Nandan to do great work with the <b>Four Magic Words: Safety, Quality, On-Time and Khushi</b>.</p>
<h4>Mission</h4>
<p>To help our customers improve productivity, performance and safety with products that are the best available in quality, reliability, delivery and life, at the highest level of customer satisfaction.</p>
<h4>Vision</h4>
<p>To be the leading designer and manufacturer of aviation GSE, aerospace and defence systems and specialised handling solutions in Asia, delivering worldwide.</p>
<h4>Big Hairy Audacious Goal</h4>
<p>To be the first choice for specialised handling systems worldwide, with 1,000 paying customers a year and annual billing beyond ₹300 crore at industry-beating profitability.</p>
<p class="check">[CHECK] v13 dates the BHAG "by 2025-26" and elsewhere says "Vision 2026: a 300 cr company". The year needs restating for FY 2026-27 onwards.</p>
<h4>The One Page Strategic Plan</h4>
<p>Every quarter the leadership publishes the OPSP, the whole strategy on one page. Every Leaders Council member signs it and displays it in their area; the approved copy hangs in the Board Room. It is the one document to read regularly.</p>
<h4>Our values</h4>
<ul>
<li><b>People and teamwork.</b> Respect and dignity, open communication, reward for team success, investment in your growth.</li>
<li><b>Accountability, integrity and trust.</b> Do the right thing. Our handshake is our bond. We stand behind our promises.</li>
<li><b>Creativity and innovation.</b> Share knowledge, take considered risks, turn ideas into business.</li>
<li><b>Dedication to excellence.</b> High standards, initiative, ownership of results, continuous improvement.</li>
</ul>
<h4>Quality policy, in short</h4>
<p>Quality stays first in every mind and is never traded away. Every deviation is raised, recorded and fixed so it does not recur. Our designs are simple, reliable and easy to maintain; our service is proactive; our suppliers are raised to our standard; and we measure and benchmark relentlessly.</p>
${T([["Objective", "Target", "Measured"], ["Customer satisfaction", "80% minimum", "Yearly survey"], ["On-time delivery", "90%", "Quarterly"], ["In-house rejection", "Nil", "Yearly"], ["Sales growth, domestic and export", "30%", "Yearly"], ["Adherence to the work flow", "80%", "Quarterly"]])}
<h4>Health, safety and environment, in short</h4>
<p>We provide a safe and healthy workplace for employees, customers, suppliers and visitors, comply with every applicable law and code, identify hazards and bring risks as low as reasonably practicable, train and consult our people, report and investigate every incident and near miss, and audit ourselves. Safety is every person's responsibility. On the environment: prevent pollution, minimise waste, choose suppliers with the environment in mind, dispose of waste correctly, and improve every year. Both policies are reviewed annually and displayed on our premises.</p>
<h4>Business conduct, human rights and community</h4>
<p>We compete fairly and honestly, respect the law wherever we operate, endorse the Universal Declaration of Human Rights and the ILO's fundamental principles, employ no child or forced labour, tolerate no harassment, and expect our suppliers and contractors to hold the same standards. Heads of department train their teams on these principles monthly, overseen by HR.</p>`,
  },
  {
    slug: "conduct", ord: 4, title: "How we behave at work",
    summary: "Be on time, be professional, keep the company's information inside the company, and tell someone when you see a rule broken.",
    body: `
<h4>The code of conduct</h4>
<ul>
<li><b>Conflict of interest.</b> No other employment, directorship, shareholding or contract that competes with Nandan GSE. Tell your manager the moment a possible conflict appears. Any outside work needs the MD &amp; CEO's approval. Dual employment ends your employment.</li>
<li><b>Confidentiality.</b> What you learn here about the company, its customers, designs, prices and people stays here, during your employment and after it. A breach is serious misconduct and may lead to termination and recovery of damages.</li>
<li><b>Intellectual property.</b> Every drawing, design, program, plan or system you create in the course of your work belongs to Nandan GSE.</li>
<li><b>Your personal record.</b> HR keeps it; a summary is in the ERP; you may see it through your manager. Tell HR when your address, phone or nominees change. What is on record is treated as correct for every legal and payroll purpose.</li>
<li><b>Gifts.</b> If a vendor, customer or anyone else offers you a gift, cash or favour of any kind, tell management at once. Management decides what happens next.</li>
</ul>
<p class="check">[CHECK] v13 cites the Copyright Act 1994 and the Privacy Act 1993, which are New Zealand statutes. The Indian references are the Copyright Act 1957 and the Digital Personal Data Protection Act 2023; used here.</p>
<h4>Everyday rules</h4>
<ul>
<li>Dress professionally and appropriately for your duties. Uniform and PPE on the shop floor.</li>
<li>Be at your workplace, ready to work, at the starting time. If you will be absent or late, tell your supervisor as early as you can.</li>
<li>Keep to the rest and meal timings. Do not leave your workstation without permission except for reasonable personal needs.</li>
<li>Work safely for yourself and others. No violence, abuse or indecent conduct.</li>
<li>No alcohol, drugs, tobacco or smoking on or around the premises, and never report for work under their influence. Being found positive on a test means suspension.</li>
<li>If you are on medication that could affect your work, or have an infectious illness, tell your supervisor.</li>
<li>No weapons on duty, licensed or otherwise.</li>
<li>Never falsify a record: attendance, work reports, client records or any document.</li>
<li>Look after company tools, equipment and property. Nothing leaves the premises, physical or electronic, without authorisation.</li>
<li>Company e-mail, phones and internet are for work. No photographs inside the factory, and no sharing of photos, client names or project names on any medium without permission.</li>
<li>If your profile names the company, keep radical or hateful views on religion or politics off it.</li>
<li>Reply to WhatsApp and e-mail on time. Own the tasks you are given.</li>
<li>Going out on company work? Fill the OD slip first. Heads of department self-approve; everyone else needs the HoD's signature.</li>
<li><b>Daily reporting is compulsory</b>, in the ERP, with a screenshot to your department's WhatsApp group.</li>
<li>Report a breach of any rule to a supervisor. Seeing a wrong and staying silent makes you part of it.</li>
</ul>
<p>Grievances are welcome and will be heard: see <i>Speaking up</i>. Suggestions are welcome too; the suggestion box is there for ideas as much as complaints.</p>`,
  },
  {
    slug: "joining", ord: 5, title: "Joining Nandan",
    summary: "Your first weeks: the documents HR needs, probation, what you get on joining, and the habits that start on day one.",
    body: `
<p>Everyone joins on probation, goes through onboarding, and is given a buddy for the early days. Training is on our Learning Management System (mygyaan.net); your manager decides how and when.</p>
<h4>Documents HR needs, at the earliest</h4>
<ul>
<li>Nandan GSE employment form, with personal and bank details</li>
<li>PAN card, Aadhaar card, passport if you have one, five photographs</li>
<li>Next of kin details, blood group, family details, emergency information form</li>
<li>Medical records of any pre-existing condition</li>
<li>Bank passbook copy or cancelled cheque</li>
<li>Declaration accepting the employment terms; family details form for EPF, ESI and gratuity as applicable</li>
</ul>
<h4>What you receive</h4>
${T([["When", "What"], ["On joining", "Mediclaim: ₹2,00,000 cover for Staff, ₹1,00,000 for Labour, for you, your spouse and up to two unmarried children under 25"], ["Within 15 days", "Your appointment letter (once every document is in), your ERP login, and a place in your department's WhatsApp group"], ["After 1 month", "Uniform. Staff choose two shirts and a T-shirt, or one shirt and two T-shirts. Labour get an industrial uniform, safety shoes and a helmet"], ["Every March and September", "One shirt or T-shirt for Staff; one uniform set for workers"], ["On confirmation", "Company ID card with your employee code, and visiting cards where the role needs them"], ["After 2 years' service", "LIC group term insurance of ₹10,00,000, premium paid by the Company as part of CTC"]])}
<h4>Your first salary</h4>
<p>Join before the 20th and the month's salary comes in the same month. Join after the 20th and it comes with the next month's, as arrears. This applies to Staff.</p>
<h4>Habits that start on day one</h4>
<ul>
<li><b>Monday assembly at 8:40 am.</b> Everyone attends.</li>
<li><b>Daily reporting</b> in the ERP at nandanerp.in, screenshot to your department group. Compulsory; non-compliance is a disciplinary matter.</li>
<li><b>Probation.</b> The period in your letter stands. Your performance is reviewed before you are confirmed.</li>
</ul>`,
  },
  {
    slug: "safety", ord: 6, title: "Safety",
    summary: "PPE on the floor, no phones on the floor, report every injury and hazard at once. Three notices for a safety breach bring a penalty.",
    body: `
<p>Our Environment, Health and Safety policy commits management and workers alike to removing or reducing risk for everyone our work touches. Management provides a safe workplace, safe systems, safe plant and substances, welfare facilities, training and supervision, and consults you on safety. You, in turn:</p>
<ul>
<li>Follow safe work practices and every safety direction.</li>
<li>Wear PPE and appropriate clothing on the factory floor and wherever required. No loose clothing or jewellery near machinery.</li>
<li><b>No mobile phone on the factory floor or in the workshop.</b></li>
<li>Do not operate a machine until you have been instructed and authorised. Shut it down before cleaning, repairing or leaving it.</li>
<li>Never distract someone at a machine.</li>
<li>Report every accident, injury and near miss at once, however small. Never treat an injury yourself; in a serious accident, do not move the person until medical direction is given.</li>
<li>Report every hazard you see to your supervisor.</li>
<li>Keep your area clean. Never block a fire extinguisher.</li>
<li>Know where the first-aid kit is, and the emergency and evacuation plan.</li>
<li>No smoking, tobacco, alcohol or drugs on the premises. No photographs inside the factory without authorisation.</li>
</ul>
<p>The General Manager (Operations) ensures everyone has and follows this policy. Risk assessments are done annually for every activity and recorded.</p>
<h4>If safety rules are broken</h4>
<p>A breach, such as working without PPE, brings a formal notice. Three notices bring a penalty deducted from salary. Notices are considered at appraisal. Repeated or careless breaches escalate to suspension of three to seven working days, and, with the MD &amp; CEO's approval, dismissal.</p>`,
  },
  {
    slug: "hours-pay", ord: 7, title: "Working hours, attendance and pay",
    summary: "8:30 to 5:30, nine hours including breaks, punched on the biometric. Ten minutes' grace, three late marks a month, and the salary on the 10th.",
    body: `
<h4>Categories</h4>
<p>Staff and Staff on probation; Workers and Workers on probation. Contract engagements have their own terms.</p>
<h4>Timings</h4>
${T([["", "Rule"], ["Office and factory", "8:30 am to 5:30 pm. A full working day is 9 hours including breaks"], ["Women employees", "Choose one slot in writing: 8:30–5:30, 9:00–6:00 or 9:30–6:30. No daily flexi-time"], ["Leaders Council", "Flexible timings"], ["Third Saturday", "Holiday every month. Other Saturdays work till 5:30 pm"], ["Lunch", "1:00 to 1:30 pm, even if you go home for it"], ["Tea", "Three breaks of 10 minutes: 10:00–10:30, 3:00–3:30, 5:00–5:30"]])}
<h4>Half days</h4>
<p>Reporting after 12:00 noon but before 1:30 pm, with at least four hours worked, is a half day. Reporting after 1:30 pm is absent, whatever the hours. Leaving between 2:00 and 4:00 pm is a half day of leave.</p>
<h4>Punching and OD slips</h4>
<p>Punching on the biometric is compulsory. If the machine is down, hand your HoD-approved OD slip to HR within three days. Anyone working outside the office fills an OD slip weekly, approved by manager and HoD, and it is counted in the month's attendance by the 30th or 31st. Attendance goes on the notice board and on WhatsApp by the 3rd; report a discrepancy by the 4th or it waits for next month. A mis-punch without an OD slip is a late mark.</p>
<h4>Grace, late marks and short hours</h4>
<ul>
<li>Ten minutes' grace on arrival, up to three times a month. After that, a late arrival is a <b>late mark</b>. Leaving between 4:30 and 5:30 pm is also a late mark. Late marks do not apply to Leaders.</li>
<li>Three late marks are allowed a month. Beyond three, half a day is deducted from that month's attendance. Regular lateness earns a memo that counts at appraisal. Compensatory work can be set against late marks, on application through your HoD, at management's discretion.</li>
<li><b>Short hours.</b> Arrive 30 minutes late and you are 30 minutes short; make it up the same day or it is deducted. At month end total hours are checked: Staff owe 9 hours × the calendar days of the month; Labour owe 9 hours × 26 days. A shortfall of up to 30 minutes is ignored; 31 to 60 minutes counts as an hour; the rest is deducted pro rata. Late arrival or early leaving of up to an hour is allowed twice a month.</li>
<li>For Labour, overtime is counted only after the day's short hours are made good.</li>
</ul>
<p class="check">[CHECK] v13 states monthly hours for Staff as 9 × 30 or 31 calendar days, which counts Sundays and the third Saturday as working days. Please confirm the intended base.</p>
<h4>Salary</h4>
<ul>
<li>Your salary is confidential between you, your manager and HR. It is credited on or around the <b>10th</b> of the month with a payslip. No part-payments before the date.</li>
<li><b>Salary advance</b> on the 22nd through the advance slip in the box under the notice board, cut-off the 20th: up to ₹5,000 for Staff and ₹4,000 for workers, or 25% of salary payable if lower, with at least 15 days' attendance in the month. Recovered in full from the same month's salary; a second advance only after the first is settled.</li>
<li>No salary is paid for a period of absence or overstayed leave; it is released within three working days of your return.</li>
<li><b>Review</b> every April by your HoD, HR and the MD &amp; CEO, on your performance, the market and the Company's results. A review does not guarantee an increase. The appraisal runs through your IDP in Genie.</li>
<li><b>Bonus.</b> Statutory bonus on twelve months' earned basic, paid in the weeks before Diwali. Some roles carry a performance incentive against a written performance plan. Your appointment letter prevails.</li>
<li><b>Attendance bonus</b> of ₹500, announced at Monday assembly, for a month with no late mark, no leave and full attendance.</li>
</ul>
<h4>Heads of salary</h4>
${T([["Head", "How it is paid"], ["Basic &amp; DA", "On days worked"], ["HRA", "At least 20% of Basic &amp; DA, on days worked. Not for Labour or Management"], ["Fixed allowance", "In full for 7 or more days worked in the month; pro rata for new joiners"], ["Conveyance", "On days worked, excluding weekly offs and holidays"], ["Medical allowance", "On days worked. Not for Labour"], ["Site allowance", "For site work, per the site policy"], ["Other", "Uniform, shoes, travel reimbursements"], ["Deductions", "PF, ESIC, professional tax, loan and advance recoveries, penalties. Nothing else is deducted without telling you"]])}
<h4>Comp off and overtime</h4>
<ul>
<li>Staff working beyond 5:30 pm, till 7:00 pm, on at least 15 days in the month with HoD approval, earn comp off: 10 extra hours in the month make one comp off, 5 make half. Operations staff staying the extra half hour earn an Operations Allowance credited as comp off, encashable.</li>
<li>Working on a holiday, weekly off or the third Saturday with HoD approval earns a comp off. Workers earn one comp off for a third Saturday worked.</li>
<li>Workers' overtime is paid as the law provides. Early punching does not count as overtime.</li>
<li>A whole night worked with HoD approval earns a day's leave.</li>
</ul>`,
  },
  {
    slug: "leave", ord: 8, title: "Leave and holidays",
    summary: "Earned leave accrues monthly, one day per 10 worked for Staff and per 20 for workers, once you are confirmed. Apply in advance; no leave is a right.",
    body: `
<p>This section applies to permanent employees. Trainees and short-term assignments carry no leave.</p>
<h4>Privilege leave</h4>
${T([["", "Staff", "Workers"], ["Accrual", "1 day per 10 days worked", "1 day per 20 days worked"], ["Minimum balance to draw paid leave", "15 days", "8 days"], ["Encashment", "Up to 15 days a year through the form; at 31 March any balance above 30 is paid in the March salary at gross", "Up to 15 days a year through the form"]])}
<ul>
<li>The leave year is April to March; mid-year joiners get a pro-rated entitlement. Leave is credited and consumed monthly on the leave ledger.</li>
<li>No leave during probation. Leave already accrued becomes available on confirmation or six months, whichever is later.</li>
<li>Below the minimum balance, days off are leave without pay.</li>
<li>Apply in advance: five or more days, 15 days ahead; two to four days, 48 hours ahead. In an emergency, regularise the leave on the day you return.</li>
<li>Leave taken without permission more than four times a year brings a disciplinary memo.</li>
<li>Leave is not joined to weekly offs, holidays or the third Saturday: take Thursday and Sunday around a Friday off and Saturday holiday, and four days of leave are counted. Genuine hospitalisation of self or immediate family is the exception.</li>
<li>No leave during the notice period.</li>
</ul>
<h4>Unauthorised absence</h4>
<p>Absent without approval, or overstaying leave, for seven consecutive days or more is treated as abandoning your job. Three registered letters ask for an explanation; without a reply, a fourth ends the employment from the last day worked.</p>
<p class="check">[CHECK] The separation section of v13 says three consecutive days of no-show is abandonment; this section says seven. One figure is needed.</p>
<h4>Other leave, for confirmed employees</h4>
${T([["Leave", "Days", "Rule"], ["Maternity", "26 weeks, up to 8 before the expected date", "Per the Maharashtra Maternity Benefit Rules, after 80 days' service in the 12 months before. Twice in a career. Apply 30 days ahead with medical reports"], ["Paternity", "3 consecutive days", "For two children. Inform HR on the day of the birth; complete the form on return"], ["Bereavement", "3 consecutive days from the date", "Parents, spouse, children, siblings under 18, grandparents. Inform HR the same day"], ["Wedding", "5 consecutive days", "First wedding only. Inform HR in writing a month ahead"]])}
<p>None of these can be encashed or carried forward.</p>
<h4>Holidays</h4>
<p>The year's paid holidays, half days and the twelve third Saturdays are published every January from the Government of Maharashtra's notification and displayed on the notice board and here.</p>
<p class="check">[CHECK] v13 still carries the 2025 list; the 2026 list goes here.</p>`,
  },
  {
    slug: "loans", ord: 9, title: "Loans and advances",
    summary: "A loan is help in genuine need, not an entitlement: after a year's confirmed service, for a listed purpose, up to three or four months' gross, repaid over 18 months.",
    body: `
<p>We recognise that life brings financial distress, and we will help, while keeping the help measured so that it encourages prudence.</p>
<h4>Loans</h4>
${T([["", "Rule"], ["Who", "Confirmed employees with one year's service. Not while on a performance improvement plan"], ["Purposes", "Medical emergency or death in the immediate family; children's education fees; building or renovating a home; marriage of a blood relative; a need of equal weight"], ["How much", "Up to 3 months' gross salary under 5 years' service; 4 months' gross beyond 5 years; or the amount asked, if lower"], ["Repayment", "Up to 18 monthly instalments from salary, starting the month after disbursement. No skipping an instalment, except once a financial year in an emergency with the MD &amp; CEO's approval"], ["Interest", "As applicable under bank rates and statute, at management's discretion"], ["Top-ups", "None until the previous loan is fully repaid"]])}
<p>Apply on the loan requisition form through your HoD to HR with supporting documents. HR puts it to the MD &amp; CEO; on approval a loan agreement is signed and Accounts disburses. Leaving before repayment, the balance is recovered from your final settlement; leaving without proper notice with a balance outstanding invites legal action.</p>
<h4>Advances</h4>
<p>See <i>Working hours, attendance and pay</i>: up to ₹5,000 for Staff and ₹4,000 for workers, on the 22nd, recovered the same month. Contract employees may be considered with the GM Operations' approval.</p>`,
  },
  {
    slug: "expenses", ord: 10, title: "Travel, expenses and site allowance",
    summary: "Plan travel ahead, take the advance four days before, settle within a week of return, and claim at the rates below.",
    body: `
<h4>Before you travel</h4>
<ul>
<li>Travel programmes are approved by your HoD monthly or as needed.</li>
<li>Domestic travel advance: request four days ahead, including two days for Accounts to process. International: a week ahead; forex card or currency per the trip.</li>
<li>Settle every advance within a week of returning, with a travel report and the claim voucher. Unsettled advances are recovered from salary.</li>
</ul>
<h4>Within the city: your own vehicle on company work</h4>
${T([["Vehicle", "Fuel", "Rate per km"], ["Four-wheeler", "Petrol", "₹9.50"], ["Four-wheeler", "Diesel", "₹7.50"], ["Four-wheeler", "CNG", "₹4.50"], ["Two-wheeler", "Petrol", "₹4.50"]])}
<p>Rates are fuel price ÷ mileage + maintenance, on Maharashtra prices of January 2025, and are reviewed every six months. They cover travel between Turbhe or Marol and the Khalapur factory.</p>
<h4>Outside Mumbai: daily limits</h4>
${T([["", "HoDs", "Staff", "Workers"], ["Lodging, per day", "₹2,000", "₹1,000", "₹750"], ["Train", "Sleeper first; then 3AC or 2AC. Air only in an emergency with proof", "Sleeper first; then 3AC", "Ticket booked by the office"], ["Breakfast", "₹100", "₹100", "₹60"], ["Lunch", "₹150", "₹150", "₹140"], ["Snacks", "₹100", "₹100", "₹60"], ["Dinner", "₹200", "₹200", "₹140"], ["DA, site deployment only", "₹150", "₹150", "₹100"]])}
<p>Claim what you spent, up to the limit, on bills. Meals the client provides are not claimable. Water is within the allowance. The meal rates apply also to Marol and Turbhe people travelling to Khalapur, without lodging.</p>
<h4>Site allowance</h4>
<p>Mumbai site lunch allowance: ₹100 for Staff, ₹70 for workers. Other site completion perks are per the management-approved list submitted by the Service Supervisor.</p>
<h4>Petty and recurring expenses</h4>
<p>Water, stationery and monthly bills are paid by cheque or transfer, not cash. The General Manager holds an imprest for day-to-day petty expenses, settled on the second and fourth Saturdays and replenished by Monday.</p>`,
  },
  {
    slug: "learning", ord: 11, title: "Learning and training",
    summary: "Nandan pays for training that has a stated purpose. Your IDP, your manager's feedback and the LMS are where it starts.",
    body: `
<p>Nandan values continual learning: keep sharpening the saw. Training needs come from your own awareness, your manager's feedback and your performance discussions, and are captured in your Individual Development Plan (IDP) in Genie. The training committee builds the calendar from them.</p>
<ul>
<li>Scheduled training is recorded in the ERP's HR module with its objectives.</li>
<li>It may be on our Learning Management System at mygyaan.net or with an outside provider.</li>
<li>Costs go on the training requirement sheet with the benefit to the company, for the CEO's approval. The Company bears the cost.</li>
<li>The library is there for you. Use it.</li>
</ul>`,
  },
  {
    slug: "speaking-up", ord: 12, title: "Speaking up: grievances and questions",
    summary: "Ask HR here, raise a query at hrms/query, or book the MD & CEO. A grievance is answered within 30 days by a committee of equal halves.",
    body: `
<h4>Three doors, all open</h4>
<ul>
<li><b>Ask HR about this</b>, under any section of this handbook.</li>
<li><b>HR Queries</b> at genie.nandan.co.in/hrms/query, for attendance, OT, salary slips, PF, Aadhaar, loans, mediclaim, role clarity, training or anything else. You see your own queries and HR's answers there.</li>
<li><b>The MD &amp; CEO's calendar</b>, bookable by any employee with an agenda. The CEO will hear the people concerned and arbitrate. If the grievance is against the CEO, an arbitrator from an industrial association such as the SSEA, TTC, can be sought.</li>
</ul>
<h4>The committees</h4>
${T([["Committee", "Who", "Purpose", "Meets"], ["Management Review", "MD, CEO, GM", "The health of the organisation", "Second Saturday monthly"], ["Appraisal", "CEO, VP, GM, HR", "Sign off the appraisal and increments", "First week of March"], ["Disciplinary", "GM, Production Head, Stores Head, HR, two employees of the department", "Policy violations", "As needed, 48 hours' written notice"], ["Internal Complaints (POSH)", "See the POSH section", "Sexual harassment complaints", "Every six months and as needed"], ["Grievance Redressal", "Up to six: equal halves management and colleagues, equal men and women", "Any grievance about work or the workplace", "Within 30 days of a complaint"]])}
<h4>A grievance</h4>
<p>Anything that makes your working conditions unsatisfactory: environment, facilities, contractual terms, conflict with colleagues or a supervisor, or a sense of injustice not resolved through the normal channels. Write it down with dates, times and people, and submit it to the committee. It investigates fairly, on the principles of natural justice, and answers within 30 days. Your identity is kept as confidential as the investigation allows. Everyone must cooperate with an investigation and keep it confidential. Appeal within seven working days; the appeal is decided within 30 days.</p>
<p>A knowingly false complaint is gross misconduct.</p>
<p class="check">[CHECK] v13 leaves blanks for the grievance e-mail, the appeal authority and the member list, and links a Google Form. Genie's HR Queries form can carry grievances; please confirm the appeal authority.</p>`,
  },
  {
    slug: "discipline", ord: 13, title: "Discipline and consequences",
    summary: "Written warning, final warning, dismissal. Serious misconduct skips the steps. Every notice counts at appraisal.",
    body: `
<p>Discipline exists so that the many who do the right thing are not let down by the few who do not. A breach raised to the Head of Production, the General Manager or the MD &amp; CEO starts the process.</p>
<h4>The steps</h4>
<ol>
<li><b>Formal written warning</b>, placed on your file and in the ERP, considered at appraisal.</li>
<li><b>Final warning</b> if the first is not heeded, stating that further misconduct or poor performance means dismissal.</li>
<li><b>Dismissal</b>, with notice or summarily.</li>
</ol>
<p>Three memos bring suspension. A domestic enquiry, with a fair chance to reply, precedes any suspension or dismissal, and the MD &amp; CEO approves every dismissal.</p>
<h4>Serious misconduct, which may mean dismissal without notice</h4>
<p>Material breach of your agreement or this handbook; dishonesty or theft; bringing yourself or the Company into disrepute; falsifying records; wilful damage to property; unauthorised absence; violence, threats or harassment; being drunk or on drugs on company business; wrongful disclosure of company information; misuse of electronic or social media; any breach of the law.</p>
<h4>What follows what</h4>
${T([["Behaviour", "First", "Second", "Third"], ["Safety breach, misuse of equipment, personal use of company systems, not reporting a violation", "Notice", "Notice, penalty", "Final notice, penalty, suspension 3 to 7 days; dismissal if repeated"], ["Alcohol or drugs on premises", "Test; 1 day's suspension if positive", "3 days' suspension", "Dismissal"], ["Late or short hours, leave or comp-off rules", "Deduction from salary", "Notice", "Notice; may end employment"], ["Dual employment", "Enquiry and termination", "", ""], ["Breach of confidentiality, theft, falsification, information security, POSH", "Show-cause notice and enquiry; suspension", "", "Termination and legal action"], ["Unprofessional conduct, abuse", "Show cause; 1 to 3 days' suspension", "1 to 3 days", "7 days; termination"]])}
<p>Penalties and suspensions need the MD &amp; CEO's approval. Every notice is considered at the annual appraisal.</p>`,
  },
  {
    slug: "it", ord: 14, title: "Computers, phones and information",
    summary: "Company systems are for company work. Guard your password, lock your desk and screen, and expect the company to see what passes through its systems.",
    body: `
<ul>
<li>Never share your password. Choose one of at least eight characters with mixed case, numbers and symbols. Change it if you think it is known. Practise a clear desk and a clear screen, and shut your PC down when you leave.</li>
<li>Look after your computer and phone: no food or drink spills, no rough handling.</li>
<li>All software is licensed; the Chief Executive approves purchases. Copying software or infringing copyright is your personal liability.</li>
<li>Internet and e-mail are for work. Occasional personal use is tolerated when it is minimal, harms nobody's work or the Company's name, involves nothing objectionable, breaks no law and brings you no private gain.</li>
<li>Never use company systems for abusive, defamatory, obscene or racist material, for pornography, for applying to other jobs, or for sending personal or client data outside without authorisation.</li>
<li>E-mail is not private. Messages on the company system belong to the Company, which may review them at any time.</li>
<li>Company mobile: keep the handset in good order; personal calls to a minimum; the monthly bill is sent to you and personal calls are debited to salary.</li>
</ul>`,
  },
  {
    slug: "leaving", ord: 15, title: "Leaving Nandan",
    summary: "Thirty days' written notice, a counselling conversation, return of company property, an exit interview, and full and final settlement within 20 days.",
    body: `
<h4>Resignation</h4>
<ul>
<li>Write to your supervisor, who forwards it to the GM, HR and the MD &amp; CEO. A counselling session follows.</li>
<li>Serve <b>30 days' notice</b> as your letter says. A shortfall is deducted from your final settlement. Early release against payment is not automatic; your manager decides on the impact to work.</li>
<li>Leaving within 10 to 15 days of joining earns no compensation.</li>
<li>Confidentiality continues for one year after you leave.</li>
<li>Full and final settlement within <b>20 days</b> of your last working day, by cheque, once advances and expenses are cleared. Accrued leave and bonus are added; gratuity if eligible under the law; loans, advances and unreturned property are recovered. HR starts your PF paperwork on your last day; the PF office's timing is its own.</li>
<li>Health insurance and other benefits end on your last day.</li>
</ul>
<h4>Before you go</h4>
<p>Return everything: vehicle, phone, computer, access cards, keys, records, ID card. Copying data from your computer is an offence. Hand over your work and every note of confidential information to the person authorised to receive it. An exit interview is held in your last week; it is confidential and it helps us improve. Nandan does not give references; it gives a record of service signed by the MD &amp; CEO.</p>
<h4>Other ways employment ends</h4>
${T([["", "Rule"], ["Retirement", "At 60"], ["Job abandonment", "Three consecutive workdays without reporting or contact. No accrued benefits; not eligible for rehire"], ["Suspension", "Temporary, for misconduct, after three memos or at once for serious misconduct, always with an enquiry"], ["Dismissal for performance", "After a performance improvement plan of up to 45 days with two documented reviews. No accrued benefits"], ["Lay-off", "Not our way; we plan manpower scientifically. If ever forced, your interest is safeguarded as far as possible"], ["Rehire", "Possible for those who left in good standing, through a fresh application; previous tenure does not count. Not for anyone who left under a policy violation"]])}
<p class="check">[CHECK] v13 describes employment as "at will", a concept from US law with no standing in India; the notice terms in the appointment letter and the applicable statutes govern. Reworded here.</p>`,
  },
  {
    slug: "bereavement", ord: 16, title: "If a colleague dies in service",
    summary: "The Company stands with the family at once, and your nominee on record is who we reach for.",
    body: `
<p>When a member of the team passes away, from illness, accident or any cause, the news is shared with everyone. The MD &amp; CEO sends a commensurate sum with a company representative to the family for immediate expenses, handed only to the next of kin against an acknowledgement and treated as an advance on the final settlement. The settlement goes by cheque or NEFT to the nominee on record.</p>
<p>HR starts the PF, mediclaim and insurance claims at once; the family carries them through, with our help.</p>
<p>Please keep your nomination form current, and keep a note of your PF, insurance and investments with someone at home. It is the kindest preparation you can make.</p>`,
  },
  {
    slug: "posh", ord: 17, title: "Respect at work and POSH",
    summary: "No harassment of any kind, anywhere work takes you. A complaint goes to the Internal Complaints Committee and is investigated discreetly and fast.",
    body: `
<p>Nandan GSE provides a workplace free of discrimination and of any conduct that harasses, coerces or disrupts. Words, jokes or actions aimed at someone's sex, race, colour, origin, age, religion, disability or orientation are not tolerated. The workplace includes the shuttle, the hotel on tour, travel on company business and any venue where company business is done.</p>
<h4>Sexual harassment is</h4>
<p>Unwelcome sexual advances, requests for favours, and visual, verbal or physical conduct of a sexual nature: advances, benefits offered for favours, reprisals for refusing, leering or gestures, suggestive pictures, derogatory comments or jokes, remarks about someone's body, obscene notes or invitations, touching or blocking movement. It is harassment when it is made a condition of employment, affects an employment decision, or creates an intimidating, hostile or offensive environment.</p>
<h4>Prevention</h4>
<p>Be conscious of how your words and behaviour land. Do not assume colleagues enjoy risqué jokes, comments on appearance, touching, staring or being asked out. Discourage it in others. The law is the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013, built on the Supreme Court's Vishaka guidelines.</p>
<h4>Complaints</h4>
<p>Report an incident you experience or witness at once to the Internal Complaints Committee, in confidence and without fear of reprisal, at <b>posh.complaint@nandan.co.in</b>. Every allegation is investigated quickly and discreetly, and you are told the outcome. A supervisor who learns of possible harassment must inform the ICC immediately. Consequences range from a written apology to suspension, demotion, transfer or termination.</p>
<h4>Internal Complaints Committee, constituted 7 February 2026</h4>
${T([["Member", "Role", "Contact"], ["Radhika Suresh Anchan", "Presiding Officer", "8080273132"], ["Shailaja Prabhakar Suvarna", "Member", "7021028920"], ["Sarita Sahadev Sambre", "Member", "8169279582"], ["Prasad Ravindra Tambe", "Member", "9136010550"], ["Akshay Pandurang Pawar", "Member", "8424022543"], ["Chetna Phirke", "External member", "9820402318"]])}
<p class="check">[CHECK] v13 gives the address as posh.compliant@nandan.co.in; corrected to "complaint" here. Please confirm the mailbox exists.</p>`,
  },
  {
    slug: "weekly", ord: 18, title: "The weekly check: read this every week",
    summary: "Show up on time, report daily, plan in the ERP, own your tasks, add value every day, and believe.",
    body: `
<ul>
<li>Read your IDP in Genie every week or fortnight and course-correct.</li>
<li>Come on time. Showing up on time is half the battle.</li>
<li>Do daily reporting with every field filled. Review it weekly and write your weekly plan.</li>
<li>Plan your medium and long-term tasks on ToDo in the ERP. Do all work on the ERP so the data is captured.</li>
<li>Report back on a task without being reminded, done or not. If you need more time, ask; do not assume.</li>
<li>Communicate professionally with manager, peers, subordinates, customers and suppliers. Keep decorum and language. Keep interdepartmental camaraderie.</li>
<li>Ask yourself at the end of the day: did I add value for the nine-plus hours I was here?</li>
<li>Work on your learning goals. Use mygyaan.net and the library.</li>
<li>Align with the quarterly rocks. Read the OPSP.</li>
<li>Do no evil, and do not let others: a witness who stays silent is an accomplice.</li>
<li>Company data belongs to the company. No client or project names on any profile of yours.</li>
<li>Gossip and loose talk destroy the environment. A different view is always welcome, in the forum. Once the goals are accepted, there is no going back on them.</li>
<li>Rewards and consequences are the way of the world; the deserving grow. Growth is measured as return on the company's investment in you.</li>
<li>In a crisis there is opportunity. Do not think of the obstacles; think of the possibilities. The Company aims to take you higher than you imagined. All that is needed is your belief.</li>
<li>Decency and good manners, a greeting and a smile, go a long way toward Khushi.</li>
</ul>`,
  },
  {
    slug: "forms-laws", ord: 19, title: "Forms, and the laws we follow",
    summary: "Every form is with HR and, one by one, in Genie. The statutes below are complied with at all times.",
    body: `
<h4>Forms</h4>
<p>Acknowledgement of this handbook · Employee inward form · Leave application · Comp-off slip · Loan application · Advance application · EPFO information · Mediclaim information · Service and travel reimbursement · Leave encashment. Ask HR, or use the Genie form where one exists.</p>
<h4>The laws we comply with</h4>
<p>Employees' Provident Funds and Miscellaneous Provisions Act 1952 · Shops and Commercial Establishments Act · Employees' State Insurance Act 1948 · Labour Welfare Fund Act 1965 · Professional Tax Act 1975 · Minimum Wages Act 1948 · Child Labour (Prohibition and Regulation) Act 1986 · Payment of Wages Act 1936 · Maternity Benefit Act 1961 · Contract Labour (Regulation and Abolition) Act 1970 · Payment of Bonus Act 1965 · Industrial Establishments (National and Festival Holidays) Act 1963 · Payment of Gratuity Act 1972 · Employment Exchanges (Compulsory Notification of Vacancies) Act 1959 · Equal Remuneration Act 1976 · Apprentices Act 1961 · Industrial Employment (Standing Orders) Act 1946, Model Standing Orders · Sexual Harassment of Women at Workplace Act 2013 · Industrial Disputes Act 1947 · Employees' Compensation Act 1923 · Inter-State Migrant Workmen Act 1979 · Trade Unions Act 1926 · Building and Other Construction Workers Act.</p>`,
  },
];
