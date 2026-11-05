// Template catalog for the first-setup wizard (/setup) and the AI setup.
//
// 1. Recommended baseline (kind "baseline") — a practical control set built on the CIS Controls v8
//    (the prioritised, widely used technical baseline), grouped by the six NIST CSF 2.0 functions,
//    with references to CIS, ISO/IEC 27001:2022 Annex A and NIST CSF 2.0. Controls marked
//    `essential` are pre-selected: they cover the basic hygiene most audits start with
//    (comparable to CIS Implementation Group 1).
// 2. Frameworks (kind "framework") — ISO/IEC 27001:2022 Annex A, all 93 controls, added in one go.
//    Reference numbers and short titles follow the standard; the descriptions are our own
//    plain-language summaries, not the text of the standard.
//
// Control descriptions are Markdown; solution bodies are HTML (rich-text editor).

const ref = (cis, iso, csf) =>
  `\n\n**References:** ${[cis && `CIS v8 ${cis}`, iso && `ISO 27001 ${iso}`, csf && `NIST CSF 2.0 ${csf}`].filter(Boolean).join(" · ")}`;

const c = (code, name, text, evidence, refs, essential = false) => ({
  code,
  name,
  description: `${text}\n\n**Evidence:** ${evidence}${refs}`,
  essential,
});

// ---------------------------------------------------------------------------------------------
// 1. Recommended baseline
// ---------------------------------------------------------------------------------------------

