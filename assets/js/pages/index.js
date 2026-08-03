// =============================================
// Imports
// =============================================

import { workers } from '../data/workers.js';
import { vehicles } from '../data/vehicles.js';
import { customers } from '../data/customers.js';
import { petahTikvaStreets } from '../data/petahTikvaStreets.js';
import { workTypes } from '../data/workTypes.js';
import { workHourTypes } from '../data/workHourTypes.js';
import { treeTypes } from '../data/treeTypes.js';
import { treeBindTypes } from '../data/treeBindTypes.js';
import { compressPhotosSequential, COMPRESSION_CFG, bytesToMB } from '../compression.js';
import { API_URL, FB_OBJECT, FB_FIELDS } from '../fireberry.schema.js';
import { APP_FLAGS, ROUTES } from '../router.js';
import {
  STEP_1_PERSISTED_FIELDS,
  clearStoredStep1Selections,
  getNextMidnightTimestamp,
  readStoredStep1Selections,
  writeStoredStep1Selections,
} from '../storage.js';

// =============================================

const form = document.querySelector('form');
const formSteps = [...document.querySelectorAll('.steps > fieldset')];
const titleStageIndicator = document.querySelector(
  '.main-title-stage-indicator .container',
);
const titleStageIndicatorItem = titleStageIndicator.querySelector('li');
const footerStageIndicator = [...document.querySelectorAll('.footer-stage-indicator li')];

const btnPrev = document.querySelector('.footer-button-prev');
const btnNext = document.querySelector('.footer-button-next');

const submitIndicator = document.querySelector('#submitIndicator');
const submitIndicatorText = document.querySelector('#submitIndicatorText');
const submitStateLoading = submitIndicator?.querySelector(
  '[data-submit-state="loading"]',
);
const submitStateError = submitIndicator?.querySelector('[data-submit-state="error"]');
const submitErrorDetail = document.querySelector('#submitErrorDetail');
const btnSubmitClose = document.querySelector('#btnSubmitClose');
const btnSubmitRetry = document.querySelector('#btnSubmitRetry');

const scrollToTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
};

let currentStep = formSteps.findIndex((step) => step.classList.contains('current-step'));

// =================================
// Submit Indicator State Management
// =================================

function showSubmitLoading() {
  if (!submitIndicator) return;

  submitIndicator.hidden = false;
  document.body.style.pointerEvents = 'none';
  submitIndicator.style.pointerEvents = 'auto';

  if (submitStateError) submitStateError.hidden = true;
  if (submitStateLoading) submitStateLoading.hidden = false;
}

function showSubmitError(message) {
  if (!submitIndicator) return;

  submitIndicator.hidden = false;
  document.body.style.pointerEvents = 'none';
  submitIndicator.style.pointerEvents = 'auto';

  if (submitStateLoading) submitStateLoading.hidden = true;
  if (submitStateError) submitStateError.hidden = false;

  if (submitErrorDetail) submitErrorDetail.textContent = message || 'שגיאה לא ידועה';
}

function hideSubmitIndicator() {
  if (!submitIndicator) return;
  submitIndicator.hidden = true;
  document.body.style.pointerEvents = '';
}

// ================================
// Step validation + Next button UI
// ================================

const formEl = document.querySelector('form');

const nextIncompleteEl = btnNext.querySelector('.incomplete');
const nextCompleteEl = btnNext.querySelector('.complete');

const lastStepIndex = formSteps.length - 1;

function isCurrentStepValid() {
  const fs = formSteps[currentStep];
  if (!fs) return false;

  // 1) בדיקה רגילה של הדפדפן
  const nativeOk = fs.checkValidity();

  // 2) השלמה: hidden required (כי HTML לא מאמת אותם)
  const requiredHidden = Array.from(
    fs.querySelectorAll('input[type="hidden"][required]:not([disabled])'),
  ).filter((el) => !el.closest('[hidden]'));

  const hiddenOk = requiredHidden.every((el) => String(el.value || '').trim() !== '');

  // 3) השלמה: date required (כדי לתפוס "ניקוי" שלא תמיד נתפס)
  const requiredDates = Array.from(
    fs.querySelectorAll('input[type="date"][required]:not([disabled])'),
  ).filter((el) => !el.closest('[hidden]'));

  const dateOk = requiredDates.every((el) => {
    return String(el.value || '').trim() !== '' && el.valueAsDate !== null;
  });

  // 4) ✅ השלמה: required “טקסטואלי” (כמו כתובת) + textarea/select/number
  //    מונע מצב שבו ריק/רווחים עדיין נותן לעבור
  const requiredTextLike = Array.from(
    fs.querySelectorAll(
      'input[required]:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), textarea[required]:not([disabled]), select[required]:not([disabled])',
    ),
  ).filter((el) => !el.closest('[hidden]'));

  const textOk = requiredTextLike.every((el) => {
    const v = String(el.value ?? '');
    // date/number: ריק = לא תקין. טקסט: trim
    return el.type === 'number' || el.type === 'date' ? v !== '' : v.trim() !== '';
  });

  return nativeOk && hiddenOk && dateOk && textOk;
}

function updateNextButtonUI() {
  const isLast = currentStep === lastStepIndex;
  const valid = isCurrentStepValid();

  // עדכון טקסט "המשך"/"שלח טופס"
  if (nextCompleteEl) nextCompleteEl.textContent = isLast ? 'שלח טופס' : 'המשך';

  // disabled + החלפת הטקסטים
  btnNext.disabled = !valid;
  if (nextIncompleteEl) nextIncompleteEl.hidden = valid;
  if (nextCompleteEl) nextCompleteEl.hidden = !valid;
}

function onFormMutate(e) {
  const fs = formSteps[currentStep];
  if (!fs) return;
  if (!fs.contains(e.target)) return;
  updateNextButtonUI();
}

// input/change על כל הטופס (capture), אבל אנחנו מסננים רק לשלב הנוכחי
formEl.addEventListener('input', onFormMutate, true);
formEl.addEventListener('change', onFormMutate, true);

// הרצה ראשונית
updateNextButtonUI();

function focusFirstInvalidInCurrentStep() {
  const fs = formSteps[currentStep];
  if (!fs) return;

  // קודם תן לדפדפן להראות הודעות על שדות רגילים
  if (!fs.checkValidity()) {
    fs.reportValidity();
    return;
  }

  // אם הגענו לפה, הבעיה היא hidden required
  const firstEmptyHidden = Array.from(
    fs.querySelectorAll('input[type="hidden"][required]:not([disabled])'),
  ).find((el) => !el.closest('[hidden]') && String(el.value || '').trim() === '');

  if (!firstEmptyHidden) return;

  // נסה למצוא את ה-combobox באותו form-field ולפקס אליו
  const field = firstEmptyHidden.closest('.form-field');
  const combo = field?.querySelector('[role="combobox"]');

  if (combo) combo.focus();
}

// ==========================
// Skip Step 3 when needed
// ==========================

const stepsEl = document.querySelector('.steps'); // בשביל data-step (אופציונלי)

const STEP_2_INDEX = 1;
const STEP_3_INDEX = 2;
const STEP_4_INDEX = 3;

const workTypeFieldset = formSteps[STEP_3_INDEX];

let skipWorkTypeStep = false;

function setSkipWorkTypeStep(shouldSkip) {
  skipWorkTypeStep = shouldSkip;

  if (!workTypeFieldset) return;

  workTypeFieldset.hidden = shouldSkip;

  // ✅ מנטרל ולידציה (required) בשלב 3 כשהוא מדולג
  const controls = workTypeFieldset.querySelectorAll('input, select, textarea, button');

  controls.forEach((el) => {
    // שומרים מצב קודם כדי להחזיר בלי לשבור דברים
    if (shouldSkip) {
      if (!el.hasAttribute('data-was-disabled')) {
        el.setAttribute('data-was-disabled', el.disabled ? '1' : '0');
      }
      el.disabled = true;
    } else {
      const wasDisabled = el.getAttribute('data-was-disabled');
      if (wasDisabled !== null) {
        el.disabled = wasDisabled === '1';
        el.removeAttribute('data-was-disabled');
      } else {
        // אם משום מה לא נשמר ערך, לא נוגעים
      }
    }
  });
}

function getNextStepIndex(fromIndex) {
  // דילוג מ-2 -> 4
  if (skipWorkTypeStep && fromIndex === STEP_2_INDEX) return STEP_4_INDEX;
  return Math.min(fromIndex + 1, lastStepIndex);
}

function getPrevStepIndex(fromIndex) {
  // חזרה מ-4 -> 2
  if (skipWorkTypeStep && fromIndex === STEP_4_INDEX) return STEP_2_INDEX;
  return Math.max(fromIndex - 1, 0);
}

