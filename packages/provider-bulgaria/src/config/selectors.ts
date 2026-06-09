export const SELECTORS = {
  // Language switch
  languageRadio: (lang: string) => `input[value="${lang}"]`,
  languageForm: 'form[action*="ChangeCulture"]',

  // Validity period page - links to choose vignette duration
  vignetteLink: (typeId: number) => `a[href*="vignetteTypeID=${typeId}"]`,

  // Create/Purchase form (actual BGToll field IDs)
  countryDropdown: '#ddlVehicleNationality, select[id*="ountry"], select[name*="ountry"]',
  plateInput: '#txtLicensePlateNumber, input[id*="late"], input[name*="late"]',
  dateInput: '#dpRequestValidityDate, #cbRequestValidityDate, input[id*="Date"], input[id*="date"]',
  timeDropdown: '#dpRequestValidityTime, select[id*="ime"], select[name*="Time"]',
  weekendDropdown: '#ddlWeekends',
  emailInput: '#txtEmail, input[type="email"], input[id*="mail"]',
  termsCheckbox: 'input[type="checkbox"][id*="erm"], input[type="checkbox"][name*="erm"]',
  allCheckboxes: 'input[type="checkbox"]',
  confirmButton: '#btnConfirm, button[type="submit"], input[type="submit"], .btn-primary',

  // Confirmation dialog (SweetAlert / modal)
  sweetAlertPopup: '.swal2-popup, .sweet-alert, .modal.show',
  sweetAlertConfirm: '.swal2-confirm, .confirm, .modal .btn-primary',
  sweetAlertCancel: '.swal2-cancel, .cancel',

  // reCAPTCHA
  recaptchaFrame: 'iframe[src*="recaptcha"]',
  recaptchaDiv: '.g-recaptcha, [data-sitekey]',
  recaptchaResponse: 'textarea[name="g-recaptcha-response"], #g-recaptcha-response',

  // Verification page
  verifyCountryDropdown: 'select[id*="ountry"], select[name*="ountry"]',
  verifyPlateInput: 'input[id*="late"], input[name*="late"], input[id*="egistration"]',
  verifyStatusRadio: (status: string) => `input[type="radio"][value="${status}"]`,
  verifySearchButton: 'button[type="submit"], input[type="submit"], #btnSearch',
  verifyResultsTable: 'table, .table, .results',

  // Generic
  errorMessage: '.alert-danger, .error-message, .validation-summary-errors',
  loadingSpinner: '.loading, .spinner, [class*="loading"]',
} as const;
