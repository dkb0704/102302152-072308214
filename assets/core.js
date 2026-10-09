/* Shared pure rules: usable from file:// and Node's test runner. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CampusCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = ['校园卡', '钥匙', '数码', '生活用品', '书籍', '其他'];
  class ValidationError extends Error {
    constructor(fields) { super(Object.values(fields)[0] || '请检查输入'); this.fields = fields; }
  }
  function validate(input, now = new Date().toISOString()) {
    const fields = {}, p = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ValidationError({form:'信息格式不正确'});
    for (const [key, label, max, required] of [
      ['name','物品名称',40,true], ['place','地点',60,true],
      ['contact','联系方式',100,true], ['description','物品描述',500,false]
    ]) {
      const value = input[key] == null ? '' : input[key];
      if (typeof value !== 'string') { fields[key] = `${label}格式不正确`; p[key]=''; continue; }
      p[key] = value.trim();
      if (required && !p[key]) fields[key] = `请填写${label}`;
      else if ([...p[key]].length > max) fields[key] = `${label}最多${max}字`;
    }
    p.type = input.type; p.category = input.category;
    if (!['lost','found'].includes(p.type)) fields.type = '请选择寻物或招领';
    if (!categories.includes(p.category)) fields.category = '请选择物品类别';
    const t = input.occurredAt;
    // Require an explicit timezone and reject dates JS would silently normalize.
    const match = typeof t === 'string' && t.match(/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
    const millis = Date.parse(t);
    let validDay = false;
    if (match) {
      const y=+match[1], m=+match[2], d=+match[3];
      const days=new Date(Date.UTC(y,m,0)).getUTCDate();
      validDay=m>=1 && m<=12 && d>=1 && d<=days;
    }
    if (!match || !validDay || !Number.isFinite(millis)) fields.occurredAt = '请选择有效的日期和时间';
    else if (millis > Date.parse(now)) fields.occurredAt = '发生时间不能晚于当前时间';
    else p.occurredAt = new Date(millis).toISOString();
    if (Object.keys(fields).length) throw new ValidationError(fields);
    return p;
  }
  function query(items, filters = {}) {
    const keyword = String(filters.keyword || '').trim().toLocaleLowerCase();
    if (filters.search && !keyword) throw new ValidationError({keyword:'请输入物品名称后搜索'});
    return items.filter(p =>
      (filters.includeClosed || p.status === 'active') &&
      (!filters.type || p.type === filters.type) &&
      (!filters.category || p.category === filters.category) &&
      (!filters.place || p.place.includes(filters.place.trim())) &&
      (!filters.mine || p.isMine) &&
      (!keyword || p.name.toLocaleLowerCase().includes(keyword))
    ).slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }
  function close(item, ownerId) {
    if (!ownerId || item.ownerId !== ownerId) throw new Error('只有发布者可以修改状态');
    if (item.status !== 'active') throw new Error('这条信息已经结束');
    return {...item, status:'closed'};
  }
  function statusText(p) {
    return p.type === 'lost' ? (p.status === 'active' ? '寻找中' : '已找回') : (p.status === 'active' ? '待认领' : '已归还');
  }
  return {categories, ValidationError, validate, query, close, statusText};
});