function goToStep(targetIndex) {
  if (targetIndex === currentStep) return;

  // הסר מצב נוכחי
  formSteps[currentStep].classList.remove('current-step');
  footerStageIndicator[currentStep].classList.remove('current-step');

  // עדכן current
  currentStep = targetIndex;

  // הוסף מצב נוכחי
  formSteps[currentStep].classList.add('current-step');
  footerStageIndicator[currentStep].classList.add('current-step');

  // עדכן אינדיקטור עליון (הגלילה האנכית של המספרים)
  titleStageIndicator.style.transform = `translateY(-${
    titleStageIndicatorItem.getBoundingClientRect().height * currentStep
  }px)`;

  // עדכון רוחב הכפתור "הבא"
  if (currentStep === 0) btnNext.style.width = '';
  else btnNext.style.width = 'calc(85% - 0.5rem)';

  // אופציונלי: אם אתה משתמש ב-data-step ב-CSS/JS
  if (stepsEl) stepsEl.dataset.step = String(currentStep + 1);

  updateNextButtonUI();
  scrollToTop();
}

// מאזין לשינוי סטטוס משימה ומפעיל/מכבה דילוג
function initSkipOnTaskStatus() {
  const taskStatusHidden = document.querySelector('input[name="taskStatus"]');
  if (!taskStatusHidden) return;

  const apply = () => {
    const shouldSkip = taskStatusHidden.value === 'לא טופלה';
    setSkipWorkTypeStep(shouldSkip);

    // ✅ לא קופצים אוטומטית משלב 2 לשלב 4.
    // המשתמש יגיע לשלב 4 רק בלחיצה על "המשך" (דרך getNextStepIndex).

    // אם נמצאים בשלב 3 והפעלנו דילוג — חייבים לצאת ממנו כי הוא מוסתר
    if (shouldSkip && currentStep === STEP_3_INDEX) {
      goToStep(STEP_4_INDEX);
    }

    updateNextButtonUI();
  };

  taskStatusHidden.addEventListener('change', apply);
  apply(); // מצב התחלתי (אם נטען עם ערך)
}

initSkipOnTaskStatus();

// ===============
// Step Navigation
// ===============

btnNext.addEventListener('click', (e) => {
  // תמיד מונעים ברירת מחדל (כדי שלא יהיה submit בטעות)
  e.preventDefault();

  // אם בשלב האחרון - שולחים את הטופס בפועל
  if (currentStep === lastStepIndex) {
    // אם לא תקין – הצג הודעות
    if (!isCurrentStepValid()) {
      focusFirstInvalidInCurrentStep();
      return;
    }

    // submit אמיתי (מפעיל את form 'submit' listener שלך)
    formEl.requestSubmit();
    return;
  }

  // אם לא תקין, מציג הודעות דפדפן ומונע מעבר
  if (!isCurrentStepValid()) {
    e.preventDefault();
    focusFirstInvalidInCurrentStep();
    return;
  }

  // מעבר שלב רגיל
  if (currentStep < formSteps.length - 1) {
    scrollToTop();

    formSteps[currentStep].classList.remove('current-step');
    footerStageIndicator[currentStep].classList.remove('current-step');

    currentStep = getNextStepIndex(currentStep);

    formSteps[currentStep].classList.add('current-step');
    footerStageIndicator[currentStep].classList.add('current-step');

    titleStageIndicator.style.transform = `translateY(-${
      titleStageIndicatorItem.getBoundingClientRect().height * currentStep
    }px)`;

    if (currentStep >= 1) {
      btnNext.style.width = 'calc(85% - 0.5rem)';
    }

    updateNextButtonUI();
  }
});

btnPrev.addEventListener('click', () => {
  if (currentStep > 0) {
    scrollToTop();

    // הסר מצב נוכחי מהשלב הנוכחי
    formSteps[currentStep].classList.remove('current-step');
    footerStageIndicator[currentStep].classList.remove('current-step');

    // חזור שלב אחד אחורה
    currentStep = getPrevStepIndex(currentStep);

    // הוסף מצב נוכחי לשלב החדש
    formSteps[currentStep].classList.add('current-step');
    footerStageIndicator[currentStep].classList.add('current-step');

    // עדכן את תזוזת האינדיקטור
    titleStageIndicator.style.transform = `translateY(-${titleStageIndicatorItem.getBoundingClientRect().height * currentStep}px)`;

    // עדכן רוחב הכפתור "הבא" (כשתחזור ל-0 תחזיר לרוחב המקורי)
    if (currentStep === 0) {
      btnNext.style.width = ''; // חוזר ל-CSS
    } else {
      btnNext.style.width = 'calc(85% - 0.5rem)';
    }
  }

  updateNextButtonUI();
});

formEl.addEventListener('submit', (e) => {
  // אם אנחנו לא בשלב האחרון, לא אמור להיות submit בכלל
  if (currentStep !== lastStepIndex) {
    e.preventDefault();
    return;
  }

  // ולידציה לשלב האחרון (אפשר גם לכל הטופס אם תרצה בעתיד)
  if (!isCurrentStepValid()) {
    e.preventDefault();
    formSteps[currentStep].reportValidity();
  }
});

// =================
// Set current date
// =================

const inputDate = document.querySelectorAll('input[type="date"]');
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;

  inputDate.forEach((field) => {
    if (!field.value) field.value = today;
  });
});

// =====================
// Initiate select types
// =====================