const BASELINE = [
  {
    id: "govern",
    name: "Govern",
    description: "Policy, roles, risk, suppliers and compliance (NIST CSF: Govern).",
    controls: [
      c("GV-01", "Information security policy and leadership",
        "Management approves an information security policy, sets objectives and provides resources. Topic-specific policies (access, acceptable use, backup, incident response) exist, are communicated to staff and reviewed at least yearly or after major changes.",
        "approved policy set with version history, management review minutes, communication to staff.",
        ref("", "A.5.1, A.5.4", "GV.PO, GV.RR"), true),
      c("GV-02", "Roles, responsibilities and segregation of duties",
        "Security responsibilities are assigned and documented: a security officer or CISO, owners for systems and information, and a clear escalation line. Conflicting duties (e.g. requesting and approving access, developing and deploying) are separated or compensated with review.",
        "RACI or responsibility matrix, owner register, appointment of the security officer.",
        ref("", "A.5.2, A.5.3", "GV.RR")),
      c("GV-03", "Risk management",
        "Information security risks are identified, analysed and treated with a documented method, at least yearly and after significant changes. Each risk has an owner, a treatment decision and a due date; residual risk is formally accepted by management.",
        "risk method, risk register with owners, treatment plan, risk acceptance sign-off.",
        ref("", "clauses 6.1, 8.2, 8.3", "GV.RM, ID.RA"), true),
      c("GV-04", "Supplier and cloud service security",
        "Suppliers and cloud services are classified by criticality and data access. Critical suppliers are assessed before contracting and periodically after; contracts include security requirements, incident notification, audit rights and exit arrangements.",
        "supplier register with classification, completed assessments or certificates (ISO 27001, SOC 2), contract clauses.",
        ref("15", "A.5.19–A.5.23", "GV.SC")),
      c("GV-05", "Legal, regulatory and contractual requirements",
        "Applicable laws, regulations and contractual obligations (e.g. GDPR, NIS2, sector rules, customer contracts) are identified, assigned to an owner and translated into controls. The overview is reviewed when legislation or the business changes.",
        "register of legal and contractual requirements with owners, mapping to controls.",
        ref("", "A.5.31, A.5.32", "GV.OC")),
      c("GV-06", "Independent review and compliance monitoring",
        "Compliance with policies and the effectiveness of controls are checked through internal audits and periodic independent reviews. Findings are tracked to closure and reported to management.",
        "internal audit plan and reports, management review, follow-up of findings.",
        ref("", "A.5.35, A.5.36", "GV.OV, ID.IM")),
      c("GV-07", "Privacy and register of processing activities",
        "A register of processing activities is kept with purpose, legal basis, data categories, recipients and retention. Data protection impact assessments are done for high-risk processing, and processors have data processing agreements.",
        "processing register, DPIAs, data processing agreements.",
        ref("3", "A.5.34", "GV.OC, ID.AM")),
    ],
  },
  {
    id: "identify",
    name: "Identify",
    description: "Assets, data, vulnerabilities and security testing (NIST CSF: Identify).",
    controls: [
      c("ID-01", "Hardware asset inventory",
        "All end-user devices, servers, network devices, cloud resources and IoT/OT devices are in an inventory with an owner and location, kept current through automated discovery. Unauthorised devices are detected and removed or quarantined.",
        "inventory export, discovery tooling, process for unknown devices.",
        ref("1", "A.5.9, A.5.11", "ID.AM"), true),
      c("ID-02", "Software inventory and application control",
        "Installed software and SaaS applications are inventoried with a business owner and version. Unsupported software is removed or isolated, and only authorised software can be installed or run on endpoints and servers.",
        "software inventory, list of unsupported software with actions, application control policy.",
        ref("2", "A.5.9, A.8.19", "ID.AM"), true),
      c("ID-03", "Data inventory, classification and retention",
        "Sensitive data is identified and classified, with handling rules per class. Retention periods are defined per data category, and data is securely deleted or anonymised when the period ends.",
        "data inventory, classification scheme, retention schedule, deletion logs.",
        ref("3", "A.5.12, A.5.13, A.8.10", "ID.AM, PR.DS")),
      c("ID-04", "Vulnerability management",
        "All systems are scanned for vulnerabilities at least monthly (internet-facing systems more often, authenticated where possible). Findings are prioritised on severity and known exploitation, and fixed within agreed timelines.",
        "scan configuration and coverage, recent scan reports, remediation tracking against timelines.",
        ref("7", "A.8.8", "ID.RA"), true),
      c("ID-05", "Penetration testing and security assessments",
        "Internet-facing systems and critical applications are penetration-tested at least yearly and after major changes, by qualified testers. Findings are tracked to closure and retested.",
        "test scope and reports, remediation and retest results.",
        ref("18", "A.8.8, A.8.29", "ID.RA, ID.IM")),
    ],
  },
  {
    id: "protect",
    name: "Protect",
    description: "Access, configuration, data, network, people and development (NIST CSF: Protect).",
    controls: [
      c("PR-01", "Account lifecycle and access reviews",
        "Accounts are created on approved request, based on role and least privilege, and disabled on the leaving date. Access rights are reviewed at least twice a year by system owners; dormant accounts are disabled after 45 days.",
        "joiner/mover/leaver procedure, sample of requests and leavers, signed-off access reviews.",
        ref("5, 6", "A.5.15–A.5.18", "PR.AA"), true),
      c("PR-02", "Multi-factor authentication",
        "MFA is enforced for all remote access, e-mail and cloud services, and for every administrative account. Phishing-resistant methods (FIDO2 security keys, passkeys) are used for administrators; SMS is avoided. Legacy authentication protocols are blocked.",
        "identity provider / conditional access policies, MFA coverage report, list of exclusions with justification.",
        ref("6", "A.8.5", "PR.AA"), true),
      c("PR-03", "Privileged access management",
        "Administrative accounts are personal, separate from day-to-day accounts and kept to a minimum. Privileges are granted just-in-time where possible, used from secured devices and logged. Break-glass accounts are documented and monitored.",
        "list of privileged accounts, PAM or vault configuration, log samples of privileged use.",
        ref("5, 6", "A.8.2, A.8.18", "PR.AA"), true),
      c("PR-04", "Password and secrets management",
        "Passwords follow current guidance (length over complexity, checked against breached passwords, no forced periodic change). Shared, service-account and API secrets are kept in a vault, not in scripts or documents, and rotated when people leave or exposure is suspected.",
        "password policy, vault inventory, scan for secrets in code repositories.",
        ref("5", "A.5.17", "PR.AA")),
      c("PR-05", "Secure configuration and hardening",
        "Systems are built from documented hardening baselines based on public benchmarks (e.g. CIS Benchmarks). Default accounts and passwords are changed, unnecessary services removed, and configuration drift is detected and corrected.",
        "baseline documents, configuration compliance scan results, exceptions with end dates.",
        ref("4", "A.8.9", "PR.PS"), true),
      c("PR-06", "Patch management",
        "Security updates are applied within defined timelines: actively exploited or critical vulnerabilities within 14 days (internet-facing systems faster), others within 30 days. This covers operating systems, applications, firmware and network devices.",
        "patch policy with timelines, patch compliance report per asset group, exceptions.",
        ref("7", "A.8.8", "PR.PS"), true),
      c("PR-07", "Encryption of data at rest and in transit",
        "Laptops, mobile devices and removable media are fully encrypted. Sensitive data is encrypted in transit (TLS 1.2 or higher) and at rest in databases and cloud storage. Keys are managed centrally with restricted access.",
        "disk encryption coverage report, TLS configuration scan, key management procedure.",
        ref("3", "A.8.24", "PR.DS")),
      c("PR-08", "Malware protection and EDR",
        "All endpoints and servers run centrally managed anti-malware or EDR with automatic updates and tamper protection. Alerts are monitored and followed up within agreed response times.",
        "EDR console coverage versus asset inventory, alert handling records.",
        ref("10", "A.8.7", "PR.PS, DE.CM"), true),
      c("PR-09", "E-mail and web protection",
        "Incoming e-mail is filtered for phishing and malicious attachments; SPF, DKIM and DMARC (policy quarantine or reject) are configured. Web traffic is filtered for malicious and unwanted categories, and only supported browsers are used.",
        "mail filter configuration, DMARC report, DNS records, web filter policy.",
        ref("9", "A.8.23", "PR.PS")),
      c("PR-10", "Network security and segmentation",
        "The network is split into zones (e.g. servers, workstations, management, guests, OT) with default-deny rules between them. Firewall rules have an owner and a business reason and are reviewed at least yearly; management interfaces are not reachable from user networks.",
        "network diagram, firewall rule review, segmentation test results.",
        ref("12, 13", "A.8.20–A.8.22", "PR.IR")),
      c("PR-11", "Backup",
        "Critical data and systems are backed up on a defined schedule in line with recovery objectives. At least one copy is offline or immutable and stored separately, backups are encrypted, and backup jobs are monitored daily.",
        "backup policy and schedule, job reports, proof of immutable/offline copy.",
        ref("11", "A.8.13", "PR.DS"), true),
      c("PR-12", "Security awareness and training",
        "All staff receive security awareness training at onboarding and at least yearly, including phishing simulations. Roles with higher risk (admins, finance, management, developers) get targeted training.",
        "training plan, completion records, phishing simulation results.",
        ref("14", "A.6.3", "PR.AT"), true),
      c("PR-13", "Personnel security",
        "Background checks proportional to the role are done before hiring. Employment terms and non-disclosure agreements cover security responsibilities, and responsibilities that continue after leaving are communicated.",
        "screening procedure, signed contracts and NDAs, offboarding checklist.",
        ref("", "A.6.1, A.6.2, A.6.5, A.6.6", "GV.RR")),
      c("PR-14", "Secure development",
        "Software is developed following a secure development lifecycle: security requirements, secure coding guidelines, code review, and automated security testing (dependency scanning, SAST) in the pipeline before release.",
        "SDLC description, pipeline configuration, review and test results.",
        ref("16", "A.8.25–A.8.29", "PR.PS")),
      c("PR-15", "Change management and separation of environments",
        "Changes to production are registered, risk-assessed, tested, approved and can be rolled back. Development, test and production are separated, and production data is not used in test without masking.",
        "change records, approval evidence, environment overview, data masking procedure.",
        ref("4, 16", "A.8.31, A.8.32, A.8.33", "PR.PS")),
      c("PR-16", "Physical and environmental security",
        "Access to buildings and technical rooms is restricted to authorised people with personal badges, and reviewed periodically. Equipment is protected against theft, fire, water and power failure; a clear desk and clear screen rule applies.",
        "access system export and review, visitor log, environmental monitoring, walk-through results.",
        ref("", "A.7.1–A.7.14", "PR.AA, PR.IR")),
      c("PR-17", "Endpoint, mobile and remote working security",
        "Laptops and mobile devices are centrally managed (MDM), encrypted, locked automatically and can be wiped remotely. Remote work uses secured connections, and personal devices only access company data through managed apps.",
        "MDM compliance report, remote working policy, conditional access rules for devices.",
        ref("4", "A.6.7, A.8.1", "PR.PS")),
    ],
  },
  {
    id: "detect",
    name: "Detect",
    description: "Logging and security monitoring (NIST CSF: Detect).",
    controls: [
      c("DE-01", "Central logging and log retention",
        "Security-relevant logs (identity provider, firewalls, VPN, servers, EDR, critical applications, cloud audit logs) are collected centrally, protected against tampering and kept at least 12 months. System clocks are synchronised.",
        "log source list versus asset inventory, retention setting, time synchronisation configuration.",
        ref("8", "A.8.15, A.8.17", "DE.CM, PR.PS"), true),
      c("DE-02", "Security monitoring and alerting",
        "Logs and network traffic are monitored for suspicious activity with defined use cases (e.g. impossible travel, new admin accounts, disabled security tooling, mass file changes). Alerts are triaged within agreed times, also outside office hours for critical alerts.",
        "use case list, SIEM/SOC reports, alert handling times.",
        ref("8, 13", "A.8.16", "DE.CM, DE.AE")),
    ],
  },
  {
    id: "respond",
    name: "Respond",
    description: "Incident response and notification (NIST CSF: Respond).",
    controls: [
      c("RS-01", "Incident response plan and exercises",
        "A documented incident response process defines roles, severity levels, escalation, communication and evidence handling, with playbooks for likely scenarios (ransomware, account takeover, data leak). Staff know how to report incidents; the plan is exercised at least yearly.",
        "incident response plan and playbooks, exercise report, incident register with evaluations.",
        ref("17", "A.5.24–A.5.28, A.6.8", "RS.MA, RS.AN"), true),
      c("RS-02", "Incident and data breach notification",
        "Reporting duties are known and timely: personal data breaches to the data protection authority within 72 hours (GDPR), significant incidents to the competent authority or CSIRT with an early warning within 24 hours (NIS2), and to customers where contracts require it.",
        "breach and incident register, notification procedure, records of past notifications.",
        ref("17", "A.5.24, A.5.26", "RS.CO")),
    ],
  },
  {
    id: "recover",
    name: "Recover",
    description: "Restore, disaster recovery and continuity (NIST CSF: Recover).",
    controls: [
      c("RC-01", "Restore and disaster recovery testing",
        "Restores are tested at least quarterly for samples and yearly for full critical systems, measured against the agreed recovery time and recovery point objectives (RTO/RPO). Lessons learned are followed up.",
        "restore test reports with measured RTO/RPO, DR test plan and results.",
        ref("11", "A.5.30, A.8.13, A.8.14", "RC.RP"), true),
      c("RC-02", "Business continuity planning",
        "Critical processes are identified in a business impact analysis, with agreed recovery objectives. Continuity plans describe how to keep operating during a disruption, including IT failure and loss of key suppliers, and are tested periodically.",
        "business impact analysis, continuity plans, test or exercise reports.",
        ref("", "A.5.29, A.5.30", "RC.RP, GV.OC")),
    ],
  },
];

