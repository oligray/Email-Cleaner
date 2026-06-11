function getPreviousCursor(currentFromDate, windowSizeMonths) {
  const baseDate = currentFromDate instanceof Date ? new Date(currentFromDate) : new Date(currentFromDate || Date.now());
  const months = Math.max(1, Number(windowSizeMonths) || 1);

  baseDate.setMonth(baseDate.getMonth() - months);
  return baseDate;
}

function getCursor() {
  return browser.storage.local.get('cursorDate').then((result) => {
    const rawValue = result && Object.prototype.hasOwnProperty.call(result, 'cursorDate') ? result.cursorDate : null;

    if (!rawValue) {
      return null;
    }

    const value = new Date(rawValue);
    return Number.isNaN(value.getTime()) ? null : value;
  });
}

function setCursor(date) {
  const value = date instanceof Date ? date.toISOString() : null;
  return browser.storage.local.set({ cursorDate: value });
}

function getWindowSize() {
  return browser.storage.local.get('windowSizeMonths').then((result) => {
    const value = Number(result && result.windowSizeMonths ? result.windowSizeMonths : 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
}