function initSelectBase(root) {
  const combobox = root.querySelector('[role="combobox"]');
  const listbox = root.querySelector('[role="listbox"]');
  const valueEl = root.querySelector('[data-select-value]');
  const imgEl = root.querySelector('[data-select-img]');
  const hiddenInput = root.querySelector('input[type="hidden"][name]');
  const searchEl = root.querySelector('[data-select-search]');
  const options = () => Array.from(listbox.querySelectorAll('[role="option"]')); // חשוב: דינמי

  let activeIndex = -1;
  let selectionChangedDuringOpen = false;

  const normalize = (s) =>
    String(s ?? '')
      .trim()
      .toLowerCase();

  const getSelectedLabel = () => {
    // אם יש aria-selected על אופציות – הכי מדויק
    const selectedOpt = options().find((o) => o.getAttribute('aria-selected') === 'true');
    if (selectedOpt)
      return (
        selectedOpt.dataset.label ??
        selectedOpt.dataset.value ??
        selectedOpt.textContent ??
        ''
      ).trim();

    // fallback: לפי hiddenInput.value
    const v = String(hiddenInput?.value ?? '').trim();
    if (!v) return '';
    const match = options().find((o) => String(o.dataset.value ?? '').trim() === v);
    return match ? (match.dataset.label ?? match.dataset.value ?? '').trim() : v;
  };

  // למצוא את ה-li של "אחר" (אנחנו מניחים שקיים כאופציה)
  const getOtherOption = () =>
    options().find(
      (opt) =>
        normalize(opt.dataset.value) === 'אחר' || normalize(opt.dataset.label) === 'אחר',
    );

  // מה נחשב "טקסט לחיפוש" עבור אופציה
  const getOptionSearchText = (opt) => {
    // עדיף dataset.label/value כדי לא "לאסוף" טקסטים של meta/role
    const label = opt.dataset.label ?? '';
    const value = opt.dataset.value ?? '';
    const meta = opt.dataset.meta ?? '';
    return normalize(`${label} ${value} ${meta}`);
  };

  const applyFilter = (query) => {
    const q = normalize(query);
    const opts = options();

    // אם ריק => כולם
    if (!q) {
      opts.forEach((o) => (o.hidden = false));
      return;
    }

    const other = getOtherOption();

    // 1) קודם נסנן הכל לפי hit
    let matchesNonOther = 0;

    opts.forEach((opt) => {
      const isOther =
        normalize(opt.dataset.value) === 'אחר' || normalize(opt.dataset.label) === 'אחר';

      const hit = getOptionSearchText(opt).includes(q);

      if (isOther) {
        // נטפל ב"אחר" אחרי שנדע אם יש התאמות אחרות
        opt.hidden = true;
        return;
      }

      opt.hidden = !hit;
      if (hit) matchesNonOther++;
    });

    // 2) טיפול ב"אחר":
    // - אם המשתמש מחפש "אחר" מפורש => להציג
    // - אם אין התאמות אחרות => להציג רק "אחר"
    if (other) {
      const otherHit = getOptionSearchText(other).includes(q);

      if (otherHit) {
        // מחפש "אחר" => מציגים אותו בנוסף (לא משנה אם יש התאמות אחרות)
        other.hidden = false;
      } else if (matchesNonOther === 0) {
        // אין התאמות => רק "אחר"
        opts.forEach((o) => (o.hidden = true));
        other.hidden = false;
      } else {
        // יש התאמות אחרות ואין חיפוש "אחר" => "אחר" נשאר מוסתר
        other.hidden = true;
      }
    }
  };

  const scrollMenuToViewportCenter = (gap = 16) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (listbox.hidden) return;

        const rect = listbox.getBoundingClientRect();

        const header = document.querySelector('header');
        const footer = document.querySelector('footer');

        const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
        const footerTop = footer?.getBoundingClientRect().top ?? window.innerHeight;

        const viewportTop = Math.max(headerBottom, 0) + gap;
        const viewportBottom = Math.min(footerTop, window.innerHeight) - gap;

        const availableHeight = viewportBottom - viewportTop;

        if (availableHeight <= 0) return;

        const viewportCenter = viewportTop + availableHeight / 2;
        const menuCenter = rect.top + rect.height / 2;

        const delta = menuCenter - viewportCenter;

        // אם ההפרש קטן, אין צורך בגלילה שמרגישה קופצנית
        if (Math.abs(delta) < 12) return;

        window.scrollBy({
          top: delta,
          left: 0,
          behavior: 'smooth',
        });
      });
    });
  };

  const isOpen = () => combobox.getAttribute('aria-expanded') === 'true';

  const open = () => {
    combobox.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;

    scrollMenuToViewportCenter(16);

    const opts = options();
    const selectedIndex = opts.findIndex(
      (o) => o.getAttribute('aria-selected') === 'true',
    );

    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActive(activeIndex);

    if (searchEl) {
      combobox.classList.add('is-searching');
      searchEl.hidden = false;

      const isMulti = !!root.querySelector('.form-input-select-multi-menu');
      const prefill = isMulti ? '' : getSelectedLabel();
      searchEl.value = prefill;
      selectionChangedDuringOpen = false;

      applyFilter(searchEl.value);

      const visible = options().filter((o) => !o.hidden);
      activeIndex = visible.length ? options().indexOf(visible[0]) : -1;
      if (activeIndex >= 0) setActive(activeIndex);
    }
  };

  const close = () => {
    combobox.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    clearActive();
    activeIndex = -1;

    if (searchEl) {
      combobox.classList.remove('is-searching');
      searchEl.hidden = true;

      if (selectionChangedDuringOpen) {
        // היתה בחירה => נשאיר את הבחירה כשורת החיפוש
        searchEl.value = getSelectedLabel();
      } else {
        // לא היתה בחירה => נקה
        searchEl.value = '';
      }

      applyFilter(''); // להחזיר את הרשימה למצב מלא
    }
  };

  const toggle = () => (isOpen() ? close() : open());

  const setActive = (index) => {
    const opts = options();
    opts.forEach((o) => o.classList.remove('is-active'));
    const opt = opts[index];
    if (!opt) return;
    opt.classList.add('is-active');
    opt.scrollIntoView({ block: 'nearest' });
  };

  const clearActive = () => {
    options().forEach((o) => o.classList.remove('is-active'));
  };

  const moveActive = (dir) => {
    if (!isOpen()) open();
    const opts = options();
    if (!opts.length) return;

    let next = activeIndex;
    for (let i = 0; i < opts.length; i++) {
      next = Math.max(0, Math.min(opts.length - 1, next + dir));
      if (!opts[next]?.hidden) break;
    }

    activeIndex = next;
    setActive(activeIndex);
  };

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      applyFilter(searchEl.value);

      // כשמסננים, כדאי להגדיר activeIndex לאופציה הראשונה הנראית
      const visible = options().filter((o) => !o.hidden);
      activeIndex = visible.length ? options().indexOf(visible[0]) : -1;
      if (activeIndex >= 0) setActive(activeIndex);
    });

    // Enter בחיפוש: לבחור את האופציה הפעילה (אם קיימת)
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const active = listbox.querySelector('.is-active:not([hidden])');
        if (active) active.click();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        combobox.focus();
      }
    });

    // מונע מהקליק באינפוט "להפעיל" את הכפתור שמכיל אותו
    searchEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    searchEl.addEventListener('click', (e) => e.stopPropagation());
  }

  if (searchEl) {
    let suppressNextClick = false;

    const openAndFocusSearch = (e) => {
      // אם לחצו על ה-input עצמו
      if (e.target.closest('[data-select-search]')) return;

      // אם כבר פתוח - רק לפקס
      if (!isOpen()) {
        open();
      }

      // חשוב לאייפון: focus חייב להיות בתוך האירוע עצמו
      searchEl.hidden = false; // ביטחון (ב-open כבר עושה)
      combobox.classList.add('is-searching');

      // מונע “קליק” שיבוא אחרי touchstart מלסגור מיד
      suppressNextClick = true;

      // iOS: חייבים למנוע ברירת מחדל כדי לא לתת לכפתור לגנוב פוקוס
      e.preventDefault();

      searchEl.focus();
    };

    // iOS: touchstart הוא הכי אמין לפוקוס
    combobox.addEventListener('touchstart', openAndFocusSearch, { passive: false });

    // Desktop/Android/Pointer devices
    combobox.addEventListener('pointerdown', openAndFocusSearch);

    // קליק משמש רק לסגירה (ולא אחרי ה-touchstart)
    combobox.addEventListener('click', (e) => {
      if (e.target.closest('[data-select-search]')) return;

      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }

      if (isOpen()) close();
      else open();
    });

    // מונע מהקליק בתוך האינפוט להפעיל את הכפתור
    searchEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    searchEl.addEventListener('click', (e) => e.stopPropagation());
  } else {
    // בלי חיפוש: התנהגות רגילה
    combobox.addEventListener('click', toggle);
  }

  // מקלדת בסיסית
  combobox.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(+1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Escape':
        if (isOpen()) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        close();
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen()) open();
        break;
    }
  });

  // סגירה בלחיצה מחוץ (משותף לשני הסוגים)
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target)) close();
  });

  // placeholder
  const placeholder = combobox.dataset.placeholder || '‎';
  if (!hiddenInput.value) valueEl.textContent = placeholder;

  const markSelectionChanged = () => {
    selectionChangedDuringOpen = true;
  };

  return {
    root,
    combobox,
    listbox,
    valueEl,
    imgEl,
    hiddenInput,
    options,
    isOpen,
    open,
    close,
    toggle,
    markSelectionChanged,
  };
}

function initSingleSelect(root) {
  const base = initSelectBase(root);

  const setSelected = (opt, { close = true, focus = true } = {}) => {
    base.options().forEach((o) => o.setAttribute('aria-selected', 'false'));
    opt.setAttribute('aria-selected', 'true');

    const value = opt.dataset.value;
    if (!value) return;

    base.valueEl.textContent = value;
    base.hiddenInput.value = value;
    base.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));

    const swatchTarget = root.querySelector('[data-select-swatch]');

    if (swatchTarget) {
      // מחפש את העיגול בתוך האופציה שנבחרה
      const swatchSource = opt.querySelector('.option-swatch');

      // מוחק צבע קודם (כל class שמתחיל ב- swatch--)
      swatchTarget.classList.forEach((cls) => {
        if (cls.startsWith('swatch--')) swatchTarget.classList.remove(cls);
      });

      // מוסיף את צבע האופציה שנבחרה
      if (swatchSource) {
        const colorClass = [...swatchSource.classList].find((cls) =>
          cls.startsWith('swatch--'),
        );
        if (colorClass) swatchTarget.classList.add(colorClass);
      }
    }

    const imgWrap = root.querySelector('[data-select-img-wrap]');
    const imgEl = root.querySelector('[data-select-img]');

    if (imgWrap && imgEl) {
      const src = opt.dataset.img;

      if (src) {
        imgEl.src = src;
        imgEl.alt = ''; // דקורטיבי
        imgEl.decoding = 'async';
        imgWrap.hidden = false; // יש תמונה -> מוצגת
      } else {
        imgEl.removeAttribute('src');
        imgWrap.hidden = true; // אין תמונה -> אין מקום לתמונה
      }
    }

    if (close) base.close(); // נסגר בבחירה
    if (focus) base.combobox.focus();
  };

  // קליק על אופציות
  base.listbox.addEventListener('click', (e) => {
    const opt = e.target.closest('[role="option"]');
    if (!opt) return;

    base.markSelectionChanged();
    setSelected(opt);
  });

  // Enter/Space בוחר אופציה פעילה
  base.combobox.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && base.isOpen()) {
      e.preventDefault();
      const active = base.listbox.querySelector('.is-active');
      if (active) setSelected(active);
    }
  });

  root._setSingleSelectValue = (value) => {
    if (!value) return;

    const opt = base.listbox.querySelector(
      `[role="option"][data-value="${CSS.escape(value)}"]`,
    );

    if (!opt) return;

    base.markSelectionChanged();
    setSelected(opt, { close: false, focus: false });
  };
}

