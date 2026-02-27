import { DateTime } from 'luxon';

export default {
  write(message: string) {
    const debugLogElement = document.querySelector('#debug-log code');
    if (!debugLogElement) return;
    const prettyMessage = `${DateTime.now().toFormat('HH:mm:ss.SSS')} > ${message}`;
    const divEl = document.createElement('div');
    divEl.textContent = prettyMessage;
    debugLogElement.appendChild(divEl);
  },
};
