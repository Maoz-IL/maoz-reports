import { workers } from '../data/workers.js';
import { vehicles } from '../data/vehicles.js';
import { customers } from '../data/customers.js';

const formSteps = [...document.querySelectorAll('form fieldset')];
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

btnNext.addEventListener('click', () => {
  if (currentStep < formSteps.length - 1) {
    scrollToTop();

    formSteps[currentStep].classList.remove('current-step');

    currentStep += 1;
    formSteps[currentStep].classList.add('current-step');
    footerStageIndicator[currentStep].classList.add('current-step');
    titleStageIndicator.style.transform = `translateY(-${titleStageIndicatorItem.getBoundingClientRect().height * currentStep}px)`;

    if (currentStep >= 1) {
      btnNext.style.width = 'calc(85% - 0.5rem)';
    }
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
      renderChips();
    });
  }

  // init מצב התחלתי
  updateButtonText();
  syncHiddenInput();
  renderChips();

  const reset = () => {
    selected.clear(); // ✅ זה מה שהיה חסר

    // אפס aria-selected ברשימה
    base.listbox.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.setAttribute('aria-selected', 'false');
    });

    updateButtonText();
    syncHiddenInput();
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
        ${img ? `<img class="option-image" src="${img}" alt="${alt}" loading="lazy" decoding="async">` : ''}
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
    };

    hidden.addEventListener('change', apply);
    apply(); // הרצה ראשונית
  });
}

// להפעיל אחרי שכל ה-selects אותחלו:
initConditionalFollowups();