function initMultiSelect(root) {
  const base = initSelectBase(root);
  const chipsList = root.querySelector('.form-input-select-multi-chosen');

  const singular = root.dataset.multiSingular || 'פריט';
  const plural = root.dataset.multiPlural || `${singular}ים`;

  const oneWord = root.dataset.multiOneWord || 'אחד'; // אחד / אחת
  const oneVerb = root.dataset.multiOneVerb || 'נבחר'; // נבחר / נבחרה

  // value -> { label, img, alt }
  const selected = new Map();

  const updateButtonText = () => {
    const n = selected.size;
    const placeholder = base.combobox.dataset.placeholder || '‎';

    if (n === 0) base.valueEl.textContent = placeholder;
    else if (n === 1) base.valueEl.textContent = `${singular} ${oneWord} ${oneVerb}`;
    else base.valueEl.textContent = `${n} ${plural} נבחרו`;
  };

  const syncHiddenInput = () => {
    // CSV עם פסיק + רווח
    base.hiddenInput.value = Array.from(selected.keys())
      .map((v) => v.trim())
      .join(', ');
  };

  const renderChips = () => {
    if (!chipsList) return;
    chipsList.textContent = '';

    const frag = document.createDocumentFragment();

    selected.forEach((meta, value) => {
      const li = document.createElement('li');
      li.className = 'form-input-select-chip';
      li.dataset.value = value;

      const imgHtml = meta.img
        ? `<img class="form-input-select-chip-img option-image" src="${meta.img}" alt="" decoding="async">`
        : '';

      li.innerHTML = `
        ${imgHtml}
        <span class="form-input-select-chip-label">${meta.label}</span>
        <button type="button" aria-label="הסר ${meta.label}">
          <span class="x-mark-icon"
              ><svg
                xmlns="http://www.w3.org/2000/svg"
                width="569.551"
                height="569.55"
                viewBox="0 0 569.551 569.55"
              >
                <path
                  d="M474.637,0,284.8,189.9,94.914,0,0,94.914,189.888,284.809,0,474.636,94.914,569.55,284.8,379.722,474.637,569.55l94.914-94.914L379.723,284.809,569.551,94.914Z"
                />
              </svg>
            </span>
          </button>
      `;

      frag.appendChild(li);
    });

    chipsList.appendChild(frag);
  };

  const toggleOption = (opt) => {
    const value = opt.dataset.value;
    if (!value) return;

    const label = opt.dataset.label ?? value;
    const img = opt.dataset.img || '';
    const alt = opt.dataset.alt || '';

    if (selected.has(value)) {
      selected.delete(value);
      opt.setAttribute('aria-selected', 'false');
    } else {
      selected.set(value, { label, img, alt });
      opt.setAttribute('aria-selected', 'true');
    }

    updateButtonText();
    syncHiddenInput();
    base.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    renderChips();
    // לא סוגרים את התפריט בבחירה
  };

  // קליק על אופציות
  base.listbox.addEventListener('click', (e) => {
    const opt = e.target.closest('[role="option"]');
    if (opt) toggleOption(opt);
  });

  // Enter/Space על אופציה פעילה
  base.combobox.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && base.isOpen()) {
      e.preventDefault();
      const active = base.listbox.querySelector('.is-active');
      if (active) toggleOption(active);
    }
  });

  // הסרה מתוך chips
  if (chipsList) {
    chipsList.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const chip = e.target.closest('.form-input-select-chip');
      const value = chip?.dataset.value;
      if (!value) return;

      selected.delete(value);

      const opt = base.listbox.querySelector(
        `[role="option"][data-value="${CSS.escape(value)}"]`,
      );
      if (opt) opt.setAttribute('aria-selected', 'false');

      updateButtonText();
      syncHiddenInput();
      base.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      renderChips();
    });
  }

  // init מצב התחלתי
  updateButtonText();
  syncHiddenInput();
  base.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  renderChips();

  const reset = () => {
    selected.clear();

    // אפס aria-selected ברשימה
    base.listbox.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.setAttribute('aria-selected', 'false');
    });

    updateButtonText();
    syncHiddenInput();
    base.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    renderChips();

    // (רשות) סגור את התפריט אם פתוח
    if (base.isOpen()) base.close();
  };

  const setSelectedValues = (values) => {
    selected.clear();

    base.listbox.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.setAttribute('aria-selected', 'false');
    });

    values.forEach((value) => {
      const opt = base.listbox.querySelector(
        `[role="option"][data-value="${CSS.escape(value)}"]`,
      );

      if (!opt) return;

      const optionValue = opt.dataset.value;
      if (!optionValue) return;

      const label = opt.dataset.label ?? optionValue;
      const img = opt.dataset.img || '';
      const alt = opt.dataset.alt || '';

      selected.set(optionValue, { label, img, alt });
      opt.setAttribute('aria-selected', 'true');
    });

    updateButtonText();
    syncHiddenInput();
    base.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    renderChips();
  };

  root._setMultiSelectValues = setSelectedValues;

  root._resetMultiSelect = reset; // מאפשר לקרוא מבחוץ
}

// ===================
// Render select menus
// ===================

function renderSelectOptions(menuEl, options, config = {}) {
  if (!menuEl) return;

  const {
    metaKey = null, // 'role' או 'type'
    optionClass = 'form-input-select-menu-option',
    showImage = true,
  } = config;

  menuEl.textContent = '';
  const frag = document.createDocumentFragment();

  options.forEach((item) => {
    const value = item.value ?? '';
    const label = item.label ?? value;
    const meta = metaKey && item[metaKey] ? String(item[metaKey]) : '';
    const img = showImage && item.img ? item.img : '';
    const alt = item.alt ? item.alt : '';

    const li = document.createElement('li');

    li.className = optionClass;
    li.setAttribute('role', 'option');
    li.setAttribute('tabindex', '-1');

    li.dataset.value = value;
    li.dataset.label = label;

    if (meta) li.dataset.meta = meta;
    if (img) li.dataset.img = img;
    if (alt) li.dataset.alt = alt;

    li.innerHTML = `
      <span class="option-image-text-group">
        ${img ? `<img class="option-image" src="${img}" alt="${alt}" decoding="async">` : ''}
        <span class="option-text">${label}</span>
      </span>
      ${meta ? `<span class="option-role">${meta}</span>` : ''}
    `;

    frag.appendChild(li);
  });

  menuEl.appendChild(frag);
}

const teamLeadSelectMenu = document.querySelector('.form-input-select-menu-teamLead');
const teamMembersSelectMenu = document.querySelector(
  '.form-input-select-menu-teamMembers',
);
const vehiclesSelectMenu = document.querySelector('.form-input-select-menu-vehicles');
const customerSelectMenu = document.querySelector('.form-input-select-menu-customer');
const workTypeselectMenus = document.querySelectorAll(
  '.form-input-select-menu-work-type',
);
const workHourDescriptionSelectMenus = document.querySelectorAll(
  '.form-input-select-menu-work-hour-description',
);
const treeTypeSelectMenus = document.querySelectorAll(
  '.form-input-select-menu-tree-type',
);
const treeBindTypeSelectMenus = document.querySelectorAll(
  '.form-input-select-menu-tree-bind-type',
);

const teamLeadRoles = new Set(['מנהל פרויקט', 'ראש צוות', 'קבלן']);
const teamLeadsFilter = workers.filter((w) => teamLeadRoles.has(w.role));

renderSelectOptions(teamLeadSelectMenu, teamLeadsFilter, {
  metaKey: 'role',
  showImage: true,
});

renderSelectOptions(teamMembersSelectMenu, workers, {
  metaKey: 'role',
  showImage: true,
});

renderSelectOptions(vehiclesSelectMenu, vehicles, { metaKey: 'type', showImage: false });
renderSelectOptions(customerSelectMenu, customers, { metaKey: '', showImage: false });

workTypeselectMenus.forEach((menu) => {
  renderSelectOptions(menu, workTypes, { metaKey: '', showImage: false });
});

workHourDescriptionSelectMenus.forEach((menu) => {
  renderSelectOptions(menu, workHourTypes, { metaKey: '', showImage: false });
});

treeTypeSelectMenus.forEach((menu) => {
  renderSelectOptions(menu, treeTypes, { metaKey: '', showImage: false });
});

