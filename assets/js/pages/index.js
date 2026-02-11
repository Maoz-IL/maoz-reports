const formSteps = [...document.querySelectorAll('form fieldset')];
const titleStageIndicator = document.querySelector(
  '.main-title-stage-indicator .container',
);
const titleStageIndicatorItem = titleStageIndicator.querySelector('li');
const footerStageIndicator = [...document.querySelectorAll('.footer-stage-indicator li')];

const btnPrev = document.querySelector('.footer-button-prev');
const btnNext = document.querySelector('.footer-button-next');

let currentStep = formSteps.findIndex((step) => step.classList.contains('current-step'));

btnNext.addEventListener('click', () => {
  if (currentStep < formSteps.length - 1) {
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
