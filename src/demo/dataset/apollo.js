/**
 * Apollo-style people search results (Prospecting module).
 *
 * Shaped as the connector-proxy returns them: camelCase, no email on search (the
 * real Apollo search withholds it until enrichment), with `keywords` used only for
 * demo-side filtering so live searches during a demo return sensible matches.
 */
const person = (firstName, lastName, title, company, domain, location, seniority, keywords) => ({
    firstName,
    lastName,
    title,
    company,
    email: '',
    linkedinUrl: `https://www.linkedin.com/in/${firstName.toLowerCase()}-${lastName.toLowerCase()}`,
    location,
    source: 'apollo',
    externalId: `apollo_${firstName.toLowerCase()}_${lastName.toLowerCase()}_${domain.split('.')[0]}`,
    seniority,
    domain,
    employeeCount: '1,001-5,000',
    keywords,
});

export const APOLLO_PEOPLE = [
    person('Aravind', 'Sharma', 'Registrar', 'Bhuvana University', 'bhuvanauniv.edu.in', 'Bengaluru, Karnataka, India', 'director', ['registrar', 'admissions', 'higher education']),
    person('Shalini', 'Rao', 'Director of Admissions', 'Nithya Institute of Technology', 'nithyatech.edu.in', 'Hyderabad, Telangana, India', 'director', ['admissions', 'enrolment', 'counselling']),
    person('Manoj', 'Pillai', 'Deputy Registrar (Academics)', 'Vaigai University', 'vaigaiuniv.edu.in', 'Madurai, Tamil Nadu, India', 'manager', ['registrar', 'academics', 'examinations']),
    person('Ritu', 'Agarwal', 'Head of Admissions', 'Arunoday Global University', 'arunodayglobal.edu.in', 'Jaipur, Rajasthan, India', 'manager', ['admissions', 'marketing', 'enrolment']),
    person('Sanjay', 'Bose', 'Chief Information Officer', 'Purbanchal Education Group', 'purbanchalgroup.edu.in', 'Kolkata, West Bengal, India', 'cxo', ['cio', 'it', 'digital transformation', 'erp']),
    person('Nandita', 'Verma', 'Director — Digital Transformation', 'Satpura Institutes', 'satpurainstitutes.edu.in', 'Indore, Madhya Pradesh, India', 'director', ['digital transformation', 'it', 'consolidation']),
    person('Karthik', 'Menon', 'Head of IT — Campus Systems', 'Malabar Science Consortium', 'malabarscience.edu.in', 'Kozhikode, Kerala, India', 'director', ['it', 'campus systems', 'integration']),
    person('Prakash', 'Jadhav', 'Vice-Chancellor', 'Godavari University', 'godavariuniv.edu.in', 'Nashik, Maharashtra, India', 'cxo', ['vice chancellor', 'leadership', 'growth']),
    person('Anita', 'Chandra', 'Pro Vice-Chancellor', 'Chenab Institute of Higher Learning', 'chenabihl.edu.in', 'Jammu, India', 'cxo', ['pro vice chancellor', 'academics', 'ranking']),
    person('Vivek', 'Nair', 'IQAC Coordinator', 'Bhuvana University', 'bhuvanauniv.edu.in', 'Bengaluru, Karnataka, India', 'manager', ['iqac', 'naac', 'accreditation', 'quality']),
    person('Sneha', 'Kapoor', 'IQAC Coordinator', 'Arunoday Global University', 'arunodayglobal.edu.in', 'Jaipur, Rajasthan, India', 'manager', ['iqac', 'naac', 'accreditation']),
    person('Devendra', 'Yadav', 'Finance Controller', 'Purbanchal Education Group', 'purbanchalgroup.edu.in', 'Kolkata, West Bengal, India', 'director', ['finance', 'fees', 'collections']),
    person('Meenakshi', 'Iyer', 'Group Chief Financial Officer', 'Satpura Institutes', 'satpurainstitutes.edu.in', 'Indore, Madhya Pradesh, India', 'cxo', ['cfo', 'finance', 'fees']),
    person('Rajat', 'Khanna', 'Training & Placement Officer', 'Nithya Institute of Technology', 'nithyatech.edu.in', 'Hyderabad, Telangana, India', 'manager', ['placements', 'recruiters', 'careers']),
    person('Fatima', 'Ansari', 'Head of Placements', 'Vaigai University', 'vaigaiuniv.edu.in', 'Madurai, Tamil Nadu, India', 'manager', ['placements', 'corporate relations']),
    person('Girish', 'Kamath', 'Registrar', 'Malabar Science Consortium', 'malabarscience.edu.in', 'Kozhikode, Kerala, India', 'director', ['registrar', 'admissions', 'compliance']),
    person('Swati', 'Desai', 'Director of Admissions', 'Godavari University', 'godavariuniv.edu.in', 'Nashik, Maharashtra, India', 'director', ['admissions', 'enrolment']),
    person('Harish', 'Bhatia', 'Chief Information Officer', 'Chenab Institute of Higher Learning', 'chenabihl.edu.in', 'Jammu, India', 'cxo', ['cio', 'it', 'security']),
    person('Lalitha', 'Krishnamurthy', 'Controller of Examinations', 'Bhuvana University', 'bhuvanauniv.edu.in', 'Bengaluru, Karnataka, India', 'director', ['examinations', 'academics', 'results']),
    person('Zaid', 'Khan', 'Admissions Manager', 'Satpura Institutes', 'satpurainstitutes.edu.in', 'Indore, Madhya Pradesh, India', 'manager', ['admissions', 'counselling']),
    person('Preeti', 'Saxena', 'Head of Student Services', 'Arunoday Global University', 'arunodayglobal.edu.in', 'Jaipur, Rajasthan, India', 'manager', ['student engagement', 'support', 'communication']),
    person('Mohan', 'Rajan', 'Director (Institution)', 'Vaigai University', 'vaigaiuniv.edu.in', 'Madurai, Tamil Nadu, India', 'cxo', ['director', 'leadership', 'growth']),
];