treeBindTypeSelectMenus.forEach((menu) => {
  renderSelectOptions(menu, treeBindTypes, { metaKey: '', showImage: false });
});

// ===========================
// Free text autocomplete menus
// ===========================

function initFreeTextAutocomplete({
  input,
  listbox,
  options,
  maxResults = 30,
  minChars = 1,
  appendSpaceOnSelect = true,
  showAllWhenEmpty = false,
}) {
  if (!input || !listbox || !Array.isArray(options)) return;

  let activeIndex = -1;
  let hasFocus = false;

  const normalize = (value) =>
    String(value ?? '')
      .trim()
      .toLowerCase();

  const getMatches = (query) => {
    const q = normalize(query);

    if (!q) {
      return showAllWhenEmpty && hasFocus ? options : [];
    }

    if (q.length < minChars) return [];

    return options
      .filter((option) => {
        const label = normalize(option.label);
        const value = normalize(option.value);

        return label.includes(q) || value.includes(q);
      })
      .slice(0, maxResults);
  };

  const isOpen = () => input.getAttribute('aria-expanded') === 'true';

  const open = () => {
    input.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;
  };

  const close = () => {
    input.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    activeIndex = -1;

    listbox.querySelectorAll('[role="option"]').forEach((option) => {
      option.classList.remove('is-active');
      option.setAttribute('aria-selected', 'false');
    });
  };

  const setActive = (index) => {
    const items = Array.from(listbox.querySelectorAll('[role="option"]'));

    items.forEach((item) => {
      item.classList.remove('is-active');
      item.setAttribute('aria-selected', 'false');
    });

    const item = items[index];
    if (!item) return;

    item.classList.add('is-active');
    item.setAttribute('aria-selected', 'true');
    item.scrollIntoView({ block: 'nearest' });

    activeIndex = index;
  };

  const selectOption = (optionEl) => {
    const value = optionEl?.dataset.value;
    if (!value) return;

    input.value = appendSpaceOnSelect ? `${value} ` : value;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    close();

    input.focus();

    const end = input.value.length;
    input.setSelectionRange(end, end);
  };

  const render = () => {
    const matches = getMatches(input.value);

    listbox.textContent = '';

    if (!matches.length) {
      close();
      return;
    }

    const frag = document.createDocumentFragment();

    matches.forEach((option) => {
      const value = option.value ?? option.label ?? '';
      const label = option.label ?? value;

      const li = document.createElement('li');
      li.className = 'form-input-select-menu-option';
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.setAttribute('aria-selected', 'false');

      li.dataset.value = value;
      li.dataset.label = label;

      li.innerHTML = `
        <span class="option-image-text-group">
          <span class="option-text">${label}</span>
        </span>
      `;

      frag.appendChild(li);
    });

    listbox.appendChild(frag);

    open();
    setActive(0);
  };

  input.addEventListener('input', render);

  input.addEventListener('focus', () => {
    hasFocus = true;
    render();
  });

  input.addEventListener('blur', () => {
    hasFocus = false;
  });

  input.addEventListener('keydown', (e) => {
    const items = Array.from(listbox.querySelectorAll('[role="option"]'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();

      if (!isOpen()) {
        render();
        return;
      }

      if (!items.length) return;

      const nextIndex = Math.min(activeIndex + 1, items.length - 1);
      setActive(nextIndex);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();

      if (!items.length) return;

      const nextIndex = Math.max(activeIndex - 1, 0);
      setActive(nextIndex);
      return;
    }

    if (e.key === 'Enter') {
      if (!isOpen()) return;

      const active = items[activeIndex];
      if (!active) return;

      e.preventDefault();
      selectOption(active);
      return;
    }

    if (e.key === 'Escape') {
      if (!isOpen()) return;

      e.preventDefault();
      close();
    }
  });

  listbox.addEventListener('pointerdown', (e) => {
    // מונע מה-input לאבד focus לפני הבחירה
    e.preventDefault();
  });

  listbox.addEventListener('click', (e) => {
    const option = e.target.closest('[role="option"]');
    if (!option) return;

    selectOption(option);
  });

  document.addEventListener('pointerdown', (e) => {
    if (!input.closest('.form-field')?.contains(e.target)) {
      close();
    }
  });

  close();
}

// ===================
// Init Selects
// ===================

function initStaticSelectFields() {
  document.querySelectorAll('.form-field').forEach((field) => {
    if (field.dataset.inited === '1') return;
    if (field.dataset.field === 'autocomplete') return;

    const hiddenInput = field.querySelector('input[type="hidden"][name]');
    const valueEl = field.querySelector('[data-select-value]');

    if (!hiddenInput || !valueEl) return;

    if (field.querySelector('.form-input-select-single-menu')) {
      initSingleSelect(field);
      field.dataset.inited = '1';
    } else if (field.querySelector('.form-input-select-multi-menu')) {
      initMultiSelect(field);
      field.dataset.inited = '1';
    }
  });
}

initStaticSelectFields();

const addressInput = document.querySelector('#address');
const addressListbox = document.querySelector('#address__listbox');

initFreeTextAutocomplete({
  input: addressInput,
  listbox: addressListbox,
  options: petahTikvaStreets,
  maxResults: 30,
  showAllWhenEmpty: true,
});

// ===============================
// Step 1 Persistence
// ===============================

function getHiddenInputByName(name) {
  return document.querySelector(`input[type="hidden"][name="${name}"]`);
}

function getSelectFieldByName(name) {
  return getHiddenInputByName(name)?.closest('.form-field') ?? null;
}

function getCurrentStep1PersistedValues() {
  const values = {};

  STEP_1_PERSISTED_FIELDS.forEach((name) => {
    const input = getHiddenInputByName(name);
    values[name] = input?.value ?? '';
  });

  return values;
}

function saveStep1PersistedValues() {
  writeStoredStep1Selections(getCurrentStep1PersistedValues());
}

function csvToValues(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function restoreStep1PersistedValues() {
  const values = readStoredStep1Selections();
  if (!values) return;

  const teamLeadField = getSelectFieldByName('teamLead');
  const teamMembersField = getSelectFieldByName('teamMembers');
  const vehiclesField = getSelectFieldByName('vehicles');

  teamLeadField?._setSingleSelectValue?.(values.teamLead);
  teamMembersField?._setMultiSelectValues?.(csvToValues(values.teamMembers));
  vehiclesField?._setMultiSelectValues?.(csvToValues(values.vehicles));

  queueMicrotask(() => updateNextButtonUI());
}

function initStep1Persistence() {
  restoreStep1PersistedValues();

  STEP_1_PERSISTED_FIELDS.forEach((name) => {
    const input = getHiddenInputByName(name);
    if (!input) return;

    input.addEventListener('change', saveStep1PersistedValues);
  });

  const msUntilMidnight = getNextMidnightTimestamp() - Date.now();

  window.setTimeout(() => {
    clearStoredStep1Selections();
  }, msUntilMidnight);
}

initStep1Persistence();

// ===================
// שדות המשך
// ===================

const splitWhen = (str) =>
  (str || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

function resetFollowupsArea(area) {
  if (!area) return;

  // 1) אפס multi-selectים שלך (מנקה גם state פנימי)
  area.querySelectorAll('.form-field').forEach((field) => {
    field?._resetMultiSelect?.();
  });

  // 2) נקה ערכים של inputs/textarea/select רגילים בתוך האזור
  area.querySelectorAll('input, textarea, select').forEach((el) => {
    if (el.matches('input[type="hidden"], input[type="text"], textarea')) el.value = '';
    if (el.matches('input[type="checkbox"], input[type="radio"]')) el.checked = false;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
  });
}

function setRequiredInArea(area, isRequired) {
  if (!area) return;
  area.querySelectorAll('[data-required-when-visible]').forEach((el) => {
    el.required = isRequired;
  });
}

function initConditionalFollowups() {
  const triggers = document.querySelectorAll(
    '[data-followups-target][data-followups-show-when]',
  );

  triggers.forEach((triggerField) => {
    const targetSelector = triggerField.dataset.followupsTarget;
    const target = document.querySelector(targetSelector);
    const showWhen = new Set(splitWhen(triggerField.dataset.followupsShowWhen));

    // מקור האמת אצלך הוא hidden input בתוך אותו form-field
    const hidden = triggerField.querySelector('input[type="hidden"]');
    if (!hidden || !target) return;

    const isMultiSelect = triggerField.querySelector('.form-input-select-multi-menu');
    if (isMultiSelect) return;

    const apply = () => {
      const shouldShow = showWhen.has(hidden.value);

      target.hidden = !shouldShow;
      setRequiredInArea(target, shouldShow);

      if (!shouldShow) resetFollowupsArea(target);

      // ✅ חשוב: לעדכן את מצב כפתור "המשך" אחרי שה-required השתנה
      // (ה-change על הטופס רץ לפני apply בגלל capture)
      queueMicrotask(() => updateNextButtonUI());
    };

    hidden.addEventListener('change', apply);
    apply(); // הרצה ראשונית
  });
}

function initMultiSelectConditionalFollowups() {
  const triggers = document.querySelectorAll(
    '[data-followups-target][data-followups-show-when]',
  );

  triggers.forEach((triggerField) => {
    const hidden = triggerField.querySelector('input[type="hidden"]');
    const targetSelector = triggerField.dataset.followupsTarget;
    const target = document.querySelector(targetSelector);
    const showWhen = new Set(splitWhen(triggerField.dataset.followupsShowWhen));

    const isMultiSelect = triggerField.querySelector('.form-input-select-multi-menu');

    if (!hidden || !target || !isMultiSelect) return;

    const apply = () => {
      const selectedValues = String(hidden.value || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      const shouldShow = selectedValues.some((value) => showWhen.has(value));

      target.hidden = !shouldShow;
      setRequiredInArea(target, shouldShow);

      if (!shouldShow) resetFollowupsArea(target);

      queueMicrotask(() => updateNextButtonUI());
    };

    hidden.addEventListener('change', apply);
    apply();
  });
}

// להפעיל אחרי שכל ה-selects אותחלו:
initConditionalFollowups();
initMultiSelectConditionalFollowups();

// ===================
// Default customer on load

function setDefaultCustomer(value) {
  const hidden = document.querySelector('input[type="hidden"][name="customer"]');
  const field = hidden?.closest('.form-field');
  const listbox = field?.querySelector('[role="listbox"]');

  if (!hidden || !field || !listbox) return;

  const opt = listbox.querySelector(`[role="option"][data-value="${CSS.escape(value)}"]`);

  if (opt) {
    // מפעיל את אותו setSelected שלך דרך מאזין ה-click
    opt.click();
  } else {
    // fallback אם לא נמצא (למשל mismatch בשם)
    const valueEl = field.querySelector('[data-select-value]');
    hidden.value = value;
    if (valueEl) valueEl.textContent = value;
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // לוודא שכפתור "המשך" יתעדכן אחרי מילוי ברירת המחדל
  queueMicrotask(() => updateNextButtonUI());
}

document.addEventListener('DOMContentLoaded', () => {
  // רק אם המשתמש עדיין לא בחר לקוח
  const hidden = document.querySelector('input[type="hidden"][name="customer"]');
  if (hidden && !hidden.value) setDefaultCustomer('עיריית פתח תקווה');
});

// ===========================================================
// ניהול יצירת בלוקים של סוג עבודה
// ===========================================================

function suffixIdsByName(groupEl, index) {
  const suffix = `-${index}`;

  groupEl.querySelectorAll('.form-field').forEach((field) => {
    const hidden = field.querySelector('input[type="hidden"][name]');
    const normal = field.querySelector(
      'input:not([type="hidden"])[name], textarea[name], select[name]',
    );
    const baseEl = hidden || normal;
    if (!baseEl) return;

    const base = baseEl.name;
    if (!base) return;

    const label = field.querySelector('label');
    const combobox = field.querySelector('[role="combobox"]');
    const listbox = field.querySelector('[role="listbox"]');

    // Custom select
    if (hidden && combobox && listbox) {
      const labelId = `${base}__label${suffix}`;
      const hiddenId = `${base}${suffix}`;
      const comboId = `${base}__combobox${suffix}`;
      const listId = `${base}__listbox${suffix}`;

      if (label) {
        label.id = labelId;
        label.htmlFor = comboId;
      }

      hidden.id = hiddenId;

      combobox.id = comboId;
      combobox.setAttribute('aria-controls', listId);
      combobox.setAttribute('aria-labelledby', labelId);

      listbox.id = listId;
      return;
    }

    // Normal field
    const newId = `${base}${suffix}`;
    if (label) label.htmlFor = newId;
    baseEl.id = newId;
  });
}

function resetNewGroup(groupEl) {
  groupEl.querySelectorAll('input, textarea').forEach((el) => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });

  groupEl.querySelectorAll('[role="option"]').forEach((opt) => {
    opt.setAttribute('aria-selected', 'false');
    opt.classList.remove('is-active');
  });

  groupEl.querySelectorAll('.form-input-select-multi-chosen').forEach((ul) => {
    ul.textContent = '';
  });
}

const TREE_TYPE_LIMITS_BY_WORK_TYPE = {
  חישוף: ['וושינגטוניה'],
};

const getTreeTypeOptionsForWorkType = (workType) => {
  const allowedValues = TREE_TYPE_LIMITS_BY_WORK_TYPE[workType];

  if (!allowedValues) return treeTypes;

  return treeTypes.filter((tree) => allowedValues.includes(tree.value));
};

function initWorkTypeGroup(groupEl) {
  // 1) Render menus בתוך הבלוק בלבד
  groupEl.querySelectorAll('.form-input-select-menu-work-type').forEach((menu) => {
    renderSelectOptions(menu, workTypes, { showImage: false });
  });

  groupEl
    .querySelectorAll('.form-input-select-menu-work-hour-description')
    .forEach((menu) => {
      renderSelectOptions(menu, workHourTypes, { showImage: false });
    });

  groupEl.querySelectorAll('.form-input-select-menu-tree-type').forEach((menu) => {
    renderSelectOptions(menu, treeTypes, { showImage: false });
  });

  groupEl.querySelectorAll('.form-input-select-menu-tree-bind-type').forEach((menu) => {
    renderSelectOptions(menu, treeBindTypes, { showImage: false });
  });

  // 2) Init selects בתוך הבלוק בלבד
  groupEl.querySelectorAll('.form-field').forEach((field) => {
    if (field.dataset.inited === '1') return;

    if (field.querySelector('.form-input-select-single-menu')) {
      initSingleSelect(field);
      field.dataset.inited = '1';
    } else if (field.querySelector('.form-input-select-multi-menu')) {
      initMultiSelect(field);
      field.dataset.inited = '1';
    }
  });

  const treeTypeField = groupEl
    .querySelector('input[type="hidden"][name="treeType"]')
    ?.closest('.form-field');

  const treeTypeMenu = treeTypeField?.querySelector('.form-input-select-menu-tree-type');

  // 3) Conditional followups בתוך הבלוק (scoped!)
  const followups = groupEl.querySelector('.work-type-followups');
  const workTypeHidden = groupEl.querySelector('input[type="hidden"][name="workType"]');

  if (!followups || !workTypeHidden) return;

  const split = (s) =>
    (s || '')
      .split('|')
      .map((x) => x.trim())
      .filter(Boolean);

  const resetField = (field) => {
    field?._resetMultiSelect?.();
    field.querySelectorAll('input, textarea').forEach((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
      else el.value = '';
      if (el.hasAttribute('data-required-when-visible')) el.required = false;
    });
  };

  const updateTreeTypeOptions = (workTypeValue) => {
    if (!treeTypeField || !treeTypeMenu) return;

    const options = getTreeTypeOptionsForWorkType(workTypeValue);

    renderSelectOptions(treeTypeMenu, options, {
      metaKey: '',
      showImage: false,
    });

    const treeTypeHidden = treeTypeField.querySelector(
      'input[type="hidden"][name="treeType"]',
    );

    if (!treeTypeHidden) return;

    const singleOption = options.length === 1 ? options[0] : null;

    if (singleOption) {
      treeTypeField._setSingleSelectValue?.(singleOption.value);
      return;
    }

    treeTypeHidden.value = '';

    const valueEl = treeTypeField.querySelector('[data-select-value]');
    if (valueEl) valueEl.textContent = '‎';

    treeTypeField.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.setAttribute('aria-selected', 'false');
      opt.classList.remove('is-active');
    });
  };

  const apply = () => {
    const value = workTypeHidden.value;
    let anyVisible = false;

    updateTreeTypeOptions(value);

    followups.querySelectorAll('.form-field[data-show-when]').forEach((field) => {
      const allowed = new Set(split(field.dataset.showWhen));
      const shouldShow = allowed.has(value);

      const generalLabelWhen = new Set(split(field.dataset.generalLabelWhen));
      const labelText = field.querySelector('[data-label-text]');

      if (labelText && field.querySelector('[name="quantity"]')) {
        labelText.textContent = generalLabelWhen.has(value)
          ? 'כמות (כללי)'
          : 'כמות העצים';
      }

      field.hidden = !shouldShow;

      field.querySelectorAll('[data-required-when-visible]').forEach((el) => {
        el.required = shouldShow;
      });

      if (!shouldShow) resetField(field);
      else anyVisible = true;
    });

    followups.hidden = !anyVisible;
    queueMicrotask(() => updateNextButtonUI());
  };

  workTypeHidden.addEventListener('change', apply);
  apply();
}

// ---------- Hook לכפתור הוספה ----------

const btnAdd = document.querySelector('.btn-add-work-type-field');
const container = document.querySelector('[data-work-type-container]');
const tpl = document.querySelector('#template-work-type-group');

function syncWorkTypeRemoveButtons() {
  if (!container) return;

  const groups = container.querySelectorAll('.form-fields-group-work-type');
  const canRemove = groups.length > 1;

  groups.forEach((group) => {
    const btn = group.querySelector('.btn-remove-work-type');
    if (!btn) return;
    btn.hidden = !canRemove; // כשיש רק אחד -> מוסתר
  });
}

if (btnAdd && container && tpl) {
  btnAdd.addEventListener('click', (e) => {
    e.preventDefault();

    const index = container.children.length + 1;
    const group = tpl.content.firstElementChild.cloneNode(true);

    suffixIdsByName(group, index);
    resetNewGroup(group);

    container.prepend(group);
    initWorkTypeGroup(group);
    syncWorkTypeRemoveButtons();
  });
} else {
  console.warn('Missing btnAdd/container/template:', { btnAdd, container, tpl });
}

container.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove-work-type');
  if (!btn) return;

  const groups = container.querySelectorAll('.form-fields-group-work-type');
  if (groups.length <= 1) return; // ✅ לא מאפשר להסיר את האחרון

  const group = btn.closest('.form-fields-group-work-type');
  if (!group) return;

  group.remove();
  syncWorkTypeRemoveButtons();
});

