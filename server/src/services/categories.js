const defaultTaskCategories = ['跑腿代办', '学业互助', '技能服务', '其他互助'];
const defaultGoodsCategories = [
  { name: '数码', children: ['手机平板', '电脑配件', '影音设备'] },
  { name: '书籍', children: ['教材教辅', '考试资料', '课外读物'] },
  { name: '服饰', children: ['上衣', '鞋包', '配饰'] },
  { name: '生活用品', children: ['宿舍日用', '运动户外', '小家电'] }
];

function uniqueStrings(values) {
  const seen = new Set();
  return values
    .map((item) => String(item || '').trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function normalizeTaskCategories(settings = {}, tasks = []) {
  const configured = Array.isArray(settings.taskCategories) ? settings.taskCategories : defaultTaskCategories;
  const fromTasks = tasks.map((item) => item.type);
  return uniqueStrings(['全部', ...configured, ...fromTasks]);
}

function normalizeGoodsCategory(item) {
  if (typeof item === 'string') return { name: item, children: [] };
  if (!item || typeof item !== 'object') return null;
  const name = String(item.name || '').trim();
  if (!name) return null;
  return {
    name,
    children: uniqueStrings(Array.isArray(item.children) ? item.children : [])
  };
}

function normalizeGoodsCategories(settings = {}, goods = []) {
  const source = Array.isArray(settings.goodsCategories) && settings.goodsCategories.length ? settings.goodsCategories : defaultGoodsCategories;
  const categories = source.map(normalizeGoodsCategory).filter(Boolean);
  const seen = new Set(categories.map((item) => item.name));
  goods.forEach((item) => {
    const name = String(item.category || '').trim();
    if (name && !seen.has(name)) {
      categories.push({ name, children: [] });
      seen.add(name);
    }
  });
  return categories;
}

function getCategorySettings(data) {
  const settings = data.settings || {};
  return {
    taskCategories: normalizeTaskCategories(settings, data.tasks || []),
    goodsCategories: normalizeGoodsCategories(settings, data.goods || [])
  };
}

module.exports = {
  defaultTaskCategories,
  defaultGoodsCategories,
  getCategorySettings,
  normalizeGoodsCategories,
  normalizeTaskCategories
};
