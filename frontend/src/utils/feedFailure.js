// F-04: one place that turns a failed API pull into a reader-facing state.
// Raw technical text (HTTP codes, "Unexpected token <") never reaches the page.
export function classifyFailure(error, status) {
  if (error && error.name === 'AbortError') return { kind: 'timeout', status: null };
  if (Number.isInteger(status) && status > 0) return { kind: 'http', status };
  if (error && (error.name === 'SyntaxError' || error.rwInvalid)) return { kind: 'invalid', status: null };
  return { kind: 'network', status: null };
}

const TEXT = {
  ru: {
    timeout: 'Сервер долго не отвечает.',
    busy: 'Слишком много запросов. Попробуйте через минуту.',
    down: 'Сервер временно недоступен.',
    code: n => 'Сервер ответил ошибкой (код ' + n + ').',
    invalid: 'Сервер прислал повреждённые данные.',
    network: 'Нет связи с сервером. Проверьте подключение.',
    auto: 'Попробуем снова автоматически.',
    stale: time => 'Не удалось обновить. Показаны данные на ' + time + '.',
    retry: 'Повторить',
    refresh: 'Обновить',
  },
  he: {
    timeout: 'השרת לא מגיב זמן רב.',
    busy: 'יותר מדי בקשות. נסו שוב בעוד דקה.',
    down: 'השרת אינו זמין זמנית.',
    code: n => 'השרת החזיר שגיאה (קוד ' + n + ').',
    invalid: 'השרת שלח נתונים פגומים.',
    network: 'אין חיבור לשרת. בדקו את החיבור.',
    auto: 'ננסה שוב אוטומטית.',
    stale: time => 'העדכון נכשל. מוצגים נתונים מ־' + time + '.',
    retry: 'נסו שוב',
    refresh: 'רענון',
  },
};

export function failureText(failure, he) {
  const L = TEXT[he ? 'he' : 'ru'];
  if (!failure) return '';
  if (failure.kind === 'timeout') return L.timeout;
  if (failure.kind === 'invalid') return L.invalid;
  if (failure.kind === 'network') return L.network;
  if (failure.status === 429) return L.busy;
  if (failure.status >= 500) return L.down;
  return L.code(failure.status);
}

export function feedLabels(he) {
  return TEXT[he ? 'he' : 'ru'];
}
