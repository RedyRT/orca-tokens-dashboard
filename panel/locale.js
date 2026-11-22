const en = {
  title: 'Usage overview', subtitle: 'OMP & Pi · Local usage history', refresh: 'Refresh', language: 'Dashboard language',
  quotaTitle: 'Codex usage left', quotaLoading: 'Checking Codex limits…', quotaEmpty: 'No Codex limits reported by OMP.',
  quotaUnavailable: 'Codex limits unavailable. Check that OMP is installed and signed in, then refresh.',
  quotaStale: 'Could not update Codex limits. Showing the last available values.',
  quotaPartial: 'Could not check limits for every Codex account.',
  quotaChecked: at => `Last checked: ${at}`, quotaAccount: n => `Account ${n}`, quotaRemaining: window => `Quota left · ${window}`,
  quotaResets: time => `Resets in ${time}`, quotaResetDue: 'Reset due', quotaCredits: (n, times) => `Reset credits: ${n}${times ? ` · Expire: ${times}` : ''}`,
  period: 'Period', hour: '1 hour', day: '24 hours', week: '7 days', month: '30 days', workspace: 'Workspace', provider: 'Provider', model: 'Model',
  allWorkspaces: 'All workspaces', allProviders: 'All providers', allModels: 'All models',
  loading: 'Loading local usage…', active: 'Watching local journals', empty: 'No OMP/Pi session journals found',
  noEvents: 'No events for these filters', error: 'Could not read usage. Check the session folders in settings, then refresh.',
  unavailable: 'Open this panel in the Orca desktop app.', incomplete: 'Some journal data is unavailable; see Measurement coverage.',
  stale: 'Showing the last available snapshot.', settingsError: 'Could not save the dashboard language.',
  activity: 'Ends at last activity', now: 'Ends at current time', local: 'local time', minutes: n => `${n} min intervals`,
  cost: 'Cost', tokens: 'Tokens', sessions: 'Sessions', tools: 'Tool calls', noData: 'No data',
  reported: 'Source estimate', tokenHint: 'Input + output', measurements: (a, b) => `${a} of ${b} measured`, sessionHint: 'Unique recorded sessions',
  toolsHint: (a, b) => `${a} successful · ${b} failed`, successes: 'Successful', failed: 'Failed', unknown: 'Unknown', other: 'Other', total: 'total',
  outcomes: 'Tool outcomes', usage: 'Tool usage', models: 'Sessions by model', tokensTime: 'Tokens over time', costTime: 'Cost over time',
  tokenTypes: 'Token types', tokensModel: 'Tokens by model', costModel: 'Cost by model', cache: 'Cache efficiency', toolTime: 'Tool frequency',
  input: 'Input', output: 'Output', cached: 'Cached input', cacheRate: 'Cache share', details: 'Inspect intervals', interval: 'Select a time interval',
  baseline: 'Empty intervals follow the baseline for display only; their values remain unknown.',
  coverage: 'Measurement coverage', coverageSource: 'Only OMP and Pi journals on this machine are included, including sessions run outside Orca. Other providers and remote hosts are not read.',
  coverageTimestamp: 'Usage appears when a complete response is written. Cost is a source estimate, not a subscription bill. Cached tokens are already included in input.',
  coverageSessions: 'One session can use multiple models. Auxiliary model calls add usage, not conversation responses.',
  skipped: n => `${n} invalid or unsupported journal rows skipped.`, unlinked: n => `${n} tool results had no recorded call.`,
  readIssues: n => `${n} sources could not be read. Some totals may be incomplete.`, watcherIssues: n => `${n} session folders could not be watched. Refresh to check for changes.`,
  calls: (main, aux) => `${main} model responses · ${aux} auxiliary calls`,
}
const ru = {
  title: 'Обзор использования', subtitle: 'OMP и Pi · Локальная история расхода', refresh: 'Обновить', language: 'Язык дашборда',
  quotaTitle: 'Остаток лимита Codex', quotaLoading: 'Проверяем лимиты Codex…', quotaEmpty: 'OMP не вернул лимиты Codex.',
  quotaUnavailable: 'Лимиты Codex недоступны. Проверьте, что OMP установлен и вход выполнен, затем обновите данные.',
  quotaStale: 'Не удалось обновить лимиты Codex. Показаны последние доступные данные.',
  quotaPartial: 'Не удалось проверить лимиты всех аккаунтов Codex.',
  quotaChecked: at => `Последняя проверка: ${at}`, quotaAccount: n => `Аккаунт ${n}`, quotaRemaining: window => `Остаток лимита · ${window}`,
  quotaResets: time => `Сброс через ${time}`, quotaResetDue: 'Срок сброса наступил', quotaCredits: (n, times) => `Досрочные сбросы: ${n}${times ? ` · Истекают: ${times}` : ''}`,
  period: 'Период', hour: '1 час', day: '24 часа', week: '7 дней', month: '30 дней', workspace: 'Пространство', provider: 'Провайдер', model: 'Модель',
  allWorkspaces: 'Все пространства', allProviders: 'Все провайдеры', allModels: 'Все модели',
  loading: 'Загрузка локальной истории…', active: 'Наблюдение за локальными журналами', empty: 'Журналы сессий OMP/Pi не найдены',
  noEvents: 'Нет событий для выбранных фильтров', error: 'Не удалось прочитать статистику. Проверьте папки сессий в настройках и нажмите «Обновить».',
  unavailable: 'Откройте эту панель в настольной Orca.', incomplete: 'Часть данных недоступна; см. «Покрытие измерений».',
  stale: 'Показан последний доступный снимок.', settingsError: 'Не удалось сохранить язык дашборда.',
  activity: 'До последней активности', now: 'До текущего времени', local: 'местное время', minutes: n => `интервал ${n} мин`,
  cost: 'Стоимость', tokens: 'Токены', sessions: 'Сессии', tools: 'Вызовы инструментов', noData: 'Нет данных',
  reported: 'Оценка источника', tokenHint: 'Входные + выходные', measurements: (a, b) => `${a} из ${b} измерено`, sessionHint: 'Уникальные записанные сессии',
  toolsHint: (a, b) => `${a} успешно · ${b} с ошибкой`, successes: 'Успешно', failed: 'Ошибка', unknown: 'Неизвестно', other: 'Другие', total: 'всего',
  outcomes: 'Результаты инструментов', usage: 'Использование инструментов', models: 'Сессии по моделям', tokensTime: 'Токены во времени', costTime: 'Стоимость во времени',
  tokenTypes: 'Типы токенов', tokensModel: 'Токены по моделям', costModel: 'Стоимость по моделям', cache: 'Эффективность кэша', toolTime: 'Частота инструментов',
  input: 'Входные', output: 'Выходные', cached: 'Из кэша', cacheRate: 'Доля кэша', details: 'Показать интервалы', interval: 'Выбрать интервал',
  baseline: 'Линия проходит по основанию в пустых интервалах только для отображения; их значения остаются неизвестными.',
  coverage: 'Покрытие измерений', coverageSource: 'Учитываются только локальные журналы OMP и Pi, включая сессии вне Orca. Другие провайдеры и удалённые машины не читаются.',
  coverageTimestamp: 'Расход появляется после записи полного ответа. Стоимость — оценка из источника, а не счёт за подписку. Кэш уже включён во входные токены.',
  coverageSessions: 'Одна сессия может использовать несколько моделей. Вспомогательные вызовы добавляют расход, но не ответы в диалоге.',
  skipped: n => `Пропущено повреждённых или неподдерживаемых записей: ${n}.`, unlinked: n => `Результатов инструмента без записи о вызове: ${n}.`,
  readIssues: n => `Не удалось прочитать источники: ${n}. Данные могут быть неполными.`, watcherIssues: n => `Наблюдение недоступно для ${n} папок. Нажмите «Обновить», чтобы перечитать историю.`,
  calls: (main, aux) => `Ответы модели: ${main} · вспомогательные вызовы: ${aux}`,
}

export function locale(language) {
  const tag = language === 'ru' ? 'ru-RU' : 'en-US'
  const integer = new Intl.NumberFormat(tag)
  const compact = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 2 })
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 })
  const percent = new Intl.NumberFormat(tag, { style: 'percent', maximumFractionDigits: 1 })
  const time = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const day = new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric' })
  const full = new Intl.DateTimeFormat(tag, { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' })
  return { copy: language === 'ru' ? ru : en, integer: integer.format, compact: compact.format, money: money.format,
    percent: n => percent.format(n / 100), time: time.format, day: day.format, full: full.format }
}