// ---------------------------------------------------------------------------------------------
// 2. ISO/IEC 27001:2022 Annex A — 93 controls in four themes.
// ---------------------------------------------------------------------------------------------

const ISO = "ISO/IEC 27001:2022 Annex A";
const iso = (code, name, text) => ({
  code: `A.${code}`,
  name,
  description: `${text}\n\n*${ISO}, control ${code}. Short summary; see the standard for the normative text.*`,
});

const ISO_THEMES = [
  {
    id: "iso-organizational",
    name: "A.5 Organizational controls",
    controls: [
      iso("5.1", "Policies for information security", "An information security policy and topic-specific policies are approved by management, published, communicated to staff and relevant parties, and reviewed at planned intervals."),
      iso("5.2", "Information security roles and responsibilities", "Security roles and responsibilities are defined and assigned according to the organisation's needs."),
      iso("5.3", "Segregation of duties", "Conflicting duties and areas of responsibility are separated to reduce the risk of misuse or error."),
      iso("5.4", "Management responsibilities", "Management requires all staff to apply information security in line with the policies and procedures."),
      iso("5.5", "Contact with authorities", "Contacts with relevant authorities (e.g. regulators, police, CSIRT) are established and maintained."),
      iso("5.6", "Contact with special interest groups", "Contacts are maintained with security forums, professional associations and other specialist groups."),
      iso("5.7", "Threat intelligence", "Information about threats is collected and analysed to produce usable threat intelligence."),
      iso("5.8", "Information security in project management", "Information security is integrated into project management, regardless of the type of project."),
      iso("5.9", "Inventory of information and other associated assets", "An inventory of information and associated assets, including owners, is developed and maintained."),
      iso("5.10", "Acceptable use of information and other associated assets", "Rules for acceptable use and handling of information and assets are identified, documented and implemented."),
      iso("5.11", "Return of assets", "Staff and other parties return all organisational assets when their employment, contract or agreement ends."),
      iso("5.12", "Classification of information", "Information is classified according to confidentiality, integrity, availability and stakeholder requirements."),
      iso("5.13", "Labelling of information", "Procedures for labelling information follow the classification scheme."),
      iso("5.14", "Information transfer", "Rules, procedures or agreements protect information transferred within the organisation and with other parties, for all types of transfer."),
      iso("5.15", "Access control", "Rules to control physical and logical access are established and implemented based on business and security requirements."),
      iso("5.16", "Identity management", "The full lifecycle of identities is managed."),
      iso("5.17", "Authentication information", "Allocation and management of authentication information (passwords, keys, tokens) is controlled, including advice to staff on handling it."),
      iso("5.18", "Access rights", "Access rights are provisioned, reviewed, modified and removed in line with the access control policy."),
      iso("5.19", "Information security in supplier relationships", "Processes manage the security risks of using suppliers' products and services."),
      iso("5.20", "Addressing information security within supplier agreements", "Relevant security requirements are agreed with each supplier based on the type of relationship."),
      iso("5.21", "Managing information security in the ICT supply chain", "Processes manage security risks in the supply chain of ICT products and services."),
      iso("5.22", "Monitoring, review and change management of supplier services", "Supplier security practices and service delivery are monitored, reviewed, evaluated and changes are managed."),
      iso("5.23", "Information security for use of cloud services", "Acquisition, use, management and exit of cloud services follow the organisation's security requirements."),
      iso("5.24", "Information security incident management planning and preparation", "Incident management processes, roles and responsibilities are defined, established and communicated."),
      iso("5.25", "Assessment and decision on information security events", "Security events are assessed to decide whether they are categorised as incidents."),
      iso("5.26", "Response to information security incidents", "Incidents are responded to according to documented procedures."),
      iso("5.27", "Learning from information security incidents", "Knowledge from incidents is used to strengthen and improve controls."),
      iso("5.28", "Collection of evidence", "Procedures exist to identify, collect, acquire and preserve evidence related to security events."),
      iso("5.29", "Information security during disruption", "Information security is maintained at an appropriate level during disruption."),
      iso("5.30", "ICT readiness for business continuity", "ICT readiness is planned, implemented, maintained and tested based on continuity objectives."),
      iso("5.31", "Legal, statutory, regulatory and contractual requirements", "Applicable legal, statutory, regulatory and contractual requirements and the approach to meet them are identified, documented and kept up to date."),
      iso("5.32", "Intellectual property rights", "Procedures protect intellectual property rights, including the licensed use of software."),
      iso("5.33", "Protection of records", "Records are protected from loss, destruction, falsification, unauthorised access and release."),
      iso("5.34", "Privacy and protection of PII", "Requirements for privacy and protection of personal data are identified and met according to laws, regulations and contracts."),
      iso("5.35", "Independent review of information security", "The approach to information security and its implementation is reviewed independently at planned intervals or after significant changes."),
      iso("5.36", "Compliance with policies, rules and standards for information security", "Compliance with the security policy, topic-specific policies, rules and standards is regularly reviewed."),
      iso("5.37", "Documented operating procedures", "Operating procedures for information processing facilities are documented and available to the people who need them."),
    ],
  },
  {
    id: "iso-people",
    name: "A.6 People controls",
    controls: [
      iso("6.1", "Screening", "Background checks on candidates are carried out before joining and repeated where needed, proportional to the role, the risks and applicable law."),
      iso("6.2", "Terms and conditions of employment", "Employment contracts state the staff member's and the organisation's responsibilities for information security."),
      iso("6.3", "Information security awareness, education and training", "Staff and relevant parties receive appropriate awareness, education and training, and regular updates on policies and procedures."),
      iso("6.4", "Disciplinary process", "A formal, communicated disciplinary process exists for policy violations."),
      iso("6.5", "Responsibilities after termination or change of employment", "Security responsibilities that remain valid after leaving or changing role are defined, enforced and communicated."),
      iso("6.6", "Confidentiality or non-disclosure agreements", "Confidentiality agreements reflecting the organisation's needs are identified, documented, reviewed and signed by staff and relevant parties."),
      iso("6.7", "Remote working", "Security measures protect information accessed, processed or stored when working remotely."),
      iso("6.8", "Information security event reporting", "Staff can report observed or suspected security events quickly through appropriate channels."),
    ],
  },
  {
    id: "iso-physical",
    name: "A.7 Physical controls",
    controls: [
      iso("7.1", "Physical security perimeters", "Security perimeters are defined and used to protect areas containing information and associated assets."),
      iso("7.2", "Physical entry", "Secure areas are protected by appropriate entry controls and access points."),
      iso("7.3", "Securing offices, rooms and facilities", "Physical security for offices, rooms and facilities is designed and implemented."),
      iso("7.4", "Physical security monitoring", "Premises are continuously monitored for unauthorised physical access."),
      iso("7.5", "Protecting against physical and environmental threats", "Protection against natural disasters, intentional attacks and other physical threats to infrastructure is designed and implemented."),
      iso("7.6", "Working in secure areas", "Security measures for working in secure areas are designed and implemented."),
      iso("7.7", "Clear desk and clear screen", "Clear desk rules for papers and removable media and clear screen rules for facilities are defined and enforced."),
      iso("7.8", "Equipment siting and protection", "Equipment is sited securely and protected."),
      iso("7.9", "Security of assets off-premises", "Assets used outside the organisation's premises are protected."),
      iso("7.10", "Storage media", "Storage media are managed through their lifecycle of acquisition, use, transport and disposal according to the classification scheme."),
      iso("7.11", "Supporting utilities", "Information processing facilities are protected from power failures and other disruptions caused by failing utilities."),
      iso("7.12", "Cabling security", "Power, data and supporting cables are protected from interception, interference or damage."),
      iso("7.13", "Equipment maintenance", "Equipment is maintained correctly to ensure availability, integrity and confidentiality of information."),
      iso("7.14", "Secure disposal or re-use of equipment", "Storage media in equipment are checked, and sensitive data and licensed software are removed or securely overwritten before disposal or re-use."),
    ],
  },
  {
    id: "iso-technological",
    name: "A.8 Technological controls",
    controls: [
      iso("8.1", "User end point devices", "Information stored on, processed by or accessible via user endpoint devices is protected."),
      iso("8.2", "Privileged access rights", "Allocation and use of privileged access rights is restricted and managed."),
      iso("8.3", "Information access restriction", "Access to information and assets is restricted according to the access control policy."),
      iso("8.4", "Access to source code", "Read and write access to source code, development tools and software libraries is managed appropriately."),
      iso("8.5", "Secure authentication", "Secure authentication technologies and procedures are implemented based on access restrictions and the access control policy."),
      iso("8.6", "Capacity management", "Use of resources is monitored and adjusted in line with current and expected capacity requirements."),
      iso("8.7", "Protection against malware", "Protection against malware is implemented and supported by user awareness."),
      iso("8.8", "Management of technical vulnerabilities", "Information about technical vulnerabilities is obtained, exposure is evaluated and appropriate measures are taken."),
      iso("8.9", "Configuration management", "Configurations, including security configurations, of hardware, software, services and networks are established, documented, implemented, monitored and reviewed."),
      iso("8.10", "Information deletion", "Information stored in systems, devices or other media is deleted when no longer required."),
      iso("8.11", "Data masking", "Data masking is used in line with the access control policy, business requirements and applicable law."),
      iso("8.12", "Data leakage prevention", "Data leakage prevention measures are applied to systems, networks and devices that process, store or transmit sensitive information."),
      iso("8.13", "Information backup", "Backup copies of information, software and systems are maintained and regularly tested according to the backup policy."),
      iso("8.14", "Redundancy of information processing facilities", "Information processing facilities have sufficient redundancy to meet availability requirements."),
      iso("8.15", "Logging", "Logs recording activities, exceptions, faults and other relevant events are produced, stored, protected and analysed."),
      iso("8.16", "Monitoring activities", "Networks, systems and applications are monitored for anomalous behaviour, and appropriate action is taken to evaluate potential incidents."),
      iso("8.17", "Clock synchronization", "Clocks of information processing systems are synchronised to approved time sources."),
      iso("8.18", "Use of privileged utility programs", "Use of utility programs that can override system and application controls is restricted and tightly controlled."),
      iso("8.19", "Installation of software on operational systems", "Procedures and measures securely manage software installation on operational systems."),
      iso("8.20", "Networks security", "Networks and network devices are secured, managed and controlled to protect information in systems and applications."),
      iso("8.21", "Security of network services", "Security mechanisms, service levels and service requirements of network services are identified, implemented and monitored."),
      iso("8.22", "Segregation of networks", "Groups of information services, users and information systems are segregated in the organisation's networks."),
      iso("8.23", "Web filtering", "Access to external websites is managed to reduce exposure to malicious content."),
      iso("8.24", "Use of cryptography", "Rules for the effective use of cryptography, including key management, are defined and implemented."),
      iso("8.25", "Secure development life cycle", "Rules for the secure development of software and systems are established and applied."),
      iso("8.26", "Application security requirements", "Security requirements are identified, specified and approved when developing or acquiring applications."),
      iso("8.27", "Secure system architecture and engineering principles", "Principles for engineering secure systems are established, documented, maintained and applied to development activities."),
      iso("8.28", "Secure coding", "Secure coding principles are applied to software development."),
      iso("8.29", "Security testing in development and acceptance", "Security testing processes are defined and implemented in the development lifecycle."),
      iso("8.30", "Outsourced development", "Outsourced system development is directed, monitored and reviewed."),
      iso("8.31", "Separation of development, test and production environments", "Development, test and production environments are separated and secured."),
      iso("8.32", "Change management", "Changes to information processing facilities and systems follow change management procedures."),
      iso("8.33", "Test information", "Test information is appropriately selected, protected and managed."),
      iso("8.34", "Protection of information systems during audit testing", "Audit tests and other assurance activities on operational systems are planned and agreed between the tester and management."),
    ],
  },
];

