const formSteps = [...document.querySelectorAll('form fieldset')];
const titleStageIndicator = document.querySelector(
  '.main-title-stage-indicator .container',
);
const titleStageIndicatorItem = titleStageIndicator.querySelector('li');
const footerStageIndicator = [...document.querySelectorAll('.footer-stage-indicator li')];
const btnNext = document.querySelector('.footer-button-next');

let currentStep = formSteps.findIndex((step) => step.classList.contains('current-step'));

btnNext.addEventListener('click', () => {
  if (currentStep < formSteps.length - 1) {
    formSteps[currentStep].classList.remove('current-step');

    currentStep += 1;
    formSteps[currentStep].classList.add('current-step');
    footerStageIndicator[currentStep].classList.add('current-step');
    titleStageIndicator.style.transform = `translateY(-${titleStageIndicatorItem.getBoundingClientRect().height * currentStep}px)`;
  }
});
