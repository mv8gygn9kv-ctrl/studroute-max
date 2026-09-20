import { getUpdates, sendMessage, setCommands } from './max-api.js';

const sourceKeyboard = {
  type: 'inline_keyboard',
  payload: {
    buttons: [
      [
        {
          type: 'link',
          text: 'СПбГЭУ: правила',
          url: 'https://unecon.ru/mezhdunarodnye-svyazi/upravlenie-mezhdunarodnogo-sotrudnichestva/otdel-po-rabote-s-inostrannymi-uchashhimisya/'
        }
      ],
      [
        {
          type: 'link',
          text: 'Миграционный учёт СПб',
          url: 'https://gu.spb.ru/188429/'
        }
      ]
    ]
  }
};

function userIdFromUpdate(update) {
  return update?.user?.user_id
    ?? update?.message?.sender?.user_id
    ?? update?.callback?.user?.user_id
    ?? update?.callback?.message?.sender?.user_id
    ?? null;
}

function textFromUpdate(update) {
  return update?.message?.body?.text?.trim?.() || '';
}

async function welcome(userId) {
  const text = [
    '👋 **СтудМаршрут**',
    '',
    'Помогаю иностранному студенту СПбГЭУ не пропустить административные шаги после приезда: миграционный учёт, обязательные процедуры, продление визы/регистрации и действия после смены адреса или нового въезда.',
    '',
    'Откройте мини-приложение кнопкой **«Открыть» / «Старт»** в интерфейсе этого бота и соберите персональный маршрут.',
    '',
    '_MVP не заменяет официальное решение ведомства. В каждой задаче показывается источник и дата проверки._'
  ].join('\n');
  await sendMessage(userId, text);
}


async function welcomeZh(userId) {
  const text = [
    '👋 **学生路线（СтудМаршрут）**',
    '',
    '帮助СПбГЭУ国际学生在抵达俄罗斯后不遗漏关键行政手续：移民登记、必要程序、签证/登记延期，以及搬家或再次入境后的后续步骤。',
    '',
    '请在机器人界面点击 **«Открыть» / «Старт»** 打开小程序，然后在右上角切换到 **中文** 并生成个人路线。',
    '',
    '_本MVP不构成政府部门的正式决定。每项任务都会显示信息来源和核验日期。_'
  ].join('\n');
  await sendMessage(userId, text);
}

async function helpZh(userId) {
  await sendMessage(userId, [
    '**中文帮助**',
    '/start — 俄语说明',
    '/zh — 中文说明',
    '/sources — 官方来源',
    '/demo — 演示场景',
    '/help — 帮助',
    '',
    '主要流程在MAX小程序中完成。小程序支持 Русский / English / 中文。'
  ].join('\n'));
}

async function help(userId) {
  await sendMessage(userId, [
    '**Команды**',
    '/start — начать',
    '/sources — официальные источники',
    '/demo — что показать жюри',
    '/help — помощь',
    '',
    'Основной сценарий проходит в мини-приложении MAX.'
  ].join('\n'));
}

async function sources(userId) {
  await sendMessage(userId, 'Официальные источники MVP. В мини-приложении они привязаны к каждой задаче.', [sourceKeyboard]);
}

async function demo(userId) {
  await sendMessage(userId, [
    '**Демо за 60 секунд**',
    '1. Откройте мини-приложение.',
    '2. Выберите: общежитие, пребывание > 90 дней, требуется виза.',
    '3. Укажите дату въезда и даты окончания документов.',
    '4. Получите отсортированный маршрут с дедлайнами.',
    '5. Отметьте задачу выполненной и поделитесь маршрутом через MAX.',
    '6. В разделе «Событие» укажите переезд или новый паспорт — маршрут добавит срочный следующий шаг.'
  ].join('\n'));
}

export async function processUpdate(update) {
  const userId = userIdFromUpdate(update);
  if (!userId) return;

  if (update.update_type === 'bot_started') {
    await welcome(userId);
    return;
  }


  if (update.update_type === 'message_created') {
    const text = textFromUpdate(update).toLowerCase();
    if (text === '/start' || text === 'старт') return welcome(userId);
    if (text === '/help' || text === 'помощь') return help(userId);
    if (text === '/zh' || text === '中文' || text.includes('中文')) return welcomeZh(userId);
    if (text === '/sources' || text.includes('источник')) return sources(userId);
    if (text === '/demo' || text.includes('демо')) return demo(userId);
    await sendMessage(userId, 'Основной маршрут находится в мини-приложении. Нажмите «Открыть» / «Старт» в интерфейсе бота. Для справки: /help');
  }
}

export async function initBot() {
  if (!process.env.BOT_TOKEN) {
    console.log('[bot] BOT_TOKEN is not set; bot transport disabled');
    return;
  }
  try {
    await setCommands([
      { name: 'start', description: 'Начать работу' },
      { name: 'sources', description: 'Официальные источники' },
      { name: 'demo', description: 'Сценарий демонстрации' },
      { name: 'help', description: 'Помощь' },
      { name: 'zh', description: '中文说明' }
    ]);
    console.log('[bot] commands configured');
  } catch (err) {
    console.error('[bot] command setup failed:', err.message);
  }
}

export async function startPolling() {
  let marker = null;
  console.log('[bot] polling started (development mode)');
  while (true) {
    try {
      const data = await getUpdates(marker);
      for (const update of data.updates || []) {
        try { await processUpdate(update); }
        catch (err) { console.error('[bot] update failed:', err.message); }
      }
      if (data.marker != null) marker = data.marker;
    } catch (err) {
      console.error('[bot] polling error:', err.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