function ensureFirstWorkTypeGroup() {
  if (!container || !tpl) return;

  // אם כבר יש בלוק אחד – לא עושים כלום
  if (container.children.length > 0) return;

  const index = 1;
  const group = tpl.content.firstElementChild.cloneNode(true);

  suffixIdsByName(group, index);
  resetNewGroup(group);

  // הראשון יהיה למטה (מבחינה כרונולוגית 1)
  container.appendChild(group);

  initWorkTypeGroup(group);
  syncWorkTypeRemoveButtons();
}

// להפעיל פעם אחת בטעינה:
ensureFirstWorkTypeGroup();
syncWorkTypeRemoveButtons();

// ===========================================================
// Photos uploader (Step 4) - fill slots by DOM order
// ===========================================================

function initPhotoGridUploader() {
  const fileInput = document.querySelector('#photos');
  const grid = document.querySelector('.photo-grid');

  if (!fileInput || !grid) return;

  const slots = Array.from(grid.querySelectorAll('.photo-slot'));
  const MAX = slots.length;

  // ✅ מערך קבוע לפי כמות slots: כל תא הוא File או null
  let slotFiles = Array(MAX).fill(null);

  const clearInputValue = () => {
    fileInput.value = '';
  };

  const setInputFiles = () => {
    // Note: input.files לא יכול להכיל "חורים" (null),
    // לכן אנחנו שולחים רק את הקבצים הקיימים. הסדר בטופס יהיה קומפקטי.
    const dt = new DataTransfer();
    slotFiles.forEach((f) => {
      if (f) dt.items.add(f);
    });
    fileInput.files = dt.files;
  };

  const render = () => {
    slots.forEach((slot, i) => {
      const uploadBtn = slot.querySelector('[data-upload]');
      const preview = slot.querySelector('[data-preview]');
      const img = slot.querySelector('.photo-preview-img');

      const file = slotFiles[i];

      if (file) {
        if (uploadBtn) uploadBtn.hidden = true;
        if (preview) preview.hidden = false;

        if (img) {
          const url = URL.createObjectURL(file);
          img.src = url;
          img.onload = () => URL.revokeObjectURL(url);
        }
      } else {
        if (uploadBtn) uploadBtn.hidden = false;
        if (preview) preview.hidden = true;

        if (img) img.removeAttribute('src');
      }
    });

    setInputFiles();
  };

  const addFiles = (newFiles) => {
    const incoming = Array.from(newFiles).filter(
      (f) => f && f.type && f.type.startsWith('image/'),
    );

    if (!incoming.length) return;

    for (const file of incoming) {
      const emptyIndex = slotFiles.findIndex((x) => x === null);
      if (emptyIndex === -1) break; // אין מקום
      slotFiles[emptyIndex] = file; // ✅ ממלא את ה-slot הפנוי הבא
    }

    render();
  };

  const removeAt = (slotIndex) => {
    if (slotIndex < 0 || slotIndex >= MAX) return;
    slotFiles[slotIndex] = null; // ✅ מפנה רק את המשבצת הזאת, בלי להזיז אחרות
    render();
  };

  fileInput.addEventListener('change', (e) => {
    addFiles(e.target.files);
    clearInputValue();
  });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.photo-remove');
    if (!btn) return;

    const slot = btn.closest('.photo-slot');
    if (!slot) return;

    const slotIndex = slots.indexOf(slot);
    if (slotIndex === -1) return;

    removeAt(slotIndex);
  });

  render();

  return {
    getFiles: () => slotFiles.filter(Boolean),
    getSlotFiles: () => slotFiles.slice(),
  };
}

