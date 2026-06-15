// =============================================
// Local Storage helpers
// =============================================

export const STEP_1_STORAGE_KEY = 'maozReport:step1Selections';

export const STEP_1_PERSISTED_FIELDS = ['teamLead', 'teamMembers', 'vehicles'];

export function getNextMidnightTimestamp() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  ).getTime();
}

export function readStoredStep1Selections() {
  try {
    const raw = localStorage.getItem(STEP_1_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (!parsed?.expiresAt || Date.now() >= parsed.expiresAt) {
      localStorage.removeItem(STEP_1_STORAGE_KEY);
      return null;
    }

    return parsed.values ?? null;
  } catch {
    localStorage.removeItem(STEP_1_STORAGE_KEY);
    return null;
  }
}

export function writeStoredStep1Selections(values) {
  try {
    localStorage.setItem(
      STEP_1_STORAGE_KEY,
      JSON.stringify({
        expiresAt: getNextMidnightTimestamp(),
        values,
      }),
    );
  } catch {
    // localStorage לא זמין / מלא / חסום — לא שוברים את הטופס
  }
}

export function clearStoredStep1Selections() {
  try {
    localStorage.removeItem(STEP_1_STORAGE_KEY);
  } catch {
    // לא שוברים את הטופס
  }
}
