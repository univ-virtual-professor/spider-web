export const PERMISSIONS = {
  STUDENTS_VIEW: "students.view",
  STUDENTS_MANAGE: "students.manage",
  TESTS_VIEW: "tests.view",
  TESTS_CREATE: "tests.create",
  TESTS_PUBLISH: "tests.publish",
  DPPS_VIEW: "dpps.view",
  DPPS_MANAGE: "dpps.manage",
  CONTENT_VIEW: "content.view",
  CONTENT_MANAGE: "content.manage",
  QB_VIEW: "question_bank.view",
  QB_MANAGE: "question_bank.manage",
  ANALYTICS_VIEW: "analytics.view",
  CODES_VIEW: "access_codes.view",
  CODES_MANAGE: "access_codes.manage",
  MESSAGES_VIEW: "messages.view",
  MESSAGES_SEND: "messages.send",
  WEBSITE_MANAGE: "website.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LABELS: Record<Permission, { label: string; description: string }> = {
  "students.view": {
    label: "View Students",
    description: "Read-only access to student list and profiles",
  },
  "students.manage": {
    label: "Manage Students",
    description: "Enroll, remove, and edit student information",
  },
  "tests.view": { label: "View Tests", description: "See scheduled test list" },
  "tests.create": { label: "Create / Edit Tests", description: "Create tests and edit questions" },
  "tests.publish": { label: "Publish Tests", description: "Publish and unpublish tests" },
  "dpps.view": { label: "View DPPs", description: "See scheduled DPPs" },
  "dpps.manage": { label: "Manage DPPs", description: "Create, schedule, and cancel DPPs" },
  "content.view": { label: "View Content", description: "Browse content library" },
  "content.manage": { label: "Manage Content", description: "Upload, edit, and delete content" },
  "question_bank.view": { label: "View Question Bank", description: "Browse the question bank" },
  "question_bank.manage": {
    label: "Manage Question Bank",
    description: "Create, edit, and delete questions",
  },
  "analytics.view": { label: "View Analytics", description: "See analytics dashboards" },
  "access_codes.view": { label: "View Access Codes", description: "See access code list" },
  "access_codes.manage": {
    label: "Manage Access Codes",
    description: "Create, revoke, and distribute codes",
  },
  "messages.view": { label: "View Messages", description: "See message threads" },
  "messages.send": { label: "Send Messages", description: "Send messages to students" },
  "website.manage": {
    label: "Manage Website",
    description: "Customize and configure the landing page and theme",
  },
};

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: "Students", permissions: ["students.view", "students.manage"] },
  { label: "Tests", permissions: ["tests.view", "tests.create", "tests.publish"] },
  { label: "Daily Practice Problems", permissions: ["dpps.view", "dpps.manage"] },
  { label: "Content", permissions: ["content.view", "content.manage"] },
  { label: "Question Bank", permissions: ["question_bank.view", "question_bank.manage"] },
  { label: "Analytics", permissions: ["analytics.view"] },
  { label: "Access Codes", permissions: ["access_codes.view", "access_codes.manage"] },
  { label: "Messages", permissions: ["messages.view", "messages.send"] },
  { label: "Website", permissions: ["website.manage"] },
];

export type RoleTemplate = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

export const DEFAULT_ROLES: RoleTemplate[] = [
  {
    id: "full_access",
    name: "Full Access",
    description: "Complete access to all educator features",
    permissions: ALL_PERMISSIONS,
  },
  {
    id: "test_coordinator",
    name: "Test Coordinator",
    description: "Creates and manages tests, DPPs, and question bank",
    permissions: [
      "tests.view",
      "tests.create",
      "tests.publish",
      "dpps.view",
      "dpps.manage",
      "question_bank.view",
      "question_bank.manage",
    ],
  },
  {
    id: "content_manager",
    name: "Content Manager",
    description: "Manages content library and question bank",
    permissions: ["content.view", "content.manage", "question_bank.view", "question_bank.manage"],
  },
  {
    id: "student_manager",
    name: "Student Manager",
    description: "Manages students, access codes, and analytics",
    permissions: [
      "students.view",
      "students.manage",
      "analytics.view",
      "access_codes.view",
      "access_codes.manage",
      "messages.view",
      "messages.send",
    ],
  },
  {
    id: "read_only",
    name: "Read Only",
    description: "View-only access across all features",
    permissions: [
      "students.view",
      "tests.view",
      "dpps.view",
      "content.view",
      "question_bank.view",
      "analytics.view",
      "access_codes.view",
      "messages.view",
    ],
  },
];