const photosApi = initPhotoGridUploader();

// ===========================================================
// Header shadow
// ===========================================================

function initHeaderShadowAfterPassingTitle() {
  const header = document.querySelector('header');
  const title = document.querySelector('.main-title');

  if (!header || !title) return;

  let ticking = false;

  const update = () => {
    const h = header.getBoundingClientRect();
    const t = title.getBoundingClientRect();

    // מרגע שהחלק התחתון של ה-header עבר את החלק התחתון של הכותרת
    const hasPassedTitle = h.bottom >= t.bottom;

    header.classList.toggle('has-shadow', hasPassedTitle);
    ticking = false;
  };

  const onScrollOrResize = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize);

  update();
}

initHeaderShadowAfterPassingTitle();

// =====================================
// Modals
// =====================================

function initCancelModal() {
  const cancelBtn = document.querySelector('.btn-cancel'); // אם יש לך class אחר – תחליף
  const dialog = document.querySelector('#cancelModal');
  const confirmBtn = document.querySelector('#btnConfirmCancel');

  if (!cancelBtn || !dialog || !confirmBtn) return;

  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    dialog.showModal();
  });

  // אם המשתמש לחץ על "כן, מחק טופס"
  confirmBtn.addEventListener('click', (e) => {
    // הדיאלוג ייסגר אוטומטית כי זה submit בתוך method="dialog"
    // אבל אנחנו רוצים גם רענון:
    // נותנים לדפדפן לסגור ואז מרעננים
    setTimeout(() => window.location.reload(), 0);
  });

  // סגירה בלחיצה על הרקע (אופציונלי אבל נוח)
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

initCancelModal();

// ===========================================================
// Multi-submit helpers (one payload per work-type group)
// ===========================================================

function isSuccessfulControl(el) {
  if (el.type === 'file' && el.name === 'photos') return;
  if (!el || !el.name || el.disabled) return false;
  if (el.type === 'submit' || el.type === 'button') return false;
  if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return false;
  return true;
}

function appendControlToFormData(fd, el) {
  if (el.type === 'file' && el.name === 'photos') return;
  if (!isSuccessfulControl(el)) return;

  // file inputs אחרים (אם יהיו)
  if (el.type === 'file') {
    Array.from(el.files || []).forEach((f) => fd.append(el.name, f, f.name));
    return;
  }

  // select multiple
  if (el.tagName === 'SELECT' && el.multiple) {
    Array.from(el.selectedOptions).forEach((opt) => fd.append(el.name, opt.value));
    return;
  }

  fd.append(el.name, el.value);
}

function buildBaseFormData(form, workTypeGroups) {
  const fd = new FormData();
  const controls = form.querySelectorAll('input, select, textarea');

  controls.forEach((el) => {
    // אל תכלול שדות שנמצאים בתוך אף בלוק של "סוג עבודה"
    const insideWorkType = workTypeGroups.some((g) => g.contains(el));
    if (insideWorkType) return;

    appendControlToFormData(fd, el);
  });

  return fd;
}

function appendWorkTypeGroup(fd, group) {
  const controls = group.querySelectorAll('input, select, textarea');
  controls.forEach((el) => appendControlToFormData(fd, el));
}

// =================================
// Testing
// =================================

