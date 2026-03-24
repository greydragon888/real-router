type Action = "read" | "manage";
type Subject = "dashboard" | "settings" | "admin";

export interface Rule {
  action: Action;
  subject: Subject;
}

export function defineAbilities(role: string): Rule[] {
  switch (role) {
    case "admin":
      return [
        { action: "manage", subject: "admin" },
        { action: "manage", subject: "settings" },
        { action: "read", subject: "dashboard" },
      ];
    case "editor":
      return [
        { action: "manage", subject: "settings" },
        { action: "read", subject: "dashboard" },
      ];
    default:
      return [{ action: "read", subject: "dashboard" }];
  }
}

export function can(rules: Rule[], action: Action, subject: Subject): boolean {
  return rules.some(
    (r) =>
      (r.action === action || r.action === "manage") && r.subject === subject,
  );
}
