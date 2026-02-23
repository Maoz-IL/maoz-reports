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

function initCustomSelect(root) {
  const combobox = root.querySelector('[role="combobox"]');
  const listbox = root.querySelector('[role="listbox"]');
  const valueEl = root.querySelector('[data-select-value]');
  const hiddenInput = root.querySelector('input[type="hidden"]');
  const options = Array.from(root.querySelectorAll('[role="option"]'));

  let activeIndex = -1;

  const isOpen = () => combobox.getAttribute('aria-expanded') === 'true';

  const open = () => {
    combobox.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;

    // קבע active לאופציה נבחרת אם קיימת, אחרת ראשונה
    const selectedIndex = options.findIndex(
      (o) => o.getAttribute('aria-selected') === 'true',
    );
    activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActive(activeIndex);

    // פוקוס נשאר על הכפתור; אנחנו רק מדגישים אופציה
  };

  const close = () => {
    combobox.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    clearActive();
    activeIndex = -1;
  };

  const toggle = () => (isOpen() ? close() : open());

  const setSelected = (opt) => {
    options.forEach((o) => o.setAttribute('aria-selected', 'false'));
    opt.setAttribute('aria-selected', 'true');

    const label = opt.textContent.trim();
    const value = opt.dataset.value ?? label;

    valueEl.textContent = label;
    hiddenInput.value = value;

    close();
    combobox.focus();
  };

  const setActive = (index) => {
    options.forEach((o) => o.classList.remove('is-active'));
    const opt = options[index];
    if (!opt) return;
    opt.classList.add('is-active');

    // גלילה פנימית אם צריך
    opt.scrollIntoView({ block: 'nearest' });
  };

  const clearActive = () => {
    options.forEach((o) => o.classList.remove('is-active'));
  };

  const moveActive = (dir) => {
    if (!isOpen()) open();
    const next = Math.max(0, Math.min(options.length - 1, activeIndex + dir));
    activeIndex = next;
    setActive(activeIndex);
  };

  // Clicks
  combobox.addEventListener('click', toggle);

  options.forEach((opt, idx) => {
    opt.addEventListener('click', () => setSelected(opt));
    opt.addEventListener('mousemove', () => {
      if (!isOpen()) return;
      activeIndex = idx;
      setActive(activeIndex);
    });
  });

  // Keyboard on combobox
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
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen()) open();
        else if (activeIndex >= 0) setSelected(options[activeIndex]);
        break;
      case 'Escape':
        if (isOpen()) {
          e.preventDefault();
          close();
        }
        break;
      case 'Tab':
        // תן לטאב לצאת, אבל סגור לפני
        close();
        break;
    }
  });

  // Close when clicking outside
  document.addEventListener('pointerdown', (e) => {
    if (!root.contains(e.target)) close();
  });

  // אם תרצה placeholder אמיתי כשהערך ריק:
  const placeholder = combobox.dataset.placeholder || '‎';
  if (!hiddenInput.value) valueEl.textContent = placeholder;
}

// הפעלה לכל select כזה בדף:
document.querySelectorAll('.form-field').forEach((field) => {
  if (field.querySelector('[role="combobox"][aria-controls]')) {
    initCustomSelect(field);
  }
});