async function submitAllWorkTypePayloads({ form, photosApi }) {
  const workTypeGroups = Array.from(
    document.querySelectorAll('.form-fields-group-work-type'),
  );

  if (workTypeGroups.length === 0) return false;

  // בסיס: כל הטופס חוץ מבלוקי סוג עבודה
  const baseFd = buildBaseFormData(form, workTypeGroups);

  // תמונות: זהה בכל שליחה
  const photos = photosApi?.getFiles?.() ?? [];

  // בעתיד: תחליף את זה ל-true רק אם כל ה-fetch הצליחו
  let allOk = true;

  for (let i = 0; i < workTypeGroups.length; i++) {
    const group = workTypeGroups[i];

    const fd = new FormData();
    for (const [k, v] of baseFd.entries()) fd.append(k, v);

    appendWorkTypeGroup(fd, group);

    // תמונות
    fd.delete('photos');
    photos.forEach((file) => fd.append('photos', file, file.name));

    // --- בעתיד: שליחה אמיתית ---
    // const res = await fetch('/your-endpoint', { method: 'POST', body: fd });
    // if (!res.ok) allOk = false;
  }

  return allOk;
}

// ===============================================
// Fireberry payload builder (one record)

function formDataToObject(fd) {
  const obj = {};

  for (const [key, value] of fd.entries()) {
    // מדלגים על קבצים כאן (מטופלים בנפרד)
    if (value instanceof File) continue;

    if (obj[key] === undefined) obj[key] = value;
    else obj[key] = Array.isArray(obj[key]) ? [...obj[key], value] : [obj[key], value];
  }
  return obj;
}

function buildFireberryPayload({ baseFd, workTypeGroupFd = new FormData() }) {
  // baseFd = כל השדות הכלליים (ללא workType group)
  // workTypeGroupFd = השדות של בלוק סוג עבודה אחד בלבד
  const baseObj = formDataToObject(baseFd);
  const groupObj = formDataToObject(workTypeGroupFd);

  // מאחדים (group override אם יש התנגשות, לרוב אין)
  const merged = { ...baseObj, ...groupObj };

  // ממפים ל-fieldName של Fireberry
  const fields = {};

  for (const [formKey, formValue] of Object.entries(merged)) {
    const fbFieldName = FB_FIELDS[formKey];

    if (!fbFieldName) continue; // אם אין mapping – מדלגים

    // נרמול בסיסי:
    // מספרים שהגיעו כמחרוזת -> מספר
    if (formKey === 'quantity') {
      const raw = String(formValue ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isNaN(n)) fields[fbFieldName] = n;
      continue;
    }

    if (formKey === 'treeBindLength') {
      const raw = String(formValue ?? '').trim();
      if (raw === '') continue; // ריק => לא שולחים בכלל
      const n = Number(raw);
      if (!Number.isNaN(n)) fields[fbFieldName] = n; // ✅ מספר אמיתי
      continue;
    }

    if (formKey === 'transportsCount') {
      const raw = String(formValue ?? '').trim();
      if (raw === '') continue; // אם ריק – לא שולחים
      const n = Number(raw);
      if (!Number.isNaN(n)) fields[fbFieldName] = n; // ✅ מספר אמיתי
      continue;
    }

    const raw = String(formValue ?? '').trim();
    if (raw === '') continue;

    // כל השאר כטקסט/מחרוזת כפי שנשלח
    fields[fbFieldName] = formValue;
  }

  return {
    objectCode: FB_OBJECT,
    fields,
  };
}

// ===============================================

let retryLastSubmit = null;

if (btnSubmitClose) {
  btnSubmitClose.addEventListener('click', () => {
    hideSubmitIndicator();
  });
}

if (btnSubmitRetry) {
  btnSubmitRetry.addEventListener('click', () => {
    if (typeof retryLastSubmit === 'function') {
      showSubmitLoading();
      retryLastSubmit();
    }
  });
}

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const runSubmit = async () => {
    const prevNextDisabled = btnNext?.disabled;

    if (btnNext) btnNext.disabled = true;

    try {
      // 1) איסוף כל בלוקי "סוג עבודה"
      const workTypeGroups = Array.from(
        document.querySelectorAll('.form-fields-group-work-type'),
      );

      if (!skipWorkTypeStep && workTypeGroups.length === 0) {
        hideSubmitIndicator();

        if (btnNext) btnNext.disabled = prevNextDisabled ?? false;
        return;
      }

      // 2) Base FD: כל הטופס חוץ מבלוקי סוג עבודה
      const baseFd = buildBaseFormData(form, workTypeGroups);

      // 2.5) Build payloads
      let payloads;

      if (skipWorkTypeStep) {
        // ✅ מדלגים על שלב 3 => שולחים רשומה אחת בלבד בלי שום שדות של סוג עבודה
        payloads = [
          buildFireberryPayload({
            baseFd,
            workTypeGroupFd: new FormData(), // ריק בכוונה
          }),
        ];
      } else {
        // רגיל: רשומה לכל בלוק "סוג עבודה"
        payloads = workTypeGroups.map((group) => {
          const groupFd = new FormData();
          group.querySelectorAll('input, select, textarea').forEach((el) => {
            appendControlToFormData(groupFd, el);
          });

          return buildFireberryPayload({
            baseFd,
            workTypeGroupFd: groupFd,
          });
        });
      }

      // 2.6) multipart submit: payloads + photos
      const submitFd = new FormData();
      submitFd.append('dryRun', String(APP_FLAGS.dryRun));
      submitFd.append('payloads', JSON.stringify(payloads));

      const originalPhotos = photosApi?.getFiles?.() ?? [];

      if (submitIndicatorText) submitIndicatorText.textContent = 'דוחס תמונות...';
      await nextPaint(); // ✅ נותן למסך להתעדכן לפני הדחיסה הכבדה

      const photos = await compressPhotosSequential(
        originalPhotos,
        (done, total) => {
          if (submitIndicatorText) {
            submitIndicatorText.textContent = `דוחס תמונות... (${done}/${total})`;
          }
        },
        COMPRESSION_CFG,
      );

      const totalBytes = photos.reduce((sum, f) => sum + (f?.size || 0), 0);

      if (totalBytes > COMPRESSION_CFG.maxTotalBytes) {
        showSubmitError(
          `התמונות גדולות מדי לשליחה (${bytesToMB(totalBytes)}MB). נסה לבחור פחות תמונות או תמונות קטנות יותר.`,
        );
        if (btnNext) btnNext.disabled = prevNextDisabled ?? false;
        return;
      }

      if (submitIndicatorText) submitIndicatorText.textContent = 'שולח טופס...';

      // הוספה ל-FormData: הקבצים הדחוסים בלבד
      photos.forEach((file) => submitFd.append('photos', file, file.name));

      // ⚠️ לא להוסיף Content-Type ידנית — הדפדפן מוסיף boundary
      const res = await fetch(API_URL, { method: 'POST', body: submitFd });
      const out = await res.json().catch(() => null);

      // אם השרת/פונקציה החזירו HTTP שגיאה:
      if (!res.ok) {
        showSubmitError(out?.error || out?.message || `HTTP ${res.status}`);
        if (btnNext) btnNext.disabled = prevNextDisabled ?? false;
        return;
      }

      // אם הפונקציה החזירה ok:false (create/upload נכשל)
      if (out?.ok === false) {
        // נסיון למצוא סיבה טובה מתוך results/uploads
        const firstCreateFail = out?.results?.find?.((r) => r?.ok === false);
        const firstUploadFail = out?.uploads?.find?.((u) => u?.ok === false);

        const detail =
          out?.error ||
          firstUploadFail?.response?.Message ||
          firstUploadFail?.response?.message ||
          firstUploadFail?.response?.raw ||
          firstCreateFail?.response?.Message ||
          firstCreateFail?.response?.message ||
          firstCreateFail?.response?.raw ||
          'השליחה נכשלה. נסו שוב.';

        showSubmitError(detail);
        if (btnNext) btnNext.disabled = prevNextDisabled ?? false;
        return;
      }

      // הצלחה: redirect אם צריך
      if (!APP_FLAGS.dryRun && out?.ok && APP_FLAGS.redirectOnSubmit) {
        window.location.href = ROUTES.success;
        return;
      }

      // הצלחה בלי redirect (dryRun וכו')
      hideSubmitIndicator();
      if (btnNext) btnNext.disabled = prevNextDisabled ?? false;
    } catch (err) {
      showSubmitError(err?.message || 'תקלה ברשת/שרת. נסו שוב.');
      if (btnNext) btnNext.disabled = prevNextDisabled ?? false;
    }
  };

  // לשמור ל-Retry
  retryLastSubmit = runSubmit;

  // להתחיל שליחה
  showSubmitLoading();
  runSubmit();
});
