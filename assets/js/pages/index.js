import { workers } from '../data/workers.js';
import { vehicles } from '../data/vehicles.js';
import { customers } from '../data/customers.js';
import { workTypes } from '../data/workTypes.js';
import { workHourTypes } from '../data/workHourTypes.js';
import { treeTypes } from '../data/treeTypes.js';
import { treeBindTypes } from '../data/treeBindTypes.js';

const form = document.querySelector('form');
const formSteps = [...document.querySelectorAll('.steps > fieldset')];
const titleStageIndicator = document.querySelector(
  '.main-title-stage-indicator .container',
);
const titleStageIndicatorItem = titleStageIndicator.querySelector('li');
const footerStageIndicator = [...document.querySelectorAll('.footer-stage-indicator li')];

const btnPrev = document.querySelector('.footer-button-prev');
const btnNext = document.querySelector('.footer-button-next');

const scrollToTop = () => {
  window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
};

let currentStep = formSteps.findIndex((step) => step.classList.contains('current-step'));

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

    currentStep += 1;

    formSteps[currentStep].classList.add('current-step');
    footerStageIndicator[currentStep].classList.add('current-step');

    titleStageIndicator.style.transform = `translateY(-${
      titleStageIndicatorItem.getBoundingClientRect().height * currentStep
    }px)`;

    if (currentStep >= 1) {
      btnNext.style.width = 'calc(85% - 0.5rem)';
    }

    // חשוב
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
    currentStep -= 1;

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

// ===================

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

// ===================
// Initiate select types

function initSelectBase(root) {
  const combobox = root.querySelector('[role="combobox"]');
  const listbox = root.querySelector('[role="listbox"]');
  const valueEl = root.querySelector('[data-select-value]');
  const imgEl = root.querySelector('[data-select-img]');
  const hiddenInput = root.querySelector('input[type="hidden"]');
  const options = () => Array.from(listbox.querySelectorAll('[role="option"]')); // חשוב: דינמי

  let activeIndex = -1;

  const scrollMenuFullyIntoView = (gap = 16) => {
    requestAnimationFrame(() => {
      const rect = listbox.getBoundingClientRect();
      const vh = window.innerHeight;

      // כמה "יוצא" מהמסך למטה / למעלה
      const overflowBottom = rect.bottom - (vh - gap);
      const overflowTop = gap - rect.top;

      if (overflowBottom > 0) {
        window.scrollBy({ top: overflowBottom, behavior: 'smooth' });
      } else if (overflowTop > 0) {
        window.scrollBy({ top: -overflowTop, behavior: 'smooth' });
      }
    });
  };

  const isOpen = () => combobox.getAttribute('aria-expanded') === 'true';

  const open = () => {
    combobox.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;

    scrollMenuFullyIntoView(16);

    const opts = options();
    const selectedIndex = opts.findIndex(
      (o) => o.getAttribute('aria-selected') === 'true',
    );
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActive(activeIndex);
  };

  const close = () => {
    combobox.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    clearActive();
    activeIndex = -1;
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
    const next = Math.max(0, Math.min(opts.length - 1, activeIndex + dir));
    activeIndex = next;
    setActive(activeIndex);
  };

  // toggle פתיחה
  combobox.addEventListener('click', toggle);

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
  };
}

function initSingleSelect(root) {
  const base = initSelectBase(root);

  const setSelected = (opt) => {
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

    base.close(); // נסגר בבחירה
    base.combobox.focus();
  };

  // קליק על אופציות
  base.listbox.addEventListener('click', (e) => {
    const opt = e.target.closest('[role="option"]');
    if (opt) setSelected(opt);
  });

  // Enter/Space בוחר אופציה פעילה
  base.combobox.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && base.isOpen()) {
      e.preventDefault();
      const active = base.listbox.querySelector('.is-active');
      if (active) setSelected(active);
    }
  });
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

  root._resetMultiSelect = reset; // מאפשר לקרוא מבחוץ
}

// ===================
// Render select menus

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

// ===================

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
const teamMemberRoles = new Set(['עובד']);

const teamLeadsFilter = workers.filter((w) => teamLeadRoles.has(w.role));
const teamMembersFilter = workers.filter((w) => teamMemberRoles.has(w.role));

renderSelectOptions(teamLeadSelectMenu, teamLeadsFilter, {
  metaKey: 'role',
  showImage: true,
});

renderSelectOptions(teamMembersSelectMenu, teamMembersFilter, {
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

// הפעלה לכל select כזה בדף:
document.querySelectorAll('.form-field').forEach((field) => {
  if (field.querySelector('.form-input-select-single-menu')) {
    initSingleSelect(field);
  } else if (field.querySelector('.form-input-select-multi-menu')) {
    initMultiSelect(field);
  }
});

// ===================
// שדות המשך

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

// להפעיל אחרי שכל ה-selects אותחלו:
initConditionalFollowups();

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

  // 3) Conditional followups בתוך הבלוק (scoped!)
  const followups = groupEl.querySelector('.work-type-followups');
  const workTypeHidden = groupEl.querySelector('input[type="hidden"][name="work-type"]');

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

  const apply = () => {
    const value = workTypeHidden.value;
    let anyVisible = false;

    followups.querySelectorAll('.form-field[data-show-when]').forEach((field) => {
      const allowed = new Set(split(field.dataset.showWhen));
      const shouldShow = allowed.has(value);

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
  if (!el || !el.name || el.disabled) return false;
  if (el.type === 'submit' || el.type === 'button') return false;
  if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) return false;
  return true;
}

function appendControlToFormData(fd, el) {
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
    fd.delete('photos[]');
    photos.forEach((file) => fd.append('photos[]', file, file.name));

    // --- בעתיד: שליחה אמיתית ---
    // const res = await fetch('/your-endpoint', { method: 'POST', body: fd });
    // if (!res.ok) allOk = false;
  }

  return allOk;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // (אם תרצה להשאיר) ולידציה אחרונה
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const ok = await submitAllWorkTypePayloads({ form, photosApi });

  // כרגע תמיד ok=true (כל עוד לא עשית fetch) — אבל זה כבר תשתית לעתיד
  if (ok) {
    window.location.href = '/success';
  } else {
    // תשתית לעתיד: הודעת שגיאה במקום redirect
    console.error('Submit failed — stay on form.');
  }
});