export const FRAMEWORKS = [
  {
    id: "iso27001-2022",
    name: "ISO/IEC 27001:2022 — Annex A",
    description:
      "All 93 Annex A controls in four themes (organizational, people, physical, technological). Use this when you audit against ISO 27001 or prepare for certification.",
  },
];

/** All control sets: the recommended baseline first, then the frameworks. */
export const CONTROL_SETS = [
  ...BASELINE.map((s) => ({ ...s, kind: "baseline" })),
  ...ISO_THEMES.map((s) => ({ ...s, kind: "framework", framework: "iso27001-2022", description: "" })),
];

export const BASELINE_SETS = CONTROL_SETS.filter((s) => s.kind === "baseline");

/** Controls of a framework, in order. */
export function frameworkControls(frameworkId) {
  return CONTROL_SETS.filter((s) => s.framework === frameworkId).flatMap((s) => s.controls);
}

// ---------------------------------------------------------------------------------------------
// Solutions — reusable remediation guidance, linked to baseline and ISO controls.
// ---------------------------------------------------------------------------------------------

export const SOLUTION_TEMPLATES = [
  {
    code: "SOL-ACCESS-REVIEW",
    title: "Half-yearly access review",
    tags: ["access", "procedure"],
    controls: ["PR-01", "PR-03", "A.5.18", "A.8.2"],
    body: `<p>Run a structured access review twice a year for every critical application.</p>
<ol>
<li>Export users and roles per application (include service and admin accounts).</li>
<li>Send each list to the system owner with a deadline of two weeks.</li>
<li>Owners mark every account as <strong>keep</strong>, <strong>change</strong> or <strong>remove</strong>.</li>
<li>IT processes the changes and records the ticket numbers.</li>
<li>Archive the signed-off lists as audit evidence.</li>
</ol>
<p><em>Tip:</em> compare the export with the HR leavers list before sending it out; that catches most stale accounts.</p>`,
  },
  {
    code: "SOL-MFA",
    title: "Enforcing MFA with conditional access",
    tags: ["access", "cloud"],
    controls: ["PR-02", "A.8.5"],
    body: `<p>Roll out multi-factor authentication in phases to limit disruption.</p>
<ul>
<li><strong>Phase 1:</strong> administrators (phishing-resistant: FIDO2 keys or passkeys) and remote access (VPN, remote desktop).</li>
<li><strong>Phase 2:</strong> all users for e-mail and cloud applications.</li>
<li><strong>Phase 3:</strong> block legacy authentication protocols.</li>
</ul>
<p>Use an authenticator app with number matching, FIDO2 keys or passkeys; avoid SMS. Keep two break-glass accounts excluded, with long passwords stored offline and sign-in alerts enabled.</p>`,
  },
  {
    code: "SOL-PATCH",
    title: "Monthly patch cycle with fast lane",
    tags: ["operations", "procedure"],
    controls: ["PR-06", "ID-04", "A.8.8"],
    body: `<p>A predictable patch rhythm with a fast lane for critical vulnerabilities.</p>
<ol>
<li>Week 1: updates released to a pilot group (IT staff and test servers).</li>
<li>Week 2: rollout to all workstations; servers in the agreed maintenance window.</li>
<li>Week 3: compliance report; follow up on devices that did not update.</li>
</ol>
<p><strong>Fast lane:</strong> vulnerabilities that are actively exploited (for example on the CISA Known Exploited Vulnerabilities list) are patched or mitigated within 72 hours on internet-facing systems after a short risk assessment.</p>`,
  },
  {
    code: "SOL-BACKUP",
    title: "3-2-1 backup with quarterly restore test",
    tags: ["operations", "continuity"],
    controls: ["PR-11", "RC-01", "A.8.13"],
    body: `<p>Keep <strong>3</strong> copies of data, on <strong>2</strong> different media, with <strong>1</strong> copy offline or immutable.</p>
<ul>
<li>Monitor backup jobs daily and follow up failures the same day.</li>
<li>Protect backup systems with separate credentials and MFA, so an attacker with domain admin cannot delete them.</li>
<li>Each quarter, restore a random file set and one full system to an isolated environment.</li>
<li>Record the restore time and compare it with the agreed RTO.</li>
</ul>`,
  },
  {
    code: "SOL-LOGGING",
    title: "Central log collection and alerting",
    tags: ["operations", "monitoring"],
    controls: ["DE-01", "DE-02", "A.8.15", "A.8.16"],
    body: `<p>Forward security logs to a central platform (SIEM or log service).</p>
<p>Minimum sources: identity provider, firewalls, VPN, servers, EDR, cloud audit logs and critical applications. Keep logs at least 12 months and protect them against deletion.</p>
<p>Start with a small set of high-value alerts: impossible travel, new admin account, MFA disabled, mass file changes, disabled security tooling.</p>`,
  },
  {
    code: "SOL-AWARENESS",
    title: "Security awareness programme",
    tags: ["people", "training"],
    controls: ["PR-12", "A.6.3"],
    body: `<p>A yearly programme instead of a one-off training.</p>
<ul>
<li>Short e-learning at onboarding and once a year for everyone.</li>
<li>Quarterly phishing simulation with immediate feedback, and an easy "report phishing" button.</li>
<li>Targeted sessions for high-risk roles (finance, admins, management, developers).</li>
</ul>
<p>Report participation, click rates and report rates to management every quarter.</p>`,
  },
  {
    code: "SOL-IR-PLAYBOOK",
    title: "Incident response playbook",
    tags: ["incident", "procedure"],
    controls: ["RS-01", "RS-02", "A.5.24", "A.5.26"],
    body: `<p>A short playbook that people actually use during an incident.</p>
<ol>
<li><strong>Detect &amp; report:</strong> one phone number and mailbox for reporting.</li>
<li><strong>Assess:</strong> severity matrix and who decides on escalation.</li>
<li><strong>Contain &amp; recover:</strong> per-scenario steps (ransomware, account takeover, data leak).</li>
<li><strong>Notify:</strong> check reporting duties (data protection authority within 72 hours, NIS2 early warning within 24 hours, customers by contract).</li>
<li><strong>Learn:</strong> evaluation within two weeks with actions.</li>
</ol>
<p>Exercise the playbook once a year with a tabletop scenario.</p>`,
  },
  {
    code: "SOL-SUPPLIER",
    title: "Supplier security assessment",
    tags: ["suppliers", "governance"],
    controls: ["GV-04", "A.5.19", "A.5.20"],
    body: `<p>Classify suppliers by criticality and data access, then assess proportionally.</p>
<ul>
<li><strong>High:</strong> questionnaire plus certificate (ISO 27001 / SOC 2 type II) and yearly review.</li>
<li><strong>Medium:</strong> questionnaire every two years.</li>
<li><strong>Low:</strong> contract clauses only.</li>
</ul>
<p>Make sure contracts include incident notification, right to audit and data return at the end of the contract.</p>`,
  },
  {
    code: "SOL-SEGMENTATION",
    title: "Network segmentation in zones",
    tags: ["network", "operations"],
    controls: ["PR-10", "A.8.22"],
    body: `<p>Split the network into zones with a default-deny policy between them.</p>
<p>Typical zones: management, servers, workstations, guests, OT / building systems, and a DMZ for internet-facing services.</p>
<p>Review firewall rules at least yearly; every rule needs an owner and a business reason.</p>`,
  },
  {
    code: "SOL-HARDENING",
    title: "Hardening baseline per platform",
    tags: ["operations", "configuration"],
    controls: ["PR-05", "A.8.9"],
    body: `<p>Define a hardening baseline per platform (Windows, Linux, network devices, cloud tenants) based on a public benchmark such as the CIS Benchmarks.</p>
<p>Apply it through central configuration management and measure compliance monthly. Deviations are documented with a reason and an end date.</p>`,
  },
  {
    code: "SOL-RETENTION",
    title: "Retention schedule and deletion routine",
    tags: ["privacy"],
    controls: ["ID-03", "GV-07", "A.8.10", "A.5.34"],
    body: `<p>Link every processing activity in the register to a retention period.</p>
<ul>
<li>Agree periods with legal and the data owners.</li>
<li>Automate deletion where the application supports it.</li>
<li>Run a yearly manual sweep for file shares and mailboxes.</li>
</ul>`,
  },
  {
    code: "SOL-CHANGE",
    title: "Lightweight change process",
    tags: ["development", "procedure"],
    controls: ["PR-15", "A.8.32", "A.8.31"],
    body: `<p>Three change types keep the process light:</p>
<ul>
<li><strong>Standard:</strong> pre-approved, low risk, documented once.</li>
<li><strong>Normal:</strong> risk assessment and approval by the system owner.</li>
<li><strong>Emergency:</strong> approved afterwards within one working day.</li>
</ul>
<p>Every normal change has a test result and a rollback plan attached.</p>`,
  },
  {
    code: "SOL-EMAIL-AUTH",
    title: "SPF, DKIM and DMARC step by step",
    tags: ["email", "operations"],
    controls: ["PR-09", "A.8.23"],
    body: `<ol>
<li>Inventory every service that sends mail on behalf of your domains (mail platform, CRM, ticketing, newsletters).</li>
<li>Publish an SPF record that lists them and ends in <code>-all</code> or <code>~all</code>.</li>
<li>Enable DKIM signing on every sending service.</li>
<li>Start DMARC with <code>p=none</code> and aggregate reports; fix sources that fail.</li>
<li>Move to <code>p=quarantine</code> and then <code>p=reject</code>. Protect parked domains with <code>v=spf1 -all</code> and <code>p=reject</code>.</li>
</ol>`,
  },
];

/** All template controls keyed by code (baseline and frameworks). */
export function templateControlsByCode() {
  const map = new Map();
  for (const set of CONTROL_SETS) for (const ctl of set.controls) map.set(ctl.code, ctl);
  return map;
}
